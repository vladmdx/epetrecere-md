import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.production.local", override: false });
loadEnv({ path: ".env.local", override: false });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set — cannot run e2e tests");
}

/**
 * Shared Neon SQL client for e2e tests. Always resolves tagged-template
 * queries; use `sql\`...\`` directly. Tests MUST clean up anything they
 * write so the suite is re-runnable.
 */
export const sql: NeonQueryFunction<false, false> = neon(
  process.env.DATABASE_URL,
);

/**
 * Canonical test fixtures — these are the DB identities of the two Clerk
 * personas (`igor` = artist, `client` = event-plan owner). They're looked
 * up by email so a re-seed that bumps IDs won't break the suite.
 */
export async function getTestUsers() {
  const rows = await sql`
    select id, clerk_id, email, role
    from users
    where email in ('igor.nedoseikin@epetrecere.md', 'client.test@epetrecere.md')
  `;
  const byEmail = Object.fromEntries(
    rows.map((r) => [r.email as string, r] as const),
  );
  const igor = byEmail["igor.nedoseikin@epetrecere.md"];
  const client = byEmail["client.test@epetrecere.md"];
  if (!igor || !client) {
    throw new Error(
      "Test users missing from DB — re-run seed or fix /api/dev/sign-in-token mapping",
    );
  }
  return { igor, client };
}

/**
 * Igor's artist row. Exists once; we cache per-process.
 */
let _artistCache:
  | { id: number; slug: string; userId: string }
  | undefined;
export async function getIgorArtist() {
  if (_artistCache) return _artistCache;
  const { igor } = await getTestUsers();
  const [row] = await sql`
    select id, slug, user_id from artists where user_id = ${igor.id} limit 1
  `;
  if (!row) {
    throw new Error("Igor has no artist row in DB");
  }
  _artistCache = { id: row.id as number, slug: row.slug as string, userId: row.user_id as string };
  return _artistCache;
}
