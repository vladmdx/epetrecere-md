import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("daily outbox fallback has bounded concurrent provider work", () => {
  const route = readFileSync(
    "src/app/api/cron/booking-confirmation-outbox/route.ts",
    "utf8",
  );
  const timeout = Number(
    /FALLBACK_PROVIDER_TIMEOUT_MS = ([\d_]+)/
      .exec(route)?.[1]?.replaceAll("_", ""),
  );
  const batch = Number(/FALLBACK_PROVIDER_BATCH = (\d+)/.exec(route)?.[1]);
  assert.ok(timeout > 0 && timeout <= 5_000);
  assert.equal(batch, 1);
  assert.match(route, /export const maxDuration = 60/);
  assert.match(route, /await Promise\.all\(\[/);
  const handler = route.indexOf("export async function GET");
  const parallelWave = route.indexOf("] = await Promise.all([", handler);
  const referralCall = route.indexOf("reconcileOnboardedReferrals(", handler);
  assert.ok(parallelWave >= 0 && referralCall > parallelWave);
  assert.match(route, /reconcileOnboardedReferrals\(\{ limit: FALLBACK_PROVIDER_BATCH \}\)/);
  assert.match(route, /drainAccountErasureIdentityOutbox\(\{[\s\S]*providerTimeoutMs: FALLBACK_PROVIDER_TIMEOUT_MS/);
  assert.match(route, /drainAccountAssetErasureOutbox\(\{ limit: FALLBACK_PROVIDER_BATCH \}\)/);
  assert.match(route, /retryPendingLegalContractDeliveries\(FALLBACK_PROVIDER_BATCH/);
  assert.match(route, /drainConfirmationNotificationOutbox\(\{[\s\S]*maxDeliveriesPerEffect: FALLBACK_PROVIDER_BATCH/);
  assert.match(route, /drainBookingCreationNotificationOutbox\(\{[\s\S]*maxDeliveriesPerEffect: FALLBACK_PROVIDER_BATCH/);

  const confirmation = readFileSync(
    "src/lib/booking/confirmation-effects.ts",
    "utf8",
  );
  const creation = readFileSync(
    "src/lib/booking/booking-create-effects.ts",
    "utf8",
  );
  for (const worker of [confirmation, creation]) {
    assert.match(worker, /options\.maxDeliveriesPerEffect \?\? 100/);
    assert.match(worker, /providerTimeoutMs: options\.providerTimeoutMs/);
  }

  const dispatch = readFileSync("src/lib/notifications/dispatch.ts", "utf8");
  assert.doesNotMatch(dispatch, /Promise\.race\(\[work\(controller\.signal\), timeout\]\)/);
  assert.match(
    dispatch,
    /controller\.abort[\s\S]*return await work\(controller\.signal\)/,
  );
  const pushChannel = dispatch.slice(
    dispatch.indexOf('if (channel === "push")'),
    dispatch.indexOf('if (channel === "whatsapp")'),
  );
  assert.match(pushChannel, /withProviderDeadline[\s\S]*\(signal\) =>[\s\S]*signal,/);
  const emailChannel = dispatch.slice(
    dispatch.indexOf("if (!input.email || !input.emailHtml)"),
    dispatch.indexOf("async function performDispatch"),
  );
  assert.match(emailChannel, /withProviderDeadline[\s\S]*\(signal\) => sender\(\{[\s\S]*signal,/);

  const push = readFileSync("src/lib/push/send.ts", "utf8");
  assert.match(push, /httpsRequest\([\s\S]*signal: options\.signal/);
  assert.match(push, /options\.signal\?\.throwIfAborted\(\)/);

  const effectOutbox = readFileSync("src/lib/booking/effect-outbox.ts", "utf8");
  assert.doesNotMatch(effectOutbox, /Promise\.race\(\[work\(\), timeout\]\)/);
  assert.match(effectOutbox, /const value = await dispatch\(permitted, executor\)/);

  const identity = readFileSync(
    "src/lib/privacy/account-erasure-identity.ts",
    "utf8",
  );
  assert.match(identity, /providerTimeoutMs: options\.providerTimeoutMs/);

  const legal = readFileSync("src/lib/legal/contract-delivery.ts", "utf8");
  assert.match(legal, /dependencies\.providerTimeoutMs/);
  const deadLetterSweep = legal.slice(
    legal.indexOf("async function deadLetterExpiredFinalAttempts"),
    legal.indexOf("async function claimDueRecipients"),
  );
  assert.match(deadLetterSweep, /\.limit\(batchLimit\)/);
  assert.match(deadLetterSweep, /\.for\("update", \{ skipLocked: true \}\)/);
  assert.match(legal, /deadLetterExpiredFinalAttempts\([\s\S]*batchLimit/);
});
