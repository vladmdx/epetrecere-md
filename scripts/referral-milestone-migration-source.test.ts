import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migrationPath =
  "src/lib/db/migrations/manual/0038_referral_event_atomicity.sql";
const verifierPath = "scripts/referral-milestone-migration-verify.ts";
const migration = readFileSync(migrationPath, "utf8");

test("0038 installs the exact live referral arbiter and only minimizes metadata", () => {
  assert.match(migration, /^BEGIN;/m);
  assert.match(migration, /SET LOCAL search_path = pg_catalog, public/);
  assert.match(migration, /COMMIT;\s*$/);
  assert.match(
    migration,
    /LOCK TABLE public\.referral_events IN ACCESS EXCLUSIVE MODE/,
  );
  assert.match(
    migration,
    /WHERE referrer_user_id IS NOT NULL[\s\S]*AND referred_user_id IS NOT NULL[\s\S]*GROUP BY referrer_user_id, referred_user_id, event_type[\s\S]*HAVING count\(\*\) > 1/,
  );
  assert.match(migration, /reconcile credits explicitly before retrying/);
  assert.match(
    migration,
    /CREATE UNIQUE INDEX referral_events_milestone_uidx[\s\S]*USING btree[\s\S]*referrer_user_id, referred_user_id, event_type/,
  );
  assert.match(migration, /index_catalog\.indisunique/);
  assert.match(migration, /NOT index_catalog\.indisprimary/);
  assert.match(migration, /NOT index_catalog\.indnullsnotdistinct/);
  assert.match(migration, /operator_class\.opcdefault/);
  assert.match(
    migration,
    /index_catalog\.indcollation\[key_position\.position\]/,
  );
  assert.match(migration, /refuses a same-name object not indexing/);
  assert.match(migration, /found non-canonical referral indexes/);
  assert.match(
    migration,
    /UPDATE public\.referral_events[\s\S]*SET metadata = CASE[\s\S]*recoveredBy[\s\S]*onboarding_reconciler[\s\S]*ELSE '\{\}'::jsonb/,
  );
  assert.doesNotMatch(
    migration,
    /^\s*(?:INSERT\s+INTO|DELETE\s+FROM|MERGE\s+INTO|TRUNCATE\b)/im,
  );
  assert.equal(
    migration.match(/^\s*UPDATE\s+public\.referral_events\b/gim)?.length,
    1,
  );
  assert.doesNotMatch(
    migration,
    /SET\s+(?:credit_cents|event_type|referrer_user_id|referred_user_id|created_at)\s*=/i,
  );
});

test("0038 rejects cyclic or over-depth legacy referral graphs without repair", () => {
  const graphLock = migration.indexOf("pg_advisory_xact_lock(280044, 0)");
  const usersLock = migration.indexOf(
    "LOCK TABLE public.users IN SHARE ROW EXCLUSIVE MODE",
    graphLock,
  );
  const ledgerLock = migration.indexOf(
    "LOCK TABLE public.referral_events IN ACCESS EXCLUSIVE MODE",
    usersLock,
  );
  const recursiveCheck = migration.indexOf(
    "WITH RECURSIVE referral_walk",
    ledgerLock,
  );
  assert.ok(graphLock >= 0 && graphLock < usersLock);
  assert.ok(usersLock < ledgerLock && ledgerLock < recursiveCheck);
  assert.match(
    migration,
    /next_user\.id = ANY\(referral_walk\.path\) AS cycle/,
  );
  assert.match(migration, /depth >= 64 AND referred_by_code IS NOT NULL/);
  assert.match(migration, /cyclic or over-depth legacy referral graph/);
  assert.match(
    migration,
    /Do not grant credits or move referral evidence automatically/,
  );
});

