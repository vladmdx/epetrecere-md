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

  // A build is not a serverless request and must not be sized like one.
  // `next build` is a single long-lived process rendering 1500+ pages, and it
  // gives each one 60 seconds; with a single socket every query on a page
  // queues behind the last, which across an ocean is enough to blow that
  // budget — it took four production deploys down before this was found.
  // At runtime the reasoning is unchanged: one socket per serverless
  // instance, because the pooler is what multiplexes and stacking a local
  // pool on top of it only moves the exhaustion problem.
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";

  const client = postgres(url, {
    ssl: "require",
    prepare: false,
    max: isBuild ? 8 : 1,
    idle_timeout: 20,
    // The smallest Supabase instance can take seconds just to hand over a
    // connection; 10s left no room for that before the first query even ran.
    connect_timeout: isBuild ? 30 : 15,
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
