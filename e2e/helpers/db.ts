import postgres from "postgres";
import { config as loadEnv } from "dotenv";

// ADR 0028 review (Correction Pass 3, item 1) — E2E test safety, P0.
//
// This suite writes and deletes rows. It must therefore be IMPOSSIBLE to point
// it at production, even by accident. So:
//   - we load ONLY `.env.test.local` (never `.env.local` / `.env.production.local`);
//   - we use a dedicated `E2E_DATABASE_URL` (never the app's `DATABASE_URL`);
//   - the database must be explicitly marked disposable via `E2E_DB_IS_TEST=1`;
//   - anything that looks like production is refused centrally, here, at import
//     time — before any spec can run a single query.
// There is no ALLOW_PROD override for destructive tests.

loadEnv({ path: ".env.test.local", override: false });

function assertTestDatabase(): string {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) {
    throw new Error(
      "E2E_DATABASE_URL is not set. E2E tests refuse to run without a dedicated, " +
        "disposable test database. Create `.env.test.local` with E2E_DATABASE_URL and E2E_DB_IS_TEST=1.",
    );
  }
  if (process.env.E2E_DB_IS_TEST !== "1") {
    throw new Error(
      "E2E_DB_IS_TEST must equal '1' to confirm E2E_DATABASE_URL points at a disposable test database.",
    );
  }
  // Defence in depth: reject anything that smells like production regardless of
  // the marker above.
  if (/epetrecere\.md|prod|production/i.test(url)) {
    throw new Error("E2E_DATABASE_URL looks like a production database — refusing to run.");
  }
  return url;
}

const E2E_DATABASE_URL = assertTestDatabase();

/**
 * Shared SQL client for E2E tests, bound to the dedicated test database.
 * Tagged-template usage is unchanged (`sql\`...\``); tests MUST clean up
 * anything they write so the suite stays re-runnable.
 */
export const sql = postgres(E2E_DATABASE_URL, { max: 4 });

/**
 * Guarded base URL for HTTP requests. Never falls back to production. Defaults
 * to the local dev server; set E2E_BASE_URL to target a disposable environment.
 * Destructive specs additionally refuse a production host.
 */
export function testBaseUrl(): string {
  const base = process.env.E2E_BASE_URL || "http://localhost:3000";
  if (/epetrecere\.md/i.test(base)) {
    throw new Error("E2E_BASE_URL points at production — refusing to run destructive E2E there.");
  }
  return base;
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