test("0038 minimizes erased identities while retaining the referral ledger", () => {
  assert.match(migration, /ALTER COLUMN referrer_user_id DROP NOT NULL/);
  assert.match(migration, /ALTER COLUMN referred_user_id DROP NOT NULL/);
  assert.match(
    migration,
    /CONSTRAINT referral_events_referrer_user_id_users_id_fk[\s\S]*ON DELETE SET NULL/,
  );
  assert.match(
    migration,
    /CONSTRAINT referral_events_referred_user_id_users_id_fk[\s\S]*ON DELETE SET NULL/,
  );
  assert.match(migration, /constraint_row\.confdeltype = 'n'/);
  assert.match(migration, /nullable ON DELETE SET NULL referral foreign keys/);
  assert.doesNotMatch(
    migration,
    /account_asset_erasure_outbox|canonical post-0037 baseline/,
    "0038 must not depend technically on the unrelated 0037 rollout",
  );

  const schema = readFileSync("src/lib/db/schema.ts", "utf8");
  const referralStart = schema.indexOf("export const referralEvents");
  const referralEnd = schema.indexOf("// ═", referralStart);
  const referralSchema = schema.slice(referralStart, referralEnd);
  assert.match(
    referralSchema,
    /referrerUserId: uuid\("referrer_user_id"\)[\s\S]*onDelete: "set null"/,
  );
  assert.match(
    referralSchema,
    /referredUserId: uuid\("referred_user_id"\)[\s\S]*onDelete: "set null"/,
  );
  assert.doesNotMatch(
    referralSchema,
    /referrerUserId:[\s\S]{0,120}onDelete: "set null"\s*\}\)\s*\.notNull\(\)/,
  );
  assert.doesNotMatch(
    referralSchema,
    /referredUserId:[\s\S]{0,120}onDelete: "set null"\s*\}\)\s*\.notNull\(\)/,
  );
  assert.match(schema, /uniqueIndex\("referral_events_milestone_uidx"\)/);

  const trigger = readFileSync("src/lib/referrals/trigger.ts", "utf8");
  assert.match(
    trigger,
    /target:\s*\[\s*referralEvents\.referrerUserId,\s*referralEvents\.referredUserId,\s*referralEvents\.eventType/,
  );
});

test("0038 closes the referral ledger and sequence to Supabase Data API roles", () => {
  assert.match(migration, /requires the Supabase anon and authenticated roles/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /NO FORCE ROW LEVEL SECURITY/);
  assert.doesNotMatch(
    migration,
    /ALTER TABLE public\.referral_events FORCE ROW LEVEL SECURITY/,
  );
  assert.match(migration, /DROP POLICY %I ON public\.referral_events/);
  assert.match(
    migration,
    /REVOKE ALL PRIVILEGES ON TABLE public\.referral_events FROM PUBLIC/,
  );
  assert.match(
    migration,
    /REVOKE ALL PRIVILEGES ON SEQUENCE public\.referral_events_id_seq FROM PUBLIC/,
  );
  assert.match(migration, /WITH RECURSIVE browser_role_tree/g);
  assert.match(migration, /JOIN pg_auth_members AS membership/g);
  assert.match(migration, /has_table_privilege/);
  assert.match(migration, /has_column_privilege/);
  assert.match(migration, /has_sequence_privilege/);
  assert.match(migration, /pg_catalog\.aclexplode/);
  assert.doesNotMatch(migration, /^\s*GRANT\b/im);
});

