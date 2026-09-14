import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { sanitizeReferralLedgerMetadata } from "../src/lib/referrals/metadata";

test("referral ledger and balance update share one transaction", () => {
  const source = readFileSync("src/lib/referrals/trigger.ts", "utf8");
  const helper = source.indexOf("async function creditReferralLocked");
  const insert = source.indexOf(".insert(referralEvents)", helper);
  const insertedGate = source.indexOf("if (!inserted)", insert);
  const credit = source.indexOf(".update(users)", insertedGate);
  assert.ok(helper >= 0 && helper < insert);
  assert.ok(insert < insertedGate && insertedGate < credit);
  assert.doesNotMatch(
    source.slice(
      helper,
      source.indexOf("export async function triggerReferral"),
    ),
    /await db\.(insert|update)\(/,
  );
  assert.match(source, /\.returning\(\{ id: users\.id \}\)/);
});

test("confirmation lets the unique referral event choose the first winner", () => {
  const source = readFileSync(
    "src/lib/booking/confirmation-effects.ts",
    "utf8",
  );
  assert.match(source, /triggerFirstBookingReferral\(\{/);
  assert.doesNotMatch(source, /isFirstBookingForUser/);
});

test("first-booking credit linearizes with cancellation in one transaction", () => {
  const source = readFileSync("src/lib/referrals/trigger.ts", "utf8");
  const start = source.indexOf(
    "export async function triggerFirstBookingReferral",
  );
  const body = source.slice(start);
  const transaction = body.indexOf("db.transaction(async (tx)");
  const legal = body.indexOf("acquireLegalScopeLocks(tx", transaction);
  const participantLocks = body.indexOf(
    "lockReferralParticipants(executor",
    legal,
  );
  const barrier = body.indexOf(
    "acquireBookingConfirmationBarrier(executor",
    participantLocks,
  );
  const bookingLock = body.indexOf('.for("share")', barrier);
  const statusGate = body.indexOf(
    'booking.status !== "confirmed_by_client"',
    bookingLock,
  );
  const ledger = body.indexOf("creditReferralLocked(", statusGate);
  assert.ok(transaction >= 0 && transaction < legal);
  assert.ok(legal < participantLocks && participantLocks < barrier);
  assert.ok(barrier < bookingLock);
  assert.ok(bookingLock < statusGate && statusGate < ledger);
});

test("the referral conflict target has a matching schema-level unique index", () => {
  const schema = readFileSync("src/lib/db/schema.ts", "utf8");
  assert.match(
    schema,
    /uniqueIndex\("referral_events_milestone_uidx"\)\s*\.on\(\s*t\.referrerUserId,\s*t\.referredUserId,\s*t\.eventType,?\s*\)/,
  );
});

test("referral capture serializes the graph and rejects cycles before writing", () => {
  const route = readFileSync("src/app/api/referrals/capture/route.ts", "utf8");
  const source = readFileSync("src/lib/referrals/capture.ts", "utf8");
  const locks = readFileSync("src/lib/booking/advisory-locks.ts", "utf8");

  assert.match(
    route,
    /db\.transaction\(\(tx\)\s*=>\s*captureReferralAttribution\(/,
  );

  const graphLock = source.indexOf("acquireReferralCaptureGraphLock(tx)");
  const userLocks = source.indexOf("acquireLegalScopeLocks(tx", graphLock);
  const rowLocks = source.indexOf('.for("update")', userLocks);
  const recursiveCheck = source.indexOf(
    "WITH RECURSIVE referral_chain",
    rowLocks,
  );
  const conditionalUpdate = source.indexOf(
    "isNull(users.referredByCode)",
    recursiveCheck,
  );
  const returning = source.indexOf(
    ".returning({ code: users.referredByCode })",
    conditionalUpdate,
  );
  assert.ok(graphLock >= 0 && graphLock < userLocks);
  assert.ok(userLocks < rowLocks && rowLocks < recursiveCheck);
  assert.ok(
    recursiveCheck < conditionalUpdate && conditionalUpdate < returning,
  );
  assert.match(source, /next_user\.referral_code = chain\.referred_by_code/);
  assert.match(source, /next_user\.id = ANY\(chain\.path\) AS cycle/);
  assert.match(source, /REFERRAL_CHAIN_MAX_DEPTH = 64/);
  assert.match(source, /status: "cycle"/);

  assert.match(locks, /REFERRAL_CAPTURE_GRAPH_LOCK = 280044/);
  assert.match(
    locks,
    /pg_advisory_xact_lock\(\$\{REFERRAL_CAPTURE_GRAPH_LOCK\}, 0\)/,
  );
  assert.doesNotMatch(
    source.slice(graphLock),
    /\.where\(eq\(users\.id, user\.id\)\)\s*;/,
    "capture must never use an unconditional last-writer-wins update",
  );
});

test("referral dashboard never exposes an erased user as a null identifier", () => {
  const source = readFileSync("src/app/api/me/referral/route.ts", "utf8");
  const loop = source.indexOf("for (const e of events)");
  const nullGuard = source.indexOf("if (!e.referredUserId) continue", loop);
  const mapLookup = source.indexOf("byUser.get(e.referredUserId)", loop);
  const response = source.indexOf(
    "referred: Array.from(byUser.values())",
    loop,
  );

  assert.ok(loop >= 0 && loop < nullGuard);
  assert.ok(nullGuard < mapLookup && mapLookup < response);
  assert.doesNotMatch(source, /referredUserId:\s*e\.referredUserId\s*\?\?/);
});

test("lazy referral-code assignment is an immutable compare-and-set", () => {
  const source = readFileSync("src/app/api/me/referral/route.ts", "utf8");
  const update = source.indexOf(".update(users)");
  const nullPredicate = source.indexOf("isNull(users.referralCode)", update);
  const returning = source.indexOf(
    ".returning({ referralCode: users.referralCode })",
    nullPredicate,
  );
  const winnerReload = source.indexOf("concurrentWinner", returning);

  assert.ok(update >= 0 && update < nullPredicate);
  assert.ok(nullPredicate < returning && returning < winnerReload);
  assert.match(source, /if \(!isUniqueViolation\(error\)\) throw error/);
  assert.match(source, /code = concurrentWinner\.referralCode/);
  assert.doesNotMatch(
    source,
    /\.set\(\{ referralCode: candidate \}\)\s*\.where\(eq\(users\.id, user\.id\)\)/,
  );
});

test("onboarding referral has a durable state-derived reconciliation path", () => {
  const trigger = readFileSync("src/lib/referrals/trigger.ts", "utf8");
  assert.match(trigger, /export async function reconcileOnboardedReferrals/);
  assert.match(
    trigger,
    /onboardingComplete}[\s\S]*referredByCode}[\s\S]*NOT EXISTS[\s\S]*eventType} = 'onboarded'/,
  );
  assert.match(trigger, /EXISTS \([\s\S]*AS valid_referrer/);
  assert.match(trigger, /triggerReferral\(candidate\.id, "onboarded"/);

  const worker = readFileSync("src/lib/inngest/functions.ts", "utf8");
  const fallback = readFileSync(
    "src/app/api/cron/booking-confirmation-outbox/route.ts",
    "utf8",
  );
  assert.match(worker, /reconcileOnboardedReferrals\(\{ limit: 25 \}\)/);
  assert.match(worker, /referrals\.failed > 0/);
  assert.match(
    fallback,
    /reconcileOnboardedReferrals\(\{ limit: FALLBACK_PROVIDER_BATCH \}\)/,
  );
  const parallelWave = fallback.indexOf("] = await Promise.all([");
  const referralCall = fallback.indexOf(
    "reconcileOnboardedReferrals(",
    fallback.indexOf("export async function GET"),
  );
  assert.ok(parallelWave >= 0 && referralCall > parallelWave);
  assert.match(fallback, /referrals\.failed > 0/);
});

test("referral metadata boundary allowlists only the non-identifying recovery marker", () => {
  assert.deepEqual(sanitizeReferralLedgerMetadata({
    recoveredBy: "onboarding_reconciler",
    eventDate: "2026-09-20",
    bookingId: 91,
    venueId: 12,
    artistId: 14,
    email: "pii@example.invalid",
  }), { recoveredBy: "onboarding_reconciler" });
  assert.deepEqual(sanitizeReferralLedgerMetadata({
    recoveredBy: "future_worker",
    eventDate: "2026-09-20",
  }), {});
  assert.deepEqual(sanitizeReferralLedgerMetadata("unexpected"), {});

  const source = readFileSync("src/lib/referrals/trigger.ts", "utf8");
  assert.match(source, /metadata: ReferralLedgerMetadata = \{\}/);
  assert.match(source, /sanitizeReferralLedgerMetadata\(metadata\)/);
  assert.doesNotMatch(
    source,
    /triggerFirstBookingReferral\(input:[\s\S]{0,180}metadata\?:/,
  );
});
