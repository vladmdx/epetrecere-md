/**
 * ADR 0028 / Correction Pass 3 — migration verification harness.
 *
 * Runs migration 0028 TWICE against the local (isolated) database and checks:
 *   - row counts before/after (idempotence: unchanged on the 2nd run);
 *   - zero orphans across the new tables;
 *   - legal_acceptances hashes/signatures unchanged;
 *   - commission totals unchanged;
 *   - overnight & full-day bookings backfill to half-open intervals.
 * Saves a report artifact to /opt/cursor/artifacts/cp3-migration-verify.txt.
 *
 * Refuses non-local DBs unless ALLOW_NONLOCAL_TEST_DB=1.
 * Run: DATABASE_URL=postgres://…localhost… npx tsx scripts/venue-multihall-migration-verify.ts
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "../src/lib/db";

const DB_URL = process.env.DATABASE_URL ?? "";
const isLocal = /@(localhost|127\.0\.0\.1|::1)[:/]/.test(DB_URL) || /host=(localhost|127\.0\.0\.1)/.test(DB_URL);
if (!isLocal && process.env.ALLOW_NONLOCAL_TEST_DB !== "1") {
  throw new Error("Refusing to run migration verify against a non-local database.");
}

const MIGRATION = "src/lib/db/migrations/manual/0028_partner_organizations_venues_halls.sql";
const out: string[] = [];
const log = (s: string) => { out.push(s); console.log(s); };

async function scalar(q: ReturnType<typeof sql>): Promise<string> {
  const r = (await db.execute(q)) as unknown as Array<Record<string, unknown>>;
  return String(Object.values(r[0] ?? { v: "0" })[0]);
}
function applyMigration(label: string) {
  log(`-- apply ${label}`);
  execFileSync("npx", ["tsx", "scripts/apply-sql-file.ts", MIGRATION], { stdio: "pipe", env: process.env });
}

async function counts(label: string) {
  const c = {
    venues: await scalar(sql`SELECT count(*) FROM venues`),
    orgs: await scalar(sql`SELECT count(*) FROM partner_organizations`),
    members: await scalar(sql`SELECT count(*) FROM partner_organization_members`),
    halls: await scalar(sql`SELECT count(*) FROM venue_halls`),
    default_halls: await scalar(sql`SELECT count(*) FROM venue_halls WHERE is_legacy_default`),
    menu_sets: await scalar(sql`SELECT count(*) FROM venue_menu_sets`),
    blocks: await scalar(sql`SELECT count(*) FROM venue_schedule_blocks`),
    review_cases: await scalar(sql`SELECT count(*) FROM partner_admin_review_cases`),
    commission_total: await scalar(sql`SELECT COALESCE(sum(amount),0) FROM commissions`),
    legal_hashes: await scalar(sql`SELECT COALESCE(md5(string_agg(content_hash, ',' ORDER BY id)),'none') FROM legal_acceptances`),
    legal_sigs: await scalar(sql`SELECT COALESCE(md5(string_agg(signature_name, ',' ORDER BY id)),'none') FROM legal_acceptances`),
  };
  log(`${label}: ${JSON.stringify(c)}`);
  return c;
}

async function orphans() {
  const checks: Record<string, string> = {
    halls_wo_venue: await scalar(sql`SELECT count(*) FROM venue_halls h WHERE NOT EXISTS (SELECT 1 FROM venues v WHERE v.id=h.venue_id)`),
    members_wo_org: await scalar(sql`SELECT count(*) FROM partner_organization_members m WHERE NOT EXISTS (SELECT 1 FROM partner_organizations o WHERE o.id=m.organization_id)`),
    owned_venues_wo_org: await scalar(sql`SELECT count(*) FROM venues WHERE user_id IS NOT NULL AND organization_id IS NULL`),
    venue_bookings_wo_hall: await scalar(sql`SELECT count(*) FROM booking_requests WHERE venue_id IS NOT NULL AND hall_id IS NULL`),
    hallmenu_wo_venue: await scalar(sql`SELECT count(*) FROM venue_hall_menu_sets WHERE venue_id IS NULL`),
  };
  log(`orphans: ${JSON.stringify(checks)}`);
  return checks;
}

async function main() {
  log(`# CP3 migration verify @ ${new Date().toISOString()}`);

  // Overnight + full-day fixtures (null intervals so the backfill fills them).
  const [{ id: venueId }] = (await db.execute(sql`SELECT id FROM venues ORDER BY id LIMIT 1`)) as unknown as Array<{ id: number }>;
  await db.execute(sql`INSERT INTO booking_requests (venue_id, client_name, client_phone, event_date, start_time, end_time, status, starts_at, ends_at)
    VALUES (${venueId}, 'cp3-overnight', '+3730', DATE '2027-05-01', '22:00', '02:00', 'completed', NULL, NULL)`);
  await db.execute(sql`INSERT INTO booking_requests (venue_id, client_name, client_phone, event_date, status, starts_at, ends_at)
    VALUES (${venueId}, 'cp3-fullday', '+3730', DATE '2027-05-02', 'completed', NULL, NULL)`);

  const before = await counts("before");
  applyMigration("run #1");
  const after1 = await counts("after#1");
  const orph1 = await orphans();
  applyMigration("run #2 (idempotence)");
  const after2 = await counts("after#2");

  // Overnight interval: ends_at must be the NEXT day 02:00 Chisinau (half-open).
  const overnight = (await db.execute(sql`
    SELECT to_char(starts_at AT TIME ZONE 'Europe/Chisinau','YYYY-MM-DD HH24:MI') AS s,
           to_char(ends_at   AT TIME ZONE 'Europe/Chisinau','YYYY-MM-DD HH24:MI') AS e
    FROM booking_requests WHERE client_name='cp3-overnight' LIMIT 1`)) as unknown as Array<{ s: string; e: string }>;
  const fullday = (await db.execute(sql`
    SELECT to_char(starts_at AT TIME ZONE 'Europe/Chisinau','YYYY-MM-DD HH24:MI') AS s,
           to_char(ends_at   AT TIME ZONE 'Europe/Chisinau','YYYY-MM-DD HH24:MI') AS e
    FROM booking_requests WHERE client_name='cp3-fullday' LIMIT 1`)) as unknown as Array<{ s: string; e: string }>;
  log(`overnight interval: ${JSON.stringify(overnight[0])}`);
  log(`full-day interval: ${JSON.stringify(fullday[0])}`);

  // Cleanup fixtures.
  await db.execute(sql`DELETE FROM booking_requests WHERE client_name IN ('cp3-overnight','cp3-fullday')`);

  // ── Assertions ──
  const fails: string[] = [];
  for (const k of Object.keys(after1) as Array<keyof typeof after1>) {
    if (after1[k] !== after2[k]) fails.push(`idempotence drift on ${k}: ${after1[k]} -> ${after2[k]}`);
  }
  if (before.commission_total !== after2.commission_total) fails.push(`commission total changed: ${before.commission_total} -> ${after2.commission_total}`);
  if (before.legal_hashes !== after2.legal_hashes) fails.push("legal content hashes changed");
  if (before.legal_sigs !== after2.legal_sigs) fails.push("legal signatures changed");
  for (const [k, v] of Object.entries(orph1)) if (v !== "0") fails.push(`orphan ${k}=${v}`);
  if (overnight[0]?.s !== "2027-05-01 22:00") fails.push(`overnight start wrong: ${overnight[0]?.s}`);
  if (overnight[0]?.e !== "2027-05-02 02:00") fails.push(`overnight end not next-day: ${overnight[0]?.e}`);
  if (fullday[0]?.s !== "2027-05-02 00:00") fails.push(`full-day start wrong: ${fullday[0]?.s}`);
  if (fullday[0]?.e !== "2027-05-03 00:00") fails.push(`full-day end not next-day 00:00: ${fullday[0]?.e}`);

  log(fails.length ? `RESULT: FAIL\n${fails.join("\n")}` : "RESULT: PASS — idempotent, zero orphans, legal + commissions unchanged, half-open intervals correct");

  mkdirSync("/opt/cursor/artifacts", { recursive: true });
  writeFileSync("/opt/cursor/artifacts/cp3-migration-verify.txt", out.join("\n") + "\n");

  if (fails.length) process.exit(1);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
