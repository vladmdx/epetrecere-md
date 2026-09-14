import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const workerPath = "src/lib/privacy/account-asset-erasure.ts";
const migrationPath =
  "src/lib/db/migrations/manual/0037_account_asset_erasure_outbox.sql";

test("both account erasure paths enqueue assets before unlink or cascade", () => {
  for (const path of [
    "src/app/api/me/delete-account/route.ts",
    "src/app/api/webhooks/clerk/route.ts",
  ]) {
    const source = readFileSync(path, "utf8");
    const capture = source.indexOf("captureAccountAssetErasures(");
    const clearArtist = source.indexOf(".update(artists)", capture);
    const clearVenue = source.indexOf(".update(venues)", clearArtist);
    const deleteUser = source.indexOf(".delete(users)", clearVenue);
    assert.ok(
      capture >= 0
        && capture < clearArtist
        && clearArtist < clearVenue
        && clearVenue < deleteUser,
      `${path} must capture -> clear profiles -> delete user`,
    );
    assert.doesNotMatch(source, /erasePhotoBatch|@vercel\/blob/);
  }
});

test("capture uses server ownership receipts and retains every surviving claim", () => {
  const source = readFileSync(workerPath, "utf8");
  const captureStart = source.indexOf(
    "export async function captureAccountAssetErasures",
  );
  const captureEnd = source.indexOf(
    "export type ClaimedAccountAssetErasure",
    captureStart,
  );
  const capture = source.slice(captureStart, captureEnd);
  for (const proof of [
    "accountBlobAssets.ownerUserId",
    "accountBlobAssets.erasurePolicy",
    "accountBlobAssets.state",
    "accountBlobAssetClaims.erasureUserId",
    "accountBlobErasureEligibility",
  ]) {
    assert.ok(capture.includes(proof), `capture is missing ${proof}`);
  }
  assert.match(capture, /\.insert\(accountAssetErasureOutbox\)/);
  assert.match(capture, /\.onConflictDoNothing/);
  assert.doesNotMatch(capture, /@vercel\/blob|\bfetch\s*\(/);

  assert.match(capture, /eq\(accountBlobAssets\.ownerUserId, userId\)/);
  assert.match(capture, /pg_advisory_xact_lock/);
  assert.ok(
    capture.indexOf("pg_advisory_xact_lock")
      < capture.indexOf("const registered = await tx"),
    "global asset lock must precede registry row locks",
  );
  assert.match(capture, /isNull\(accountBlobAssetClaims\.erasureUserId\)/);
  assert.match(capture, /ne\(accountBlobAssetClaims\.erasureUserId, userId\)/);
  assert.match(capture, /\.for\("update"\)/);
  assert.doesNotMatch(capture, /managedAccountAssetUrls\(/);
});

test("worker claims with skip-locked lease fencing and clears URLs only on success", () => {
  const source = readFileSync(workerPath, "utf8");
  assert.match(source, /db\.transaction\(async \(tx\) =>/);
  assert.match(source, /\.for\("update", \{ skipLocked: true \}\)/);
  assert.match(source, /attempts: sql`\$\{accountAssetErasureOutbox\.attempts\} \+ 1`/);
  assert.match(source, /leaseUntil: new Date\(now\.getTime\(\) \+ leaseMs\)/);
  assert.match(source, /eq\(accountAssetErasureOutbox\.leaseToken, claim\.leaseToken\)/g);

  const success = source.indexOf("async markDelivered");
  const clear = source.indexOf("assetUrl: null", success);
  const provider = source.indexOf("async function deleteBlobWithToken");
  const drain = source.indexOf("export async function drainAccountAssetErasureOutbox");
  assert.ok(success >= 0 && clear > success);
  assert.ok(provider >= 0 && drain > provider && success >= 0, "provider I/O must be separate from claim tx");
  assert.match(source, /instanceof BlobNotFoundError/);
  assert.match(source, /accountAssetErasureRetryDelayMs\(claim\.attempts\)/);
  assert.match(source, /ACCOUNT_ASSET_ERASURE_RETRY_CAP_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(source, /safeServerErrorLog\(error,/);
  assert.match(source, /JSON\.stringify\(\{/);
  assert.doesNotMatch(source, /error\.message|error\.stack|String\(error\)/);
  assert.doesNotMatch(source, /status: terminal \? "dead_letter"/);
  assert.doesNotMatch(source, /ACCOUNT_ASSET_ERASURE_MAX_ATTEMPTS/);
});

test("bounded pending reconciliation is allowlisted and never TTL-collects generic uploads", () => {
  const source = readFileSync(workerPath, "utf8");
  const start = source.indexOf(
    "export async function reconcileStalePendingAccountBlobAssets",
  );
  const end = source.indexOf(
    "export function accountBlobErasureEligibility",
    start,
  );
  const reconciliation = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(reconciliation, /STALE_TRANSIENT_BLOB_AGE_MS/);
  assert.match(reconciliation, /MAX_PENDING_RECONCILIATION_BATCH/);
  assert.match(reconciliation, /"legal_contract_pending"/g);
  assert.match(reconciliation, /"upload_receipt_quarantine"/g);
  assert.match(reconciliation, /accountBlobAssetClaims\.assetKey/);
  assert.match(reconciliation, /pg_advisory_xact_lock/);
  assert.match(reconciliation, /skipLocked: true/);
  assert.match(reconciliation, /\.insert\(accountAssetErasureOutbox\)/);
  assert.doesNotMatch(
    reconciliation,
    /generic_upload|public_upload|moments_photo|managedAccountAssetUrls|@vercel\/blob/,
  );
  assert.match(source, /if \(!options\.store\)[\s\S]*reconcileStalePendingAccountBlobAssets/);
});

test("all server Blob uploads register ownership before exposing their URL", () => {
  const upload = readFileSync("src/app/api/upload/route.ts", "utf8");
  const managedPhoto = readFileSync("src/lib/moments/managed-photo.ts", "utf8");
  const contract = readFileSync(
    "src/app/api/booking-requests/[id]/contract/route.ts",
    "utf8",
  );
  assert.match(upload, /storeRegisteredBlob\(/);
  assert.doesNotMatch(upload, /import\("@vercel\/blob"\)/);
  assert.match(managedPhoto, /storeRegisteredBlob\(/);
  assert.doesNotMatch(managedPhoto, /\bput\(/);
  assert.match(contract, /storeRegisteredBlob\(/);
  assert.match(contract, /retainRegisteredBlobAsset\(/);
  assert.match(contract, /readRegisteredPrivateBlob\(/);
  assert.match(contract, /access: "private"/);
  assert.match(contract, /LEGAL_BLOB_READ_WRITE_TOKEN/);
  assert.match(contract, /MOMENTS_BLOB_READ_WRITE_TOKEN/);
  assert.doesNotMatch(contract, /access: "public"/);
  const response = contract.slice(contract.lastIndexOf("return NextResponse.json({"));
  assert.doesNotMatch(response, /contractPdfUrl: pdfUrl/);
  assert.doesNotMatch(contract, /console\.error\([^\n]*,\s*err\)/);

  const source = readFileSync(workerPath, "utf8");
  assert.match(source, /registerAccountBlobAsset/);
  assert.match(source, /account_blob_registry_conflict/);
  assert.match(source, /existing\.provenance !== input\.provenance/);
  assert.match(source, /await deleteJustUploadedBlob\(asset, input\.access, token\)/);
  assert.match(
    source,
    /recoverableBlobSdkReceipt\(uploaded\.url, token\)[\s\S]*provenance: "upload_receipt_quarantine"[\s\S]*enqueueRegisteredBlobCleanup\(quarantineAsset\.url\)/,
  );
  assert.match(
    source,
    /\(options\.deleteBlob \?\? deleteBlobWithToken\)\(claim\.assetUrl\)/,
  );
});

test("Moments defers registered objects to last-claim outbox cleanup", () => {
  const source = readFileSync("src/lib/moments/erase-photo.ts", "utf8");
  const registryCheck = source.indexOf("isRegisteredAccountBlobAsset(raw)");
  const providerList = source.indexOf("await list(", registryCheck);
  const providerDelete = source.indexOf("await del(raw", providerList);
  assert.ok(
    registryCheck >= 0 && providerList > registryCheck && providerDelete > providerList,
    "registry lookup must happen before synchronous provider I/O",
  );
  assert.match(source, /return "registered"/);
  assert.match(
    source,
    /result === "deleted" \|\| result === "already_missing" \|\| result === "registered"/,
  );

  const registry = readFileSync(workerPath, "utf8");
  const helperStart = registry.indexOf(
    "export async function isRegisteredAccountBlobAsset",
  );
  const helperEnd = registry.indexOf("function validProvenance", helperStart);
  const helper = registry.slice(helperStart, helperEnd);
  assert.match(helper, /managedBlobAsset\(raw\)/);
  assert.match(helper, /accountAssetKey\(asset\.url\)/);
  assert.match(helper, /eq\(accountBlobAssets\.assetUrl, asset\.url\)/);
  assert.doesNotMatch(helper, /@vercel\/blob|\bfetch\s*\(/);
});

test("0037 installs a server-only registry, claims, queue and race fence", () => {
  const source = readFileSync(migrationPath, "utf8");
  assert.match(source, /BEGIN;[\s\S]*COMMIT;/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS public\.account_blob_assets/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS public\.account_blob_asset_claims/);
  assert.match(source, /account_asset_erasure_outbox_asset_key_unique/);
  assert.match(source, /account_asset_erasure_outbox_state_chk/);
  assert.match(source, /account_asset_erasure_outbox_due_idx/);
  assert.match(source, /account_asset_erasure_outbox_expired_lease_idx/);
  assert.match(source, /REVOKE ALL PRIVILEGES ON TABLE/);
  assert.match(source, /REVOKE ALL PRIVILEGES ON SEQUENCE/);
  assert.match(source, /FROM PUBLIC/);
  assert.match(source, /ENABLE ROW LEVEL SECURITY/);
  assert.match(source, /NO FORCE ROW LEVEL SECURITY/);
  assert.match(source, /WITH RECURSIVE browser_role_tree/);
  assert.match(source, /has_table_privilege/);
  assert.match(source, /has_column_privilege/);
  assert.match(source, /has_sequence_privilege/);
  assert.match(source, /has_function_privilege/);
  assert.match(source, /FOR KEY SHARE/);
  assert.match(source, /account_blob_assets_owner_idx/);
  assert.match(source, /account_blob_enqueue_unclaimed_orphans/);
  assert.match(source, /owner_user_id IS NULL/);
  assert.match(source, /NOT EXISTS \([\s\S]*account_blob_asset_claims/);
  assert.match(source, /ORDER BY asset\.asset_key[\s\S]*FOR UPDATE OF asset/);
  assert.match(source, /account_blob_claim_mutation_fence_trg/);
  assert.match(source, /BEFORE INSERT OR DELETE OR UPDATE ON public\.account_blob_asset_claims/);
  assert.match(source, /account_blob_claim_orphan_check_trg/);
  assert.match(source, /account_blob_owner_orphan_check_trg/);
  assert.match(source, /DEFERRABLE INITIALLY DEFERRED/g);
  assert.match(source, /registered Blob is pending erasure/);
  assert.match(source, /detached Blob registry transition was not fenced/);
  assert.match(source, /OLD\.asset_key/);
  const syncStart = source.indexOf(
    "CREATE OR REPLACE FUNCTION public.account_blob_sync_row_claims()",
  );
  const syncEnd = source.indexOf(
    "DROP TRIGGER IF EXISTS account_blob_claim_mutation_fence_trg",
    syncStart,
  );
  const sync = source.slice(syncStart, syncEnd);
  const fastReturn = sync.indexOf("IF NOT has_current_claim");
  const advisory = sync.indexOf("PERFORM pg_advisory_xact_lock");
  assert.ok(fastReturn >= 0 && advisory > fastReturn);
  assert.match(sync, /has_registered_candidate/);
  assert.match(sync, /has_dependent_claim/);
  assert.match(source, /account_blob_claims_sync_trg/);
  assert.match(source, /erasure_user_id/);
  assert.match(source, /Legacy\/unregistered URLs are retained fail-safe/);
  assert.doesNotMatch(source, /\bGRANT\b/);
  assert.doesNotMatch(source, /'dead_letter'/);
});

test("Inngest and the authenticated cron fallback both drain the asset queue", () => {
  const inngest = readFileSync("src/lib/inngest/functions.ts", "utf8");
  const cron = readFileSync(
    "src/app/api/cron/booking-confirmation-outbox/route.ts",
    "utf8",
  );
  assert.match(inngest, /id: "account-asset-erasure-outbox"/);
  assert.match(inngest, /cron: "\*\/5 \* \* \* \*"/);
  assert.match(inngest, /drainAccountAssetErasureOutbox/);
  assert.match(inngest, /accountAssetErasureOutbox,/);
  assert.match(cron, /drainAccountAssetErasureOutbox/);
  assert.match(
    cron,
    /const \[[\s\S]*assetErasure[\s\S]*\] = await Promise\.all\(\[/,
  );
  assert.match(cron, /assetErasure\.failed/);
  assert.match(cron, /assetErasure\.deadLettered/);
});

test("retention never deletes chat Blob URLs without a registry receipt", () => {
  const archive = readFileSync(
    "src/app/api/cron/archive-plans/route.ts",
    "utf8",
  );
  const messagesStart = archive.indexOf("const expiredMessages");
  const messagesEnd = archive.indexOf("const anonymizedContactLeads", messagesStart);
  const messageRetention = archive.slice(messagesStart, messagesEnd);
  assert.match(messageRetention, /db\.delete\(chatMessages\)/);
  assert.match(messageRetention, /row-delete trigger removes its durable claim/);
  assert.doesNotMatch(messageRetention, /@vercel\/blob|\bdel\(|attachmentUrls|BLOB_READ_WRITE_TOKEN/);
});
