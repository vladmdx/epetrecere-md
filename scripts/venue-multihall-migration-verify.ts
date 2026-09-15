/**
 * Verifies migration 0028 from a genuine pre-0028 disposable baseline.
 *
 * The old harness queried new columns before the first apply, so it could only
 * pass against an already-migrated DB. This version refuses that state, creates
 * fixtures with legacy columns, applies twice, and verifies invariants.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { e2eDatabaseConfig, verifyE2EDatabase } from "../e2e/helpers/safety";

const config = e2eDatabaseConfig();
process.env.DATABASE_URL = config.url;
process.env.E2E_RUNTIME = "1";

const client = postgres(config.url, { max: 1, prepare: false });
const migration = "src/lib/db/migrations/manual/0028_partner_organizations_venues_halls.sql";
const output: string[] = [];
const log = (message: string) => {
  output.push(message);
  console.log(message);
};

async function scalar(query: ReturnType<typeof client>): Promise<string> {
  const rows = await query;
  return String(Object.values(rows[0] ?? { value: "0" })[0]);
}

function apply(label: string) {
  log(`-- ${label}`);
  execFileSync("npx", ["tsx", "scripts/apply-sql-file.ts", migration], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: config.url },
    stdio: "pipe",
  });
}

async function legacyEvidence() {
  return {
    venueCount: await scalar(client`SELECT count(*) FROM venues`),
    bookingCount: await scalar(client`SELECT count(*) FROM booking_requests`),
    commissionTotal: await scalar(client`SELECT COALESCE(sum(amount), 0) FROM commissions`),
    legalCount: await scalar(client`SELECT count(*) FROM legal_acceptances`),
    legalChecksum: await scalar(client`
      SELECT COALESCE(md5(string_agg(
        concat_ws('|', id::text, content_hash, signature_name, signature_image),
        ',' ORDER BY id
      )), 'none')
      FROM legal_acceptances
    `),
  };
}

async function migratedCounts() {
  return {
    ...(await legacyEvidence()),
    organizationCount: await scalar(client`SELECT count(*) FROM partner_organizations`),
    membershipCount: await scalar(client`SELECT count(*) FROM partner_organization_members`),
    hallCount: await scalar(client`SELECT count(*) FROM venue_halls`),
    menuSetCount: await scalar(client`SELECT count(*) FROM venue_menu_sets`),
    blockCount: await scalar(client`SELECT count(*) FROM venue_schedule_blocks`),
    reviewCaseCount: await scalar(client`SELECT count(*) FROM partner_admin_review_cases`),
  };
}

async function main() {
  const [state] = await client<{ has_table: boolean; has_column: boolean }[]>`
    SELECT
      to_regclass('public.partner_organizations') IS NOT NULL AS has_table,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'venues'
          AND column_name = 'organization_id'
      ) AS has_column
  `;
  if (state?.has_table || state?.has_column) {
    throw new Error(
      "Migration verification requires a disposable pre-0028 baseline; this database is already migrated.",
    );
  }

  const fixture = `cp4-migration-${Date.now()}`;
  const [owner] = await client<{ id: string }[]>`
    INSERT INTO users (clerk_id, email, name)
    VALUES (${fixture + "-owner"}, ${fixture + "-owner@example.com"}, 'CP4 Owner')
    RETURNING id
  `;
  const [representative] = await client<{ id: string }[]>`
    INSERT INTO users (clerk_id, email, name)
    VALUES (${fixture + "-representative"}, ${fixture + "-representative@example.com"}, 'CP4 Representative')
    RETURNING id
  `;
  const [venue] = await client<{ id: number }[]>`
    INSERT INTO venues (user_id, name_ro, slug, email, is_active)
    VALUES (${owner.id}, 'CP4 migration fixture', ${fixture}, ${fixture + "@example.com"}, false)
    RETURNING id
  `;
  const [ownerlessVenue] = await client<{ id: number }[]>`
    INSERT INTO venues (name_ro, slug, is_active)
    VALUES ('CP4 ownerless fixture', ${fixture + "-ownerless"}, false)
    RETURNING id
  `;
  const legalRows = await client<{ id: number }[]>`
    INSERT INTO legal_acceptances
      (user_id, subject_type, venue_id, document_slug, document_version,
       pack_version, locale, signature_name, signature_image, content_hash, accepted_at)
    VALUES
      (${owner.id}, 'venue', ${venue.id}, 'venue-agreement', 'cp4-test',
       'cp4-test', 'ro', 'CP4 Owner', 'data:image/png;base64,OWNER', 'cp4-owner-hash', now() - interval '1 minute'),
      (${representative.id}, 'venue', ${venue.id}, 'venue-agreement', 'cp4-test',
       'cp4-test', 'ro', 'CP4 Representative', 'data:image/png;base64,REP', 'cp4-rep-hash', now())
    RETURNING id
  `;
  const [overnight] = await client<{ id: number }[]>`
    INSERT INTO booking_requests
      (venue_id, client_name, client_phone, event_date, start_time, end_time,
       status, agreed_price, confirmed_at)
    VALUES
      (${venue.id}, 'cp4-overnight', '+37360000000', DATE '2027-05-01', '22:00', '02:00',
       'completed', 1000, now())
    RETURNING id
  `;
  const [fullDay] = await client<{ id: number }[]>`
    INSERT INTO booking_requests
      (venue_id, client_name, client_phone, event_date, status)
    VALUES
      (${venue.id}, 'cp4-full-day', '+37360000000', DATE '2027-05-02', 'completed')
    RETURNING id
  `;
  await client`
    INSERT INTO commissions
      (booking_request_id, vendor_type, venue_id, base_amount, amount, status)
    VALUES (${overnight.id}, 'venue', ${venue.id}, 1000, 50, 'pending')
  `;

  const before = await legacyEvidence();
  log(`before: ${JSON.stringify(before)}`);
  apply("apply #1 from baseline");
  const afterFirst = await migratedCounts();
  log(`after#1: ${JSON.stringify(afterFirst)}`);
  apply("apply #2 idempotence");
  const afterSecond = await migratedCounts();
  log(`after#2: ${JSON.stringify(afterSecond)}`);

  const intervals = await client<{ id: number; start_local: string; end_local: string }[]>`
    SELECT id,
      to_char(starts_at AT TIME ZONE 'Europe/Chisinau', 'YYYY-MM-DD HH24:MI') AS start_local,
      to_char(ends_at AT TIME ZONE 'Europe/Chisinau', 'YYYY-MM-DD HH24:MI') AS end_local
    FROM booking_requests
    WHERE id IN (${overnight.id}, ${fullDay.id})
    ORDER BY id
  `;
  const orphanCounts = {
    ownedVenuesWithoutOrg: await scalar(client`
      SELECT count(*) FROM venues WHERE user_id IS NOT NULL AND organization_id IS NULL
    `),
    venueBookingsWithoutHall: await scalar(client`
      SELECT count(*) FROM booking_requests WHERE venue_id IS NOT NULL AND hall_id IS NULL
    `),
    hallsWithoutVenue: await scalar(client`
      SELECT count(*) FROM venue_halls h
      WHERE NOT EXISTS (SELECT 1 FROM venues v WHERE v.id = h.venue_id)
    `),
  };
  const [venueBackfill] = await client<{
    organization_id: number | null;
    default_halls: number;
    owner_memberships: number;
  }[]>`
    SELECT v.organization_id,
      (SELECT count(*)::int FROM venue_halls h
       WHERE h.venue_id = v.id AND h.is_legacy_default) AS default_halls,
      (SELECT count(*)::int FROM partner_organization_members m
       WHERE m.organization_id = v.organization_id AND m.user_id = ${owner.id}
         AND m.role = 'owner' AND m.is_active) AS owner_memberships
    FROM venues v WHERE v.id = ${venue.id}
  `;
  const [evidenceBackfill] = await client<{
    linked: number;
    unlinked: number;
    unchanged: number;
  }[]>`
    SELECT
      count(*) FILTER (WHERE organization_id = ${venueBackfill.organization_id})::int AS linked,
      count(*) FILTER (WHERE organization_id IS NULL)::int AS unlinked,
      count(*) FILTER (WHERE
        (signature_name = 'CP4 Owner' AND signature_image = 'data:image/png;base64,OWNER' AND content_hash = 'cp4-owner-hash')
        OR
        (signature_name = 'CP4 Representative' AND signature_image = 'data:image/png;base64,REP' AND content_hash = 'cp4-rep-hash')
      )::int AS unchanged
    FROM legal_acceptances
    WHERE id IN (${legalRows[0].id}, ${legalRows[1].id})
  `;
  const [commissionBackfill] = await client<{
    hall_id: number | null;
    hall_name_snapshot: string | null;
    venue_name_snapshot: string | null;
  }[]>`
    SELECT hall_id, hall_name_snapshot, venue_name_snapshot
    FROM commissions WHERE booking_request_id = ${overnight.id}
  `;
  const [reviewBackfill] = await client<{ count: number }[]>`
    SELECT count(*)::int AS count FROM partner_admin_review_cases
    WHERE venue_id = ${ownerlessVenue.id} AND reason = 'no_owner_no_org' AND status = 'pending'
  `;

  const failures: string[] = [];
  for (const key of Object.keys(afterFirst) as Array<keyof typeof afterFirst>) {
    if (afterFirst[key] !== afterSecond[key]) {
      failures.push(`idempotence drift: ${key} ${afterFirst[key]} -> ${afterSecond[key]}`);
    }
  }
  if (before.commissionTotal !== afterSecond.commissionTotal) failures.push("commission total changed");
  if (before.legalCount !== afterSecond.legalCount) failures.push("legal row count changed");
  if (before.legalChecksum !== afterSecond.legalChecksum) failures.push("legal evidence changed");
  for (const [key, value] of Object.entries(orphanCounts)) {
    if (value !== "0") failures.push(`${key}=${value}`);
  }
  const overnightRow = intervals.find((row) => row.id === overnight.id);
  const fullDayRow = intervals.find((row) => row.id === fullDay.id);
  if (overnightRow?.start_local !== "2027-05-01 22:00" || overnightRow?.end_local !== "2027-05-02 02:00") {
    failures.push(`overnight interval incorrect: ${JSON.stringify(overnightRow)}`);
  }
  if (fullDayRow?.start_local !== "2027-05-02 00:00" || fullDayRow?.end_local !== "2027-05-03 00:00") {
    failures.push(`full-day interval incorrect: ${JSON.stringify(fullDayRow)}`);
  }
  if (!venueBackfill.organization_id) failures.push("owned venue was not linked to an organization");
  if (venueBackfill.default_halls !== 1) failures.push(`default_halls=${venueBackfill.default_halls}`);
  if (venueBackfill.owner_memberships !== 1) failures.push(`owner_memberships=${venueBackfill.owner_memberships}`);
  if (evidenceBackfill.linked !== 0 || evidenceBackfill.unlinked !== 2) {
    failures.push(`legacy legal evidence was re-scoped: ${JSON.stringify(evidenceBackfill)}`);
  }
  if (evidenceBackfill.unchanged !== 2) failures.push("fixture signature/hash evidence changed");
  if (!commissionBackfill.hall_id || !commissionBackfill.hall_name_snapshot || !commissionBackfill.venue_name_snapshot) {
    failures.push(`commission snapshots missing: ${JSON.stringify(commissionBackfill)}`);
  }
  if (reviewBackfill.count !== 1) failures.push(`ownerless review cases=${reviewBackfill.count}`);

  await client`DELETE FROM commissions WHERE booking_request_id = ${overnight.id}`;
  await client`DELETE FROM booking_requests WHERE id IN (${overnight.id}, ${fullDay.id})`;
  await client`DELETE FROM venues WHERE id IN (${venue.id}, ${ownerlessVenue.id})`;
  if (venueBackfill.organization_id) {
    await client`DELETE FROM partner_organizations WHERE id = ${venueBackfill.organization_id}`;
  }
  await client`DELETE FROM users WHERE id IN (${owner.id}, ${representative.id})`;

  log(`orphans: ${JSON.stringify(orphanCounts)}`);
  log(`venue backfill: ${JSON.stringify(venueBackfill)}`);
  log(`legal backfill: ${JSON.stringify(evidenceBackfill)}`);
  log(`commission backfill: ${JSON.stringify(commissionBackfill)}`);
  log(`ownerless review: ${JSON.stringify(reviewBackfill)}`);
  log(failures.length ? `RESULT: FAIL\n${failures.join("\n")}` : "RESULT: PASS");
  const artifact = join(tmpdir(), "epetrecere-cp4-migration-verify.txt");
  writeFileSync(artifact, `${output.join("\n")}\n`);
  log(`artifact: ${artifact}`);
  if (failures.length) process.exitCode = 1;
}

async function run() {
  await verifyE2EDatabase(config);
  try {
    await main();
  } finally {
    await client.end({ timeout: 1 });
  }
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
