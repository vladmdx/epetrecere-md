import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("booking and offer transaction also commits one create_notify coordinator", () => {
  const writer = source("src/lib/booking/booking-request-write.ts");
  assert.match(writer, /BOOKING_CREATION_NOTIFICATION_EFFECT/);
  assert.equal(writer.match(/enqueueBookingEffect\(/g)?.length, 2);
  assert.match(
    writer,
    /if \(existing\)[\s\S]*?enqueueBookingEffect\([\s\S]*?existing\.id[\s\S]*?created: false/,
  );
  assert.match(
    writer,
    /const booking = await write[\s\S]*?enqueueBookingEffect\([\s\S]*?booking\.id[\s\S]*?created: true/,
  );
});

test("creation worker uses leased child deliveries and propagating channel dispatch", () => {
  const effects = source("src/lib/booking/booking-create-effects.ts");
  assert.match(effects, /dueBookingEffects\(/);
  assert.match(effects, /processBookingEffect\(/);
  assert.match(effects, /enqueueBookingEffectDeliveries\(/);
  assert.match(effects, /dueBookingEffectDeliveries\(/);
  assert.match(effects, /processBookingEffectDelivery\(/);
  assert.match(effects, /withBookingCreationEffectDeliveryDispatchPermit\(/);
  assert.match(effects, /await dispatchNotificationChannel\(/);
  assert.match(effects, /idempotencyKey: claimed\.dedupeKey/);
  assert.doesNotMatch(effects, /catch \([^)]*\) \{\s*console\.error\([^)]*email/);
  assert.doesNotMatch(effects, /email-\$\{/);
});

test("materialization serializes with erasure and rebuilds payload after locking", () => {
  const effects = source("src/lib/booking/booking-create-effects.ts");
  const start = effects.indexOf("async function materializeCreationDeliveries");
  const end = effects.indexOf("async function nextCreationRetryAt", start);
  assert.ok(start >= 0 && end > start);
  const helper = effects.slice(start, end);
  const userLock = helper.indexOf('.for("share")');
  const coordinatorLock = helper.indexOf('.for("update")');
  const freshBooking = helper.indexOf("const [freshBooking]", coordinatorLock);
  const refreshedRows = helper.indexOf(
    "creationDeliveryRows(freshBooking, executor)",
    freshBooking,
  );
  assert.ok(userLock >= 0 && userLock < coordinatorLock);
  assert.ok(coordinatorLock < freshBooking && freshBooking < refreshedRows);
  assert.match(helper, /lockedUserIds\.has\(row\.recipientUserId\)/);
  assert.match(effects, /resolveNotificationChannels\(input, executor\)/);
  assert.match(effects, /getVenueOwnerRecipients\(booking\.venueId, executor\)/);
});

test("confirmation materialization uses one executor and rejects erased recipients", () => {
  const effects = source("src/lib/booking/confirmation-effects.ts");
  const start = effects.indexOf("async function materializeConfirmationDeliveries");
  const end = effects.indexOf("type ConfirmationPreparationStep", start);
  assert.ok(start >= 0 && end > start);
  const helper = effects.slice(start, end);
  const userLock = helper.indexOf('.for("share")');
  const barrier = helper.indexOf("acquireBookingConfirmationBarrier");
  const coordinatorLock = helper.indexOf('.for("update")');
  const freshInputs = helper.indexOf("finalNotificationInputs(activeBooking, executor)");
  assert.ok(userLock >= 0 && userLock < barrier && barrier < coordinatorLock);
  assert.ok(coordinatorLock < freshInputs);
  assert.match(helper, /lockedUserIds\.has\(input\.userId\)/);
  assert.match(helper, /resolveNotificationChannels\(input, executor\)/);
});

test("a scrubbed recipient does not cancel unaffected creation deliveries", () => {
  for (const path of [
    "src/lib/booking/booking-create-effects.ts",
    "src/lib/booking/confirmation-effects.ts",
  ]) {
    const effects = source(path);
    assert.match(
      effects,
      /const live = all\.filter\(\(row\) => row\.status !== "cancelled"\)/,
    );
    assert.match(effects, /if \(live\.length === 0 && all\.length > 0\)/);
    assert.match(effects, /live\.some\(\(row\) => row\.status !== "delivered"\)/);
  }
});

test("five-minute Inngest worker and daily cron drain both effect kinds", () => {
  const inngest = source("src/lib/inngest/functions.ts");
  const cron = source("src/app/api/cron/booking-confirmation-outbox/route.ts");
  for (const text of [inngest, cron]) {
    assert.match(text, /drainConfirmationNotificationOutbox/);
    assert.match(text, /drainBookingCreationNotificationOutbox/);
    assert.match(text, /creation\.failed/);
    assert.match(text, /creation\.failedBacklog/);
    assert.match(text, /creation\.newlyReportedTerminal/);
  }
  assert.match(inngest, /cron: "\*\/5 \* \* \* \*"/);
});

test("HTTP and AI adapters schedule the fast path for exact replays too", () => {
  const http = source("src/app/api/booking-requests/route.ts");
  const ai = source(
    "src/app/api/ai/client-artist-picker/confirm/route.ts",
  );
  for (const text of [http, ai]) {
    assert.match(text, /after\(\(\) => dispatchBookingCreationEffects\(creation\)\)/);
    assert.doesNotMatch(
      text,
      /if \(creation\.created\)[\s\S]{0,100}dispatchBookingCreationEffects/,
    );
  }
  assert.match(ai, /findAiBookingProposalTarget/);
  assert.match(ai, /aiBookingProposalActionId/);
  const chat = source("src/app/api/ai/client-artist-picker/route.ts");
  assert.doesNotMatch(chat, /createClientBookingRequest|send_booking_requests/);
});