test("0038 verifier is guarded and proves convergence, evidence, GDPR, and access", () => {
  const source = readFileSync(verifierPath, "utf8");
  const runtimeGuard = source.indexOf('process.env.E2E_RUNTIME !== "1"');
  const configRead = source.indexOf("const config = e2eDatabaseConfig()");
  const markerCheck = source.indexOf("await verifyE2EDatabase(config)");
  const connection = source.indexOf("const sql = postgres(config.url");

  assert.ok(runtimeGuard >= 0, "missing direct-execution guard");
  assert.ok(
    configRead > runtimeGuard,
    "E2E config read must follow runtime guard",
  );
  assert.ok(
    markerCheck > configRead,
    "marker check must follow local URL validation",
  );
  assert.ok(
    connection > markerCheck,
    "DB connection must follow marker verification",
  );
  assert.match(source, /0038 exact pre-index baseline/);
  assert.match(source, /0038 duplicate-evidence fail-closed probe/);
  assert.match(source, /0038 legacy referral-cycle fail-closed probe/);
  assert.match(source, /0038 over-depth referral-chain fail-closed probe/);
  assert.match(source, /0038 first apply/);
  assert.match(source, /0038 second apply after index\/RLS\/policy\/ACL drift/);
  assert.match(source, /0038 complete catalog convergence/);
  assert.match(source, /epetrecere_0038_browser_parent/);
  assert.match(source, /epetrecere_0038_browser_grandparent/);
  assert.match(source, /0038 memberships after reapply/);
  assert.match(source, /assertAuditedRolesCannotAccess/);
  assert.match(source, /verifyGdprLedgerPreservation/);
  assert.match(source, /verifyReferralCycleProtection/);
  assert.match(source, /0038 sequential 2-cycle protection failed/);
  assert.match(source, /0038 concurrent 2-cycle protection failed/);
  assert.match(source, /0038 3-cycle protection failed/);
  assert.match(source, /0038 referral cycle fixtures financial neutrality/);
  assert.match(source, /0038 extra-column lookalike/);
  assert.match(source, /0038 extra-constraint lookalike/);
  assert.match(source, /0038 extra-index lookalike/);
  assert.match(source, /rejected and rolled back as expected/);
  assert.match(source, /referee erasure did not preserve ledger\/balance/);
  assert.match(source, /referrer erasure did not preserve ledger/);
  assert.match(source, /financial evidence/);
  assert.doesNotMatch(source, /account_asset_erasure_outbox|post-0037/);
  assert.doesNotMatch(source, /\bmd5\s*\(|\bdigest\s*\(/i);
});

test("referral capture takes the global graph lock before rows and rejects cycles", () => {
  const capture = readFileSync("src/lib/referrals/capture.ts", "utf8");
  const advisory = readFileSync("src/lib/booking/advisory-locks.ts", "utf8");
  const route = readFileSync("src/app/api/referrals/capture/route.ts", "utf8");
  const graphLock = capture.indexOf("acquireReferralCaptureGraphLock(tx)");
  const userLocks = capture.indexOf("acquireLegalScopeLocks(tx", graphLock);
  const rowLocks = capture.indexOf('.for("update")', userLocks);
  const recursiveCheck = capture.indexOf(
    "WITH RECURSIVE referral_chain",
    rowLocks,
  );
  const write = capture.indexOf("isNull(users.referredByCode)", recursiveCheck);

  assert.ok(graphLock >= 0 && graphLock < userLocks);
  assert.ok(userLocks < rowLocks && rowLocks < recursiveCheck);
  assert.ok(recursiveCheck < write);
  assert.match(capture, /next_user\.referral_code = chain\.referred_by_code/);
  assert.match(capture, /next_user\.id = ANY\(chain\.path\) AS cycle/);
  assert.match(capture, /REFERRAL_CHAIN_MAX_DEPTH = 64/);
  assert.match(capture, /reason: "reaches_user"/);
  assert.match(capture, /reason: "existing_cycle"/);
  assert.match(capture, /reason: "depth"/);
  assert.match(advisory, /REFERRAL_CAPTURE_GRAPH_LOCK = 280044/);
  assert.match(
    advisory,
    /pg_advisory_xact_lock\(\$\{REFERRAL_CAPTURE_GRAPH_LOCK\}, 0\)/,
  );
  assert.match(
    route,
    /db\.transaction\(\(tx\)\s*=>\s*captureReferralAttribution\(/,
  );
});

test("historic anonymized referral rows are not exposed as user identifiers", () => {
  const source = readFileSync("src/app/api/me/referral/route.ts", "utf8");
  const loop = source.indexOf("for (const e of events)");
  const guard = source.indexOf("if (!e.referredUserId) continue", loop);
  const mapLookup = source.indexOf("byUser.get(e.referredUserId)", loop);
  assert.ok(loop >= 0 && loop < guard && guard < mapLookup);
});

test("lazy referral-code assignment cannot overwrite a concurrent winner", () => {
  const source = readFileSync("src/app/api/me/referral/route.ts", "utf8");
  const update = source.indexOf(".update(users)");
  const compareAndSet = source.indexOf("isNull(users.referralCode)", update);
  const returning = source.indexOf(
    ".returning({ referralCode: users.referralCode })",
    compareAndSet,
  );
  const reload = source.indexOf("concurrentWinner", returning);
  assert.ok(update >= 0 && update < compareAndSet);
  assert.ok(compareAndSet < returning && returning < reload);
  assert.match(source, /if \(!isUniqueViolation\(error\)\) throw error/);
  assert.match(source, /code = concurrentWinner\.referralCode/);
});

test("referral milestones do not persist event dates or entity identifiers", () => {
  const venueRegistration = readFileSync(
    "src/app/api/auth/register-venue/route.ts",
    "utf8",
  );
  const artistRegistration = readFileSync(
    "src/app/api/auth/register-artist/route.ts",
    "utf8",
  );
  const confirmation = readFileSync(
    "src/lib/booking/confirmation-effects.ts",
    "utf8",
  );

  assert.match(
    venueRegistration,
    /triggerReferral\(appUser\.id, "onboarded"\);/,
  );
  assert.match(
    artistRegistration,
    /triggerReferral\(appUser\.id, "onboarded"\);/,
  );
  assert.doesNotMatch(
    venueRegistration,
    /triggerReferral\(appUser\.id, "onboarded",\s*\{[\s\S]{0,160}(?:kind|venueId)/,
  );
  assert.doesNotMatch(
    artistRegistration,
    /triggerReferral\(appUser\.id, "onboarded",\s*\{[\s\S]{0,160}(?:kind|artistId)/,
  );
  assert.doesNotMatch(
    confirmation,
    /triggerFirstBookingReferral\(\{[\s\S]{0,240}metadata:\s*\{\s*(?:eventDate|venueId|artistId)/,
  );
  const trigger = readFileSync("src/lib/referrals/trigger.ts", "utf8");
  assert.match(trigger, /metadata: ReferralLedgerMetadata = \{\}/);
  assert.match(trigger, /sanitizeReferralLedgerMetadata\(metadata\)/);
  assert.doesNotMatch(trigger, /metadata\?: Record<string, unknown>/);
});

test("0038 guarded and source-only commands are documented", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts?: Record<string, string>;
  };
  assert.equal(
    pkg.scripts?.["test:referral:migration0038"],
    "npx tsx scripts/run-guarded-db-test.ts scripts/referral-milestone-migration-verify.ts",
  );
  assert.equal(
    pkg.scripts?.["test:referral:migration0038-source"],
    "npx tsx --test scripts/referral-milestone-migration-source.test.ts",
  );

  for (const path of [
    "src/lib/db/migrations/README.md",
    "docs/testing-multihall.md",
  ]) {
    const documentation = readFileSync(path, "utf8");
    assert.match(documentation, /0038_referral_event_atomicity\.sql/);
    assert.match(documentation, /test:referral:migration0038-source/);
    assert.match(documentation, /test:referral:migration0038/);
    assert.match(
      documentation,
      /does not depend(?: technically)? on `?0037`?/i,
    );
    assert.match(documentation, /ON DELETE SET NULL/);
    assert.match(
      documentation,
      /shared Preview, staging, or\s+Production database/i,
    );
  }
});
