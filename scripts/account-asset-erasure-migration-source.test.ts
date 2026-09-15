import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migrationPath =
  "src/lib/db/migrations/manual/0037_account_asset_erasure_outbox.sql";
const verifierPath = "scripts/account-asset-erasure-migration-verify.ts";

test("0037 freezes an exact post-0036 catalog and fails closed on drift", () => {
  const source = readFileSync(migrationPath, "utf8");
  assert.match(source, /^BEGIN;[\s\S]*COMMIT;\s*$/m);
  assert.match(source, /SET LOCAL search_path = pg_catalog, public/);
  assert.match(source, /0037 requires canonical post-0036 ordinary table/);
  assert.match(source, /0037 requires canonical source column/);
  assert.match(source, /LOCK TABLE public\.account_blob_assets IN ACCESS EXCLUSIVE MODE/);
  assert.match(source, /LOCK TABLE public\.account_blob_asset_claims IN ACCESS EXCLUSIVE MODE/);
  assert.match(source, /LOCK TABLE public\.account_asset_erasure_outbox IN ACCESS EXCLUSIVE MODE/);
  assert.match(source, /column\/default drift/g);
  assert.match(source, /refuses dropped\/identity\/generated\/inherited\/typmod asset columns/);
  assert.match(source, /unexpected constraint drift/);
  assert.match(source, /foreign-key action drift/);
  assert.match(source, /primary\/unique key shape drift/);
  assert.match(source, /non-canonical outbox serial sequence shape\/ownership/);
  assert.match(source, /sequence_shape\.seqtypid = 'integer'::regtype/);
  assert.match(source, /sequence_shape\.seqincrement = 1/);
  assert.match(source, /sequence_shape\.seqmax = 2147483647/);
  assert.match(source, /sequence_shape\.seqcache = 1/);
  assert.match(source, /refuses named index object/);
  assert.match(source, /unexpected index drift/);
  assert.match(source, /failed exact index shape/);
  assert.match(source, /CREATE INDEX account_blob_assets_pending_unclaimed_idx/);
  assert.match(source, /provenance = 'legal_contract_pending'/);
  assert.match(source, /refuses missing or overloaded Blob helper functions/);
  assert.equal(
    source.match(/CREATE OR REPLACE FUNCTION public\.account_blob_/g)?.length,
    5,
  );
});

test("0037 proves policy-free RLS and recursively removes every browser capability", () => {
  const source = readFileSync(migrationPath, "utf8");
  for (const table of [
    "account_blob_assets",
    "account_blob_asset_claims",
    "account_asset_erasure_outbox",
  ]) {
    assert.match(source, new RegExp(`ALTER TABLE public\\.%I ENABLE ROW LEVEL SECURITY|${table}`));
  }
  assert.match(source, /WITH RECURSIVE browser_role_tree/g);
  assert.match(source, /REVOKE ALL PRIVILEGES ON TABLE/);
  assert.match(source, /REVOKE ALL PRIVILEGES \(%s\) ON TABLE/);
  assert.match(source, /REVOKE ALL PRIVILEGES ON SEQUENCE/);
  assert.match(source, /REVOKE ALL PRIVILEGES ON FUNCTION/);
  assert.match(source, /ENABLE ROW LEVEL SECURITY/);
  assert.match(source, /NO FORCE ROW LEVEL SECURITY/);
  assert.match(source, /has_table_privilege/);
  assert.match(source, /has_column_privilege/);
  assert.match(source, /has_sequence_privilege/);
  assert.match(source, /has_function_privilege/);
  assert.match(source, /failed policy-free owner-compatible RLS/);
  assert.doesNotMatch(source, /^\s*GRANT\b/im);
});

