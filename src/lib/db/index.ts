import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Picks the driver from the connection string rather than at build time, so
 * moving between hosts is a change of DATABASE_URL and nothing else.
 *
 * Neon is reached over its HTTP driver: there is no connection to keep alive,
 * which is what lets it survive a serverless platform running hundreds of
 * short-lived instances. Everything else — Supabase included — speaks the
 * ordinary wire protocol and goes through postgres.js.
 *
 * On Supabase, point DATABASE_URL at the pooler (port 6543, transaction
 * mode). A direct connection on 5432 exhausts the project's connections under
 * any real traffic from Vercel. Transaction mode also cannot use prepared
 * statements, hence `prepare: false` — without it queries start failing
 * intermittently once the pooler reuses backends, which is a miserable thing
 * to diagnose in production.
 */
function isNeon(url: string) {
  return url.includes("neon.tech");
}

type Db = ReturnType<typeof drizzleNeon<typeof schema>>;

function createDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  if (isNeon(url)) return drizzleNeon(neon(url), { schema });

  // Two sockets, and no more — during a build as much as at runtime.
  //
  // Raising this to 8 for builds seemed obvious and made things worse: Next.js
  // forks a worker per core and each one opens its own pool, so 8 became 16 or
  // 32 against a plan whose pooler allows 15. Past that, `postgres` does not
  // fail — it waits. A page then hangs rather than erroring, which is how
  // /servicii sat for five full minutes on a query that takes 71ms.
  //
  // The queries were never the problem. Measured against production: 71ms for
  // the per-category counts, 79ms for the bookings tally, on tables of 10 and
  // 29 rows. Contention was the problem, and the cure for contention is not
  // more connections.
  /**
   * Builds go through the session pooler, requests through the transaction
   * pooler. Same database, different port, and the difference is decisive.
   *
   * Transaction mode is right for serverless: a connection is borrowed per
   * statement and handed straight back, which is what lets hundreds of short
   * lived instances share a small pool. A build is the opposite shape of
   * workload — one process issuing thousands of sequential queries — and
   * against it the transaction pooler stalls. Measured, same commit, same
   * machine: on 6543 the build hangs partway with pages timing out after five
   * minutes each; on 5432 it completes 460/460 with none. Neon never showed
   * this because its HTTP driver has no pooler in the path at all.
   *
   * Deriving the build URL here rather than adding a second environment
   * variable keeps one source of truth: DATABASE_URL stays the runtime value,
   * and nobody has to remember to change two things when the password rotates.
   */
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
  const connectionUrl =
    isBuild && url.includes(".pooler.supabase.com:6543")
      ? url.replace(".pooler.supabase.com:6543", ".pooler.supabase.com:5432")
      : url;

  const client = postgres(connectionUrl, {
    ssl: "require",
    prepare: false,
    max: isBuild ? 4 : 1,
    idle_timeout: 20,
    connect_timeout: 20,
    connection: {
      // The database cancels its own slow queries, and this is the only kind
      // of timeout that actually frees the connection.
      //
      // Racing a query against a timer in JavaScript does not: the promise is
      // abandoned but the driver still holds the socket until the query
      // finishes, so each expiry permanently costs a connection. Do that a
      // few times against a small pool and every later query waits forever —
      // which is precisely the 300-second page hangs, and they got worse as I
      // narrowed the pool, because a smaller pool drains sooner.
      //
      // A server-side statement_timeout ends the query, returns an error the
      // caller can catch, and puts the connection back.
      statement_timeout: 20_000,
    },
  });
  // The two drivers expose the same query surface; the driver-specific halves
  // of the type are not used anywhere in this codebase.
  return drizzlePg(client, { schema }) as unknown as Db;
}

let _db: Db | null = null;

export function getDb() {
  if (!_db) _db = createDb();
  return _db;
}

/** Alias for convenience — lazy-initialized */
export const db = new Proxy({} as Db, {
  get(_, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export type Database = Db;
