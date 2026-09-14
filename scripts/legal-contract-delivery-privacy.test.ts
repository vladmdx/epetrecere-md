import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  canonicalLegalDeliveryEmail,
  legalContractDeliverySafeFailure,
  legalDeliveryRecipientIsAuthorized,
} from "../src/lib/legal/contract-delivery-policy";
import { sendLegalContractEmail } from "../src/lib/legal/contract-delivery-provider";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "admin@example.invalid",
  role: "admin",
};

test("legal delivery requires the live user, unchanged address, and live role/binding", () => {
  const admin = {
    channel: "admin",
    recipientUserId: user.id,
    recipientEmail: user.email,
    recipientRoleSnapshot: "admin",
  };
  assert.equal(legalDeliveryRecipientIsAuthorized({
    delivery: admin,
    user,
    signerAcceptanceBound: false,
    sessionSignerLive: true,
  }), true);
  assert.equal(legalDeliveryRecipientIsAuthorized({
    delivery: admin,
    user: { ...user, role: "user" },
    signerAcceptanceBound: false,
    sessionSignerLive: true,
  }), false);
  assert.equal(legalDeliveryRecipientIsAuthorized({
    delivery: admin,
    user: { ...user, email: "changed@example.invalid" },
    signerAcceptanceBound: false,
    sessionSignerLive: true,
  }), false);
  assert.equal(legalDeliveryRecipientIsAuthorized({
    delivery: admin,
    user: null,
    signerAcceptanceBound: false,
    sessionSignerLive: true,
  }), false);
  assert.equal(legalDeliveryRecipientIsAuthorized({
    delivery: admin,
    user,
    signerAcceptanceBound: false,
    sessionSignerLive: false,
  }), false);

  const signer = {
    ...admin,
    channel: "signer",
    recipientRoleSnapshot: "signer",
  };
  assert.equal(legalDeliveryRecipientIsAuthorized({
    delivery: signer,
    user,
    signerAcceptanceBound: true,
    sessionSignerLive: true,
  }), true);
  assert.equal(legalDeliveryRecipientIsAuthorized({
    delivery: signer,
    user,
    signerAcceptanceBound: false,
    sessionSignerLive: true,
  }), false);
});

test("legal delivery durable failures cannot retain provider bodies, messages, or IDs", () => {
  const pii = "person@example.invalid";
  const session = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const error = Object.assign(
    new Error(`provider body ${pii} session=${session}`),
    {
      status: 503,
      code: "UNSAFE_PROVIDER_CODE",
      body: { email: pii, session },
      response: { data: { email: pii } },
    },
  );
  const persisted = legalContractDeliverySafeFailure(error, "corr-safe");
  assert.match(persisted, /corr-safe/);
  assert.match(persisted, /"status":503/);
  for (const forbidden of [pii, session, "provider body", "UNSAFE_PROVIDER_CODE", "stack", "response"]) {
    assert.equal(persisted.includes(forbidden), false, forbidden);
  }
});

test("legal delivery timeout aborts the underlying provider transport", async () => {
  let observedSignal: AbortSignal | undefined;
  let aborted = false;
  const request = sendLegalContractEmail(
    async (input) => {
      observedSignal = input.signal;
      return await new Promise((_resolve, reject) => {
        input.signal?.addEventListener("abort", () => {
          aborted = true;
          reject(input.signal?.reason);
        }, { once: true });
      });
    },
    {
      to: "recipient@example.invalid",
      subject: "safe",
      html: "<p>safe</p>",
      idempotencyKey: "stable-key",
    },
    5,
  );
  await assert.rejects(
    request,
    (error: unknown) =>
      error instanceof Error
      && (error as { code?: unknown }).code === "CONTRACT_EMAIL_PROVIDER_TIMEOUT",
  );
  assert.ok(observedSignal);
  assert.equal(observedSignal.aborted, true);
  assert.equal(aborted, true);

  const email = readFileSync("src/lib/email/send.ts", "utf8");
  assert.match(email, /\.\.\.\(signal \? \{ signal \} : \{\}\)/);
  assert.match(email, /requestOptions as Parameters</);
});

