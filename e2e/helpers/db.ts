import postgres from "postgres";
import {
  e2eDatabaseConfig,
  localE2EBaseUrl,
  verifyE2EDatabase,
} from "./safety";

// ADR 0028 review (Correction Pass 4) — E2E test safety, P0.
//
// This suite writes and deletes rows. It must therefore be IMPOSSIBLE to point
// it at production, even by accident. So:
//   - we load ONLY `.env.test.local` (never `.env.local` / `.env.production.local`);
//   - we use a dedicated `E2E_DATABASE_URL` (never the app's `DATABASE_URL`);
//   - the DB host must be loopback and its stored marker must exactly match
//     `E2E_DB_MARKER`, before any spec can run a single query;
//   - Playwright starts its own app server against that exact same URL.
// There is no ALLOW_PROD override for destructive tests.

const { url: E2E_DATABASE_URL } = e2eDatabaseConfig();
const databaseVerified = verifyE2EDatabase();

/**
 * Shared SQL client for E2E tests, bound to the dedicated test database.
 * Tagged-template usage is unchanged (`sql\`...\``); tests MUST clean up
 * anything they write so the suite stays re-runnable.
 */
const unguardedSql = postgres(E2E_DATABASE_URL, { max: 4, prepare: false });
export const sql = new Proxy(unguardedSql, {
  apply(target, thisArg, args) {
    return databaseVerified.then(() => Reflect.apply(target, thisArg, args));
  },
});

/**
 * Guarded base URL for HTTP requests. Never falls back to production. Defaults
 * to the isolated local server. Remote URLs are always refused.
 */
export function testBaseUrl(): string {
  return localE2EBaseUrl();
}

/**
 * Canonical test fixtures — the DB identities of the two Clerk personas
 * (`igor` = artist, `client` = event-plan owner), looked up by email.
 */
export async function getTestUsers() {
  const rows = await sql`
    select id, clerk_id, email, role
    from users
    where email in ('igor.nedoseikin@epetrecere.md', 'client.test@epetrecere.md')
  `;
  const byEmail = Object.fromEntries(rows.map((r) => [r.email as string, r] as const));
  const igor = byEmail["igor.nedoseikin@epetrecere.md"];
  const client = byEmail["client.test@epetrecere.md"];
  if (!igor || !client) {
    throw new Error(
      "Test users missing from DB — re-run seed or fix /api/dev/sign-in-token mapping",
    );
  }
  return { igor, client };
}

/** Igor's artist row. Exists once; cached per-process. */
let _artistCache: { id: number; slug: string; userId: string } | undefined;
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
