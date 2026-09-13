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

  if (process.env.E2E_RUNTIME === "1") {
    const expected = process.env.E2E_DATABASE_URL;
    if (!expected || expected !== url) {
      throw new Error(
        "E2E runtime database mismatch: DATABASE_URL must equal E2E_DATABASE_URL.",
      );
    }
    const host = new URL(url).hostname;
    if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
      throw new Error("E2E runtime refuses a non-loopback database.");
    }
  }

  if (isNeon(url)) return drizzleNeon(neon(url), { schema });

  const requestedE2EPoolMax = Number(process.env.E2E_DB_POOL_MAX ?? "8");
  if (
    process.env.E2E_RUNTIME === "1"
    && (!Number.isInteger(requestedE2EPoolMax)
      || requestedE2EPoolMax < 1
      || requestedE2EPoolMax > 8)
  ) {
    throw new Error("E2E_DB_POOL_MAX must be an integer from 1 to 8.");
  }

  // Runtime gets exactly two sockets; production builds get four. A single
  // runtime socket can strand even tiny concurrent reads behind the Supabase
  // transaction pooler. Two is the smallest pool that lets one stalled
  // checkout make progress without opening an unsafe number of connections
  // across many serverless instances. Callers must still serialize related
  // reads rather than treating the second socket as permission for query
  // bursts.
  //
  // Raising this to 8 for builds made things worse: Next.js forks a worker per
  // core and each one opens its own pool, so 8 became 16 or 32 against a plan
  // whose pooler allows 15. Past that, `postgres` does not fail — it waits.
  // Four remains the measured build compromise; two is the runtime safety
  // floor.
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

  const host = new URL(connectionUrl).hostname;
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(host);
  const client = postgres(connectionUrl, {
    // Loopback disposable databases used by multi-hall tests have no TLS.
    // Hosted Postgres (Supabase/Neon session) still requires it.
    ssl: loopback ? false : "require",
    prepare: false,
    max: isBuild
      ? 4
      : process.env.E2E_RUNTIME === "1"
        ? requestedE2EPoolMax
        : 2,
    // Do not lower the driver's global pipeline limit: in postgres.js 3.4.9
    // that same boundary controls the BEGIN reservation hook, so low values
    // can make transactions unsafe or leave a queued BEGIN stalled. Critical
    // read paths avoid bursts at the caller by serializing or combining SQL.
    idle_timeout: 20,
    connect_timeout: 20,
    connection: {
      // This startup setting is useful for direct/session-compatible
      // connections, but is not a runtime deadline on Supavisor transaction
      // mode: its 6543 endpoint ignores this startup override and currently
      // reports a two-minute statement_timeout. Runtime safety therefore
      // comes from bounded sockets, serial/combined reads, and caller
      // fallbacks rather than from this value.
      //
      // Racing a query against a timer in JavaScript does not: the promise is
      // abandoned but the driver still holds the socket until the query
      // finishes, so each expiry permanently costs a connection. Do that a
      // few times against a small pool and every later query waits forever —
      // which is precisely the 300-second page hangs, and they got worse as I
      // narrowed the pool, because a smaller pool drains sooner.
      //
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