test("a stale local email is canonically synchronized before legal evidence is recorded", () => {
  assert.equal(
    canonicalLegalDeliveryEmail(" Verified.Signer@Example.INVALID "),
    "verified.signer@example.invalid",
  );
  const route = readFileSync("src/app/api/legal/accept/route.ts", "utf8");
  const sync = route.indexOf("await syncVerifiedLegalEmail");
  const record = route.indexOf("await recordLegalAcceptancePack", sync);
  assert.ok(sync >= 0 && sync < record);
  assert.match(route, /email: emailBinding\.email/);

  const writer = readFileSync("src/lib/legal/record-acceptance.ts", "utf8");
  const userLock = writer.indexOf('.for("update")');
  const emailUpdate = writer.indexOf(".update(users)", userLock);
  assert.ok(userLock >= 0 && userLock < emailUpdate);
  assert.match(writer, /VERIFIED_EMAIL_CONFLICT/);
  assert.match(writer, /canonicalLegalDeliveryEmail\(lockedActor\.email\)[\s\S]*canonicalLegalDeliveryEmail\(input\.email\)/);
  assert.match(writer, /VERIFIED_EMAIL_NOT_BOUND/);
});

test("legal delivery locks user before outbox, revalidates, and never stores raw errors", () => {
  const delivery = readFileSync("src/lib/legal/contract-delivery.ts", "utf8");
  const worker = delivery.indexOf("async function deliverClaimedRecipient");
  const userLock = delivery.indexOf('.for("share")', worker);
  const outboxLock = delivery.indexOf('.for("update")', userLock);
  const authorize = delivery.indexOf("legalDeliveryRecipientIsAuthorized", outboxLock);
  const send = delivery.indexOf("await sendLegalContractEmail", authorize);
  assert.ok(worker >= 0 && worker < userLock);
  assert.ok(userLock < outboxLock && outboxLock < authorize && authorize < send);
  assert.doesNotMatch(delivery, /JSON\.stringify\(error\)|error instanceof Error \? error\.message|String\(error\)|new AggregateError/);
  assert.doesNotMatch(delivery, /console\.error\([^\n]*sessionId/);
  assert.match(delivery, /recipientEmail: null/);
  assert.match(
    delivery,
    /status: "dead_letter",[\s\S]*recipientUserId: null,[\s\S]*recipientEmail: null,[\s\S]*recipientKey: sql`'retired:' \|\|/,
  );
  assert.match(
    delivery,
    /exhausted[\s\S]*recipientUserId: null,[\s\S]*recipientEmail: null,[\s\S]*recipientKey: sql`'retired:' \|\|/,
  );
  assert.match(delivery, /isNull\(legalContractDeliveryOutbox\.cancelledAt\)/);
  assert.match(delivery, /prepared\.signerUserId/);
  assert.match(delivery, /sessionSignerLive/);
  assert.match(delivery, /liveUsersById\.has\(prepared\.signerUserId\)/);

  const scrub = readFileSync(
    "src/lib/legal/contract-delivery-privacy.ts",
    "utf8",
  );
  assert.match(scrub, /legalAcceptances\.acceptanceSessionId/);
  assert.match(scrub, /legalAcceptances\.userId/);
  assert.match(scrub, /status: sql`CASE[\s\S]*THEN 'cancelled'/);
  assert.match(scrub, /recipientEmail: null/);

  const record = readFileSync("src/lib/legal/record-acceptance.ts", "utf8");
  const audience = record.indexOf("const lockedAudience = await tx");
  const audienceOrder = record.indexOf(".orderBy(asc(users.id))", audience);
  const audienceLock = record.indexOf('.for("share")', audienceOrder);
  const ensureCall = record.indexOf("await ensureDeliveryJobs", audienceLock);
  assert.ok(audience >= 0 && audience < audienceOrder);
  assert.ok(audienceOrder < audienceLock && audienceLock < ensureCall);
  assert.match(record, /inArray\(users\.role, \["admin", "super_admin"\]\)/);
  assert.doesNotMatch(record, /getLockedAppUserById/);

  assert.match(record, /recipientUserId: first\.userId/);
  assert.match(record, /recipientRoleSnapshot: "signer"/);
  assert.match(record, /recipientUserId: admin\.id/);
  assert.match(record, /recipientRoleSnapshot: admin\.role/);

  for (const path of [
    "src/app/api/me/delete-account/route.ts",
    "src/app/api/webhooks/clerk/route.ts",
  ]) {
    assert.match(
      readFileSync(path, "utf8"),
      /scrubLegalContractDeliveriesForUserErasure/,
      path,
    );
  }
});

test("0039 is transactional, minimizes identity, and closes inherited Data API access", () => {
  const migration = readFileSync(
    "src/lib/db/migrations/manual/0039_legal_contract_delivery_privacy.sql",
    "utf8",
  );
  assert.match(migration, /^BEGIN;/m);
  assert.match(migration, /COMMIT;\s*$/);
  assert.match(migration, /recipient_user_id uuid/);
  assert.match(migration, /ON DELETE SET NULL/);
  assert.match(migration, /ALTER COLUMN recipient_email DROP NOT NULL/);
  assert.match(migration, /SET recipient_email = NULL[\s\S]*WHERE delivered_at IS NOT NULL/);
  assert.match(
    migration,
    /status = 'dead_letter'[\s\S]*recipient_user_id = NULL[\s\S]*recipient_email = NULL|recipient_user_id = NULL[\s\S]*recipient_email = NULL[\s\S]*WHERE status = 'dead_letter'/,
  );
  assert.match(
    migration,
    /status = 'dead_letter'[\s\S]*recipient_user_id IS NULL[\s\S]*recipient_email IS NULL[\s\S]*recipient_key = 'retired:' \|\| id::text/,
  );
  assert.match(migration, /status = 'cancelled'/);
  assert.match(migration, /recipient_key = 'retired:' \|\| delivery\.id::text/);
  assert.match(migration, /legal_contract_delivery_recipient_state_chk/);
  assert.match(migration, /status IN \('pending', 'failed'\)[\s\S]*recipient_user_id IS NOT NULL[\s\S]*recipient_email IS NOT NULL/);
  assert.match(migration, /non-live session signer/);
  assert.match(migration, /cancelled_at IS NULL/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /NO FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /WITH RECURSIVE browser_role_tree/g);
  assert.match(migration, /has_table_privilege/);
  assert.match(migration, /has_column_privilege/);
  assert.match(migration, /has_sequence_privilege/);
  assert.match(migration, /DROP POLICY %I ON public\.legal_contract_delivery_outbox/);
  assert.match(migration, /non-canonical legal delivery column shape/);
  assert.match(migration, /unexpected legal delivery constraints/);
  assert.match(migration, /unexpected legal delivery indexes/);
  assert.match(migration, /same-name foreign index object/);
  assert.match(migration, /failed exact catalog verification for index/);
  assert.match(migration, /DROP INDEX IF EXISTS public\.legal_contract_delivery_recipient_user_idx/);
  assert.doesNotMatch(migration, /CREATE INDEX IF NOT EXISTS legal_contract_delivery_recipient_user_idx/);
  assert.doesNotMatch(migration, /^\s*GRANT\b/im);

  const schema = readFileSync("src/lib/db/schema.ts", "utf8");
  const start = schema.indexOf("export const legalContractDeliveryOutbox");
  const end = schema.indexOf("export type AccountBlobAssetState", start);
  const table = schema.slice(start, end);
  assert.match(table, /recipientUserId: uuid\("recipient_user_id"\)[\s\S]*onDelete: "set null"/);
  assert.match(table, /recipientRoleSnapshot: text\("recipient_role_snapshot"\)\.notNull\(\)/);
  assert.match(table, /recipientEmail: text\("recipient_email"\)/);
  assert.match(table, /cancelledAt: timestamp\("cancelled_at"/);
  assert.match(table, /legal_contract_delivery_recipient_state_chk/);
});

test("0039 verifier is guarded and covers convergence plus destructive drift probes", () => {
  const verifier = readFileSync(
    "scripts/legal-contract-delivery-migration-verify.ts",
    "utf8",
  );
  const guard = verifier.indexOf('process.env.E2E_RUNTIME !== "1"');
  const config = verifier.indexOf("const config = e2eDatabaseConfig()");
  const marker = verifier.indexOf("await verifyE2EDatabase(config)", config);
  const connection = verifier.indexOf("const sql = postgres(", marker);
  assert.ok(guard >= 0 && guard < config && config < marker && marker < connection);
  assert.match(verifier, /0039 exact pre-migration baseline confirmed/);
  assert.match(verifier, /const expectedBaselineColumns = \[/);
  assert.match(verifier, /acceptance_session_id[\s\S]*recipient_email[\s\S]*updated_at/);
  assert.match(verifier, /0039 first apply/);
  assert.match(verifier, /0039 second apply after constraint\/index\/RLS\/policy\/ACL drift/);
  assert.match(verifier, /0039 complete catalog convergence/);
  assert.match(verifier, /epetrecere_0039_browser_parent/);
  assert.match(verifier, /epetrecere_0039_browser_grandparent/);
  assert.match(verifier, /0039 memberships after reapply/);
  assert.match(verifier, /0039 incompatible-column lookalike/);
  assert.match(verifier, /0039 extra-constraint lookalike/);
  assert.match(verifier, /0039 extra-index lookalike/);
  assert.match(verifier, /0039 foreign same-name index lookalike/);
  assert.match(verifier, /rejected and rolled back as expected/);

  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  assert.equal(
    pkg.scripts["test:legal-delivery:migration0039-source"],
    "npx tsx --test scripts/legal-contract-delivery-privacy.test.ts",
  );
  assert.equal(
    pkg.scripts["test:legal-delivery:migration0039"],
    "npx tsx scripts/run-guarded-db-test.ts scripts/legal-contract-delivery-migration-verify.ts",
  );
  const docs = readFileSync("src/lib/db/migrations/README.md", "utf8");
  assert.match(docs, /Pending rollout: `0039_legal_contract_delivery_privacy\.sql`/);
  assert.match(docs, /fresh\s+guarded loopback restore/);
  assert.match(docs, /has not applied `0039` to any shared Preview, staging, or\s+Production database/);
});

test("signer erasure and pending admin delivery share the user-to-outbox barrier", () => {
  const worker = readFileSync("src/lib/legal/contract-delivery.ts", "utf8");
  const delivery = worker.indexOf("async function deliverClaimedRecipient");
  const signerIdentity = worker.indexOf("prepared.signerUserId", delivery);
  const orderedUsers = worker.indexOf(".orderBy(asc(users.id))", signerIdentity);
  const userLock = worker.indexOf('.for("share")', orderedUsers);
  const outboxLock = worker.indexOf('.for("update")', userLock);
  const signerLive = worker.indexOf("const sessionSignerLive", outboxLock);
  const send = worker.indexOf("await sendLegalContractEmail", signerLive);
  assert.ok(delivery >= 0 && delivery < signerIdentity);
  assert.ok(signerIdentity < orderedUsers && orderedUsers < userLock);
  assert.ok(userLock < outboxLock && outboxLock < signerLive && signerLive < send);

  const scrub = readFileSync(
    "src/lib/legal/contract-delivery-privacy.ts",
    "utf8",
  );
  assert.match(scrub, /acceptanceSessionId[\s\S]*SELECT DISTINCT[\s\S]*legalAcceptances\.userId/);
  for (const routePath of [
    "src/app/api/me/delete-account/route.ts",
    "src/app/api/webhooks/clerk/route.ts",
  ]) {
    const route = readFileSync(routePath, "utf8");
    const minimize = route.indexOf("scrubLegalContractDeliveriesForUserErasure");
    const deletion = route.indexOf("tx.delete(users)", minimize);
    assert.ok(minimize >= 0 && minimize < deletion, routePath);
  }
});

test("legal recovery reports provider failures and crash-final dead letters without PII", () => {
  const worker = readFileSync("src/lib/legal/contract-delivery.ts", "utf8");
  assert.match(
    worker,
    /const newlyDeadLettered = await deadLetterExpiredFinalAttempts\([\s\S]*batchLimit,[\s\S]*\);/,
  );
  const sweep = worker.slice(
    worker.indexOf("async function deadLetterExpiredFinalAttempts"),
    worker.indexOf("async function claimDueRecipients"),
  );
  assert.match(sweep, /\.limit\(batchLimit\)/);
  assert.match(sweep, /\.for\("update", \{ skipLocked: true \}\)/);
  assert.match(worker, /deadLetterBacklog/);
  assert.match(worker, /count\(\*\)::int/);

  const inngest = readFileSync("src/lib/inngest/functions.ts", "utf8");
  assert.match(inngest, /legal_contract_delivery_unhealthy:failed=/);
  assert.match(inngest, /result\.newlyDeadLettered > 0/);
  assert.match(inngest, /result\.deadLetterBacklog > 0/);
  assert.doesNotMatch(
    inngest,
    /legal_contract_delivery_unhealthy:[^\n]*(?:JSON\.stringify|session|email|recipient)/,
  );

  const cron = readFileSync(
    "src/app/api/cron/booking-confirmation-outbox/route.ts",
    "utf8",
  );
  assert.match(cron, /retryPendingLegalContractDeliveries\(FALLBACK_PROVIDER_BATCH, \{[\s\S]*maxRecipientsPerSession: FALLBACK_PROVIDER_BATCH/);
  assert.match(cron, /providerTimeoutMs: FALLBACK_PROVIDER_TIMEOUT_MS/);
  assert.match(cron, /legalDelivery\.newlyDeadLettered > 0/);
  assert.match(cron, /legalDelivery\.deadLetterBacklog > 0/);
});