test("claim, orphan and account deletion paths share one deterministic fence", () => {
  const source = readFileSync(migrationPath, "utf8");
  assert.match(source, /pg_advisory_xact_lock\(1163022925, 37\)/g);
  assert.match(source, /account_blob_claim_mutation_fence_trg/);
  assert.match(source, /BEFORE INSERT OR DELETE OR UPDATE ON public\.account_blob_asset_claims/);
  assert.match(source, /account_blob_claim_orphan_check_trg/);
  assert.match(source, /account_blob_owner_orphan_check_trg/);
  assert.match(source, /DEFERRABLE INITIALLY DEFERRED/g);
  assert.match(source, /ORDER BY asset\.asset_key[\s\S]*FOR UPDATE OF asset/);
  assert.match(source, /registered Blob is pending erasure/);
  assert.match(source, /NOT EXISTS \([\s\S]*account_blob_asset_claims/);

  const recordStart = source.indexOf(
    "CREATE OR REPLACE FUNCTION public.account_blob_record_claim(",
  );
  const recordEnd = source.indexOf(
    "CREATE OR REPLACE FUNCTION public.account_blob_fence_claim_mutation()",
    recordStart,
  );
  const recordClaim = source.slice(recordStart, recordEnd);
  assert.ok(
    recordClaim.indexOf("FROM public.users")
      < recordClaim.indexOf("PERFORM pg_advisory_xact_lock"),
    "direct claim writes must lock user before the global Blob fence",
  );

  const fenceStart = source.indexOf(
    "CREATE OR REPLACE FUNCTION public.account_blob_fence_claim_mutation()",
  );
  const fenceEnd = source.indexOf(
    "CREATE OR REPLACE FUNCTION public.account_blob_enqueue_unclaimed_orphans()",
    fenceStart,
  );
  const mutationFence = source.slice(fenceStart, fenceEnd);
  const fenceUser = mutationFence.indexOf("FROM public.users");
  const fenceGlobal = mutationFence.indexOf("PERFORM pg_advisory_xact_lock");
  const fenceAsset = mutationFence.indexOf("FROM public.account_blob_assets asset");
  assert.ok(
    fenceUser >= 0 && fenceUser < fenceGlobal && fenceGlobal < fenceAsset,
    "claim mutation trigger must preserve user -> global advisory -> asset order",
  );

  const orphanStart = source.indexOf(
    "CREATE OR REPLACE FUNCTION public.account_blob_deferred_orphan_check()",
  );
  const orphanEnd = source.indexOf(
    "CREATE OR REPLACE FUNCTION public.account_blob_sync_row_claims()",
    orphanStart,
  );
  const orphanCheck = source.slice(orphanStart, orphanEnd);
  assert.match(orphanCheck, /OLD\.asset_key/);
  assert.match(orphanCheck, /owner_user_id = NULL/);
  assert.match(orphanCheck, /detached Blob registry transition was not fenced/);
  assert.doesNotMatch(orphanCheck, /provenance = 'legal_contract_pending'/);

  const syncStart = source.indexOf(
    "CREATE OR REPLACE FUNCTION public.account_blob_sync_row_claims()",
  );
  const syncEnd = source.indexOf(
    "These SECURITY DEFINER helpers",
    syncStart,
  );
  const sync = source.slice(syncStart, syncEnd);
  const fastReturn = sync.indexOf("IF NOT has_current_claim");
  const userLock = sync.indexOf("FROM public.users", fastReturn);
  const advisory = sync.indexOf("PERFORM pg_advisory_xact_lock");
  assert.ok(fastReturn >= 0 && advisory > fastReturn,
    "ordinary rows must return before the global lock");
  assert.ok(userLock > fastReturn && userLock < advisory,
    "claim synchronization must lock user before the global Blob fence");
  assert.match(sync, /has_registered_candidate/);
  assert.match(sync, /has_dependent_claim/);
  assert.match(sync, /ORDER BY asset\.asset_key[\s\S]*FOR KEY SHARE OF asset/);
});

test("all Blob-bearing source tables have exact trigger coverage", () => {
  const source = readFileSync(migrationPath, "utf8");
  for (const table of [
    "users", "categories", "artists", "artist_images", "venues",
    "venue_images", "reviews", "blog_posts", "booking_requests",
    "chat_messages", "event_plans", "event_photos",
    "invitation_templates", "invitations", "conversations",
  ]) {
    assert.match(source, new RegExp(`'${table}'`), table);
  }
  for (const field of [
    "avatar_url", "image_url", "photo_url", "video_testimonials",
    "menu_url", "menu_pdf_url", "virtual_tour_url", "og_image_url",
    "photos", "cover_image_url", "contract_pdf_url", "attachment_url",
    "moments_music_url", "thumbnail_url",
  ]) {
    assert.match(source, new RegExp(`'${field}'`), field);
  }
  assert.match(source, /failed exact source Blob claim trigger shape/);
  assert.match(source, /failed to install all Blob claim triggers/);
});

test("the DB verifier is guard-only, exhaustive and packaged", () => {
  const verifier = readFileSync(verifierPath, "utf8");
  const runner = readFileSync("scripts/run-guarded-db-test.ts", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  assert.match(verifier, /process\.env\.E2E_RUNTIME !== "1"/);
  assert.match(verifier, /verifyE2EDatabase\(config\)/);
  assert.match(verifier, /assertBaseline/);
  assert.match(verifier, /catalogSnapshot/);
  assert.match(verifier, /privilegeViolations/);
  assert.match(verifier, /injectRepairableDrift/);
  assert.match(verifier, /expectMigrationRejected/g);
  assert.match(verifier, /exerciseFastPathAndLegacy/);
  assert.match(verifier, /exerciseSharedReferenceLifecycle/);
  assert.match(verifier, /exerciseLiveOwnerLastClaimCleanup/);
  assert.match(verifier, /exerciseUserGlobalAssetLockOrder/);
  assert.match(verifier, /exerciseDeleteClaimRace/);
  assert.match(verifier, /exerciseReattachVsQueueRace/);
  assert.match(verifier, /0037 serial settings drift/);
  assert.match(verifier, /expectTransactionalMigrationRejected/);
  assert.match(verifier, /pg_locks/);
  assert.match(verifier, /claim deletion did not wait behind account-delete fence/);
  assert.match(verifier, /claim\/orphan race produced ambiguous state/);
  assert.match(verifier, /claim helper did not wait on the user lock before global\/asset locks/);
  assert.match(verifier, /unattached generic draft was swept without prior claim provenance/);
  assert.match(runner, /verifyE2EDatabase\(config\)/);
  assert.match(runner, /process\.env\.E2E_RUNTIME = "1"/);
  assert.equal(
    packageJson.scripts["test:account-asset-erasure:migration0037"],
    "npx tsx scripts/run-guarded-db-test.ts scripts/account-asset-erasure-migration-verify.ts",
  );
  assert.equal(
    packageJson.scripts["test:account-asset-erasure:migration0037-source"],
    "npx tsx --test scripts/account-asset-erasure-migration-source.test.ts scripts/account-asset-erasure-outbox-source.test.ts",
  );
});
