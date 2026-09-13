/**
 * Durable booking-confirmation outbox regression suite.
 * Guarded disposable local DB only. Run after migration 0031.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { and, eq, inArray, sql } from "drizzle-orm";
import { NextRequest } from "next/server";

import { db } from "../src/lib/db";
import {
  bookingEffectDeliveries,
  bookingEffectOutbox,
  bookingRequests,
  notifications,
  users,
} from "../src/lib/db/schema";
import {
  CONFIRMATION_NOTIFICATION_EFFECT,
  bookingEffectDeliveriesFor,
  bookingEffectFor,
  claimBookingEffect,
  claimBookingEffectDelivery,
  cancelBookingConfirmationEffects,
  dueBookingEffectDeliveries,
  enqueueBookingEffect,
  enqueueBookingEffectDeliveries,
  markBookingEffectDelivered,
  processBookingEffectDelivery,
  reapExhaustedBookingEffectDeliveries,
  requeueBookingEffectDeadLetter,
} from "../src/lib/booking/effect-outbox";
import { persistConfirmationEffects } from "../src/lib/booking/confirmation-persist";
import {
  drainConfirmationNotificationOutbox,
  processConfirmationNotificationEffect,
} from "../src/lib/booking/confirmation-effects";
import {
  casClientConfirm,
  confirmBookingWithEffects,
  vendorCancelBooking,
} from "../src/lib/booking/booking-transitions";
import { GET as cronGet } from "../src/app/api/cron/booking-confirmation-outbox/route";
import type { NotificationChannelDrivers } from "../src/lib/notifications/dispatch";
import { BOOKING_EFFECT_MAX_ATTEMPTS } from "../src/lib/booking/effect-outbox-policy";

const MARK = `booking_outbox_${Date.now()}_`;
let userId = "";

async function createBooking(status: "accepted" | "confirmed_by_client" = "confirmed_by_client") {
  const [booking] = await db
    .insert(bookingRequests)
    .values({
      clientUserId: userId,
      clientName: MARK + "client",
      clientPhone: "+37360000000",
      clientEmail: MARK + "client@example.com",
      eventDate: "2028-10-20",
      status,
      confirmedAt: status === "confirmed_by_client" ? new Date() : null,
    })
    .returning();
  return booking;
}

function channelDrivers(overrides: {
  email?: () => Promise<unknown>;
  push?: () => Promise<{ sent: number; pruned: number; failed: number }>;
  whatsapp?: () => Promise<{ sent: boolean; reason?: string }>;
} = {}): NotificationChannelDrivers {
  return {
    sendPushToUser: overrides.push ?? (async () => ({ sent: 1, pruned: 0, failed: 0 })),
    sendWhatsAppToUser: overrides.whatsapp ?? (async () => ({ sent: true })),
    sendEmail: overrides.email ?? (async () => ({ data: { id: "ok" }, error: null })),
  };
}

before(async () => {
  const columns = await db.execute(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'booking_effect_deliveries'
      AND column_name = 'payload'
  `) as unknown as Array<{ column_name: string }>;
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error("Current migration 0031 is required before booking outbox tests.");
  }
  const [user] = await db
    .insert(users)
    .values({
      clerkId: MARK + randomUUID(),
      email: MARK + "user@example.com",
      name: "Booking Outbox Test",
    })
    .returning({ id: users.id });
  userId = user.id;
});

after(async () => {
  if (!userId) return;
  await db.delete(notifications).where(eq(notifications.userId, userId));
  const bookings = await db
    .select({ id: bookingRequests.id })
    .from(bookingRequests)
    .where(eq(bookingRequests.clientUserId, userId));
  const bookingIds = bookings.map(({ id }) => id);
  if (bookingIds.length > 0) {
    const effects = await db
      .select({ id: bookingEffectOutbox.id })
      .from(bookingEffectOutbox)
      .where(inArray(bookingEffectOutbox.bookingId, bookingIds));
    const effectIds = effects.map(({ id }) => id);
    if (effectIds.length > 0) {
      await db.delete(bookingEffectDeliveries).where(inArray(bookingEffectDeliveries.effectId, effectIds));
      await db.delete(bookingEffectOutbox).where(inArray(bookingEffectOutbox.id, effectIds));
    }
    await db.delete(bookingRequests).where(inArray(bookingRequests.id, bookingIds));
  }
  await db.delete(users).where(eq(users.id, userId));
});

test("real confirmation transition and outbox row commit or roll back together", async () => {
  const booking = await createBooking("accepted");
  await assert.rejects(
    db.transaction(async (tx) => {
      const [confirmed] = await tx
        .update(bookingRequests)
        .set({ status: "confirmed_by_client", confirmedAt: new Date() })
        .where(eq(bookingRequests.id, booking.id))
        .returning();
      await persistConfirmationEffects(tx as unknown as typeof db, confirmed);
      throw new Error("simulated crash before commit");
    }),
    /simulated crash/,
  );
  const [rolledBack] = await db
    .select({ status: bookingRequests.status })
    .from(bookingRequests)
    .where(eq(bookingRequests.id, booking.id));
  assert.equal(rolledBack.status, "accepted");
  assert.equal(await bookingEffectFor(booking.id, CONFIRMATION_NOTIFICATION_EFFECT), null);

  const confirmed = await confirmBookingWithEffects(booking, (executor) =>
    casClientConfirm(executor, booking.id, {
      status: "confirmed_by_client",
      clientConfirmedAt: new Date(),
      confirmedAt: new Date(),
    }),
  );
  assert.equal(confirmed.status, "confirmed_by_client");
  const pending = await bookingEffectFor(confirmed.id, CONFIRMATION_NOTIFICATION_EFFECT);
  assert.equal(pending?.status, "pending");
});

test("expired lease recovers a crash and fences the stale coordinator", async () => {
  const booking = await createBooking();
  const effect = await enqueueBookingEffect(db, booking.id, CONFIRMATION_NOTIFICATION_EFFECT);
  const now = new Date("2028-01-01T00:00:00.000Z");
  const stale = await claimBookingEffect(effect.id, {
    now,
    leaseMs: 1_000,
    leaseToken: randomUUID(),
  });
  assert.equal(stale?.status, "processing");

  const early = await processConfirmationNotificationEffect(effect.id, {
    now: new Date(now.getTime() + 999),
    deliver: async () => assert.fail("live lease must not be stolen"),
  });
  assert.equal(early.status, "not_due");

  let deliveries = 1; // first worker may have reached the provider before crash
  const recovered = await processConfirmationNotificationEffect(effect.id, {
    now: new Date(now.getTime() + 1_001),
    deliver: async () => { deliveries += 1; },
  });
  assert.equal(recovered.status, "delivered");
  assert.equal(deliveries, 2);
  assert.equal(await markBookingEffectDelivered(stale!), null, "stale token is fenced");
});

test("failure remains retryable and explicit replay pulls it forward", async () => {
  const booking = await createBooking();
  const effect = await enqueueBookingEffect(db, booking.id, CONFIRMATION_NOTIFICATION_EFFECT);
  const failed = await processConfirmationNotificationEffect(effect.id, {
    deliver: async () => { throw new Error("provider unavailable"); },
  });
  assert.equal(failed.status, "failed");
  if (failed.status !== "failed") return;
  assert.equal(failed.effect.attempts, 1);
  assert.equal(failed.effect.deliveredAt, null);
  assert.match(failed.effect.lastError ?? "", /provider unavailable/);

  const tooSoon = await processConfirmationNotificationEffect(effect.id, {
    now: new Date(failed.effect.nextAttemptAt.getTime() - 1),
    deliver: async () => assert.fail("backoff must be honored"),
  });
  assert.equal(tooSoon.status, "not_due");

  const rescheduled = await enqueueBookingEffect(db, booking.id, CONFIRMATION_NOTIFICATION_EFFECT);
  assert.equal(rescheduled.status, "pending");
  const delivered = await processConfirmationNotificationEffect(effect.id, {
    now: new Date(rescheduled.nextAttemptAt.getTime() + 1),
    deliver: async () => undefined,
  });
  assert.equal(delivered.status, "delivered");
});

test("concurrent workers cannot hold the same coordinator lease", async () => {
  const booking = await createBooking();
  const effect = await enqueueBookingEffect(db, booking.id, CONFIRMATION_NOTIFICATION_EFFECT);
  let deliveries = 0;
  const deliver = async () => { deliveries += 1; };
  const results = await Promise.all([
    processConfirmationNotificationEffect(effect.id, { deliver }),
    processConfirmationNotificationEffect(effect.id, { deliver }),
  ]);
  assert.equal(results.filter((row) => row.status === "delivered").length, 1);
  assert.equal(results.filter((row) => row.status === "not_due").length, 1);
  assert.equal(deliveries, 1);
});

test("email retry does not resend already delivered push or WhatsApp", async () => {
  const booking = await createBooking();
  const effect = await enqueueBookingEffect(db, booking.id, CONFIRMATION_NOTIFICATION_EFFECT);
  let pushes = 0;
  let whatsapps = 0;
  let emails = 0;
  let emailFails = true;
  const drivers = channelDrivers({
    push: async () => { pushes += 1; return { sent: 1, pruned: 0, failed: 0 }; },
    whatsapp: async () => { whatsapps += 1; return { sent: true }; },
    email: async () => {
      emails += 1;
      if (emailFails) throw new Error("email down");
      return { data: { id: "ok" }, error: null };
    },
  });

  const first = await processConfirmationNotificationEffect(effect.id, { drivers });
  assert.equal(first.status, "failed");
  assert.equal(pushes, 1);
  assert.equal(whatsapps, 1);
  assert.equal(emails, 1);
  const firstRows = await bookingEffectDeliveriesFor(effect.id);
  assert.equal(firstRows.find((row) => row.channel === "email")?.status, "failed");
  assert.equal(firstRows.find((row) => row.channel === "push")?.status, "delivered");
  assert.equal(firstRows.find((row) => row.channel === "whatsapp")?.status, "delivered");

  emailFails = false;
  const replayed = await enqueueBookingEffect(db, booking.id, CONFIRMATION_NOTIFICATION_EFFECT);
  const second = await processConfirmationNotificationEffect(effect.id, {
    now: new Date(replayed.nextAttemptAt.getTime() + 1),
    drivers,
  });
  assert.equal(second.status, "delivered");
  assert.equal(pushes, 1);
  assert.equal(whatsapps, 1);
  assert.equal(emails, 2);
  const inApp = await db
    .select({ id: notifications.id, key: notifications.dedupeKey })
    .from(notifications)
    .where(and(
      eq(notifications.userId, userId),
      eq(notifications.dedupeKey, `booking:${booking.id}:${userId}:confirmed`),
    ));
  assert.equal(inApp.length, 1, "in-app notification is exactly once");
});

test("cancel after a failed channel closes retry without sending confirmation", async () => {
  const booking = await createBooking();
  const effect = await enqueueBookingEffect(db, booking.id, CONFIRMATION_NOTIFICATION_EFFECT);
  let emails = 0;
  const drivers = channelDrivers({
    email: async () => {
      emails += 1;
      throw new Error("email temporarily down");
    },
  });
  const failed = await processConfirmationNotificationEffect(effect.id, { drivers });
  assert.equal(failed.status, "failed");
  assert.equal(emails, 1);

  await vendorCancelBooking(booking.id, "test cancellation");
  const cancelled = await bookingEffectFor(booking.id, CONFIRMATION_NOTIFICATION_EFFECT);
  assert.equal(cancelled?.status, "cancelled");
  const rows = await bookingEffectDeliveriesFor(effect.id);
  assert.equal(rows.find((row) => row.channel === "email")?.status, "cancelled");
  assert.ok(rows.filter((row) => row.channel !== "email").every((row) => row.status === "delivered"));

  const retry = await processConfirmationNotificationEffect(effect.id, { drivers });
  assert.equal(retry.status, "not_due");
  assert.equal(emails, 1);
});

test("cancellation committed before claim suppresses every confirmation channel", async () => {
  const booking = await createBooking();
  const effect = await enqueueBookingEffect(db, booking.id, CONFIRMATION_NOTIFICATION_EFFECT);
  let externalCalls = 0;
  await vendorCancelBooking(booking.id, "cancel before worker");
  const result = await processConfirmationNotificationEffect(effect.id, {
    drivers: channelDrivers({
      push: async () => { externalCalls += 1; return { sent: 1, pruned: 0, failed: 0 }; },
      whatsapp: async () => { externalCalls += 1; return { sent: true }; },
      email: async () => { externalCalls += 1; return { data: { id: "unexpected" }, error: null }; },
    }),
  });
  assert.equal(result.status, "not_due");
  assert.equal(externalCalls, 0);
  assert.equal((await bookingEffectFor(booking.id, CONFIRMATION_NOTIFICATION_EFFECT))?.status, "cancelled");
});

test("cancellation wins the barrier after status check and before provider start", async () => {
  const booking = await createBooking();
  const effect = await enqueueBookingEffect(db, booking.id, CONFIRMATION_NOTIFICATION_EFFECT);
  let providerCalls = 0;
  let release!: () => void;
  let reached!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const atBarrier = new Promise<void>((resolve) => { reached = resolve; });
  let paused = false;
  const worker = processConfirmationNotificationEffect(effect.id, {
    beforeDispatchPermit: async () => {
      if (paused) return;
      paused = true;
      reached();
      await gate;
    },
    drivers: channelDrivers({
      push: async () => { providerCalls += 1; return { sent: 1, pruned: 0, failed: 0 }; },
      whatsapp: async () => { providerCalls += 1; return { sent: true }; },
      email: async () => { providerCalls += 1; return { data: { id: "unexpected" }, error: null }; },
    }),
  });
  await atBarrier;
  await vendorCancelBooking(booking.id, "cancel in controlled dispatch gap");
  release();
  const result = await worker;
  assert.ok(result.status === "not_due" || result.status === "cancelled");
  assert.equal(providerCalls, 0, "a committed cancellation prevents provider start");
  assert.ok((await bookingEffectDeliveriesFor(effect.id)).every((row) => row.status === "cancelled"));
});

test("provider start wins the barrier and cancellation waits for its timeout-bounded call", async () => {
  const booking = await createBooking();
  const effect = await enqueueBookingEffect(db, booking.id, CONFIRMATION_NOTIFICATION_EFFECT);
  let providerStarted!: () => void;
  let releaseProvider!: () => void;
  const started = new Promise<void>((resolve) => { providerStarted = resolve; });
  const providerGate = new Promise<void>((resolve) => { releaseProvider = resolve; });
  let pushCalls = 0;
  const worker = processConfirmationNotificationEffect(effect.id, {
    providerTimeoutMs: 2_000,
    drivers: channelDrivers({
      push: async () => {
        pushCalls += 1;
        providerStarted();
        await providerGate;
        return { sent: 1, pruned: 0, failed: 0 };
      },
    }),
  });
  await started;
  let cancellationCommitted = false;
  const cancellation = vendorCancelBooking(booking.id, "cancel after provider start")
    .then(() => { cancellationCommitted = true; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(cancellationCommitted, false, "cancellation waits behind the dispatch barrier");
  releaseProvider();
  await cancellation;
  assert.equal(cancellationCommitted, true);
  assert.equal(pushCalls, 1);
  const result = await worker;
  assert.ok(result.status === "not_due" || result.status === "cancelled");
});

test("parent preparation retries do not consume a new email delivery budget", async () => {
  const booking = await createBooking();
  const effect = await enqueueBookingEffect(db, booking.id, CONFIRMATION_NOTIFICATION_EFFECT);
  let referralCalls = 0;
  const referral = async () => {
    referralCalls += 1;
    if (referralCalls <= 7) throw new Error("referral temporarily unavailable");
  };
  for (let attempt = 1; attempt <= 7; attempt += 1) {
    const failed = await processConfirmationNotificationEffect(effect.id, {
      referral,
      drivers: channelDrivers(),
    });
    assert.equal(failed.status, "failed");
    await enqueueBookingEffect(db, booking.id, CONFIRMATION_NOTIFICATION_EFFECT);
  }
  const result = await processConfirmationNotificationEffect(effect.id, {
    referral,
    drivers: channelDrivers({
      email: async () => { throw new Error("first email failure"); },
    }),
  });
  assert.equal(result.status, "failed");
  const parent = await bookingEffectFor(booking.id, CONFIRMATION_NOTIFICATION_EFFECT);
  assert.equal(parent?.attempts, 8);
  assert.equal(parent?.referralAttempts, 8);
  assert.equal(parent?.referralStatus, "delivered");
  const email = (await bookingEffectDeliveriesFor(effect.id))
    .find((row) => row.channel === "email");
  assert.equal(email?.attempts, 1);
  assert.equal(email?.status, "failed", "child stays retryable on its own first attempt");
});

test("cancellation terminalization rolls back parent and children atomically", async () => {
  const booking = await createBooking();
  const effect = await enqueueBookingEffect(db, booking.id, CONFIRMATION_NOTIFICATION_EFFECT);
  await enqueueBookingEffectDeliveries(db, effect.id, [{
    recipientUserId: userId,
    channel: "email",
    dedupeKey: `booking:${booking.id}:${userId}:rollback:email`,
    payload: {
      userId,
      type: "booking_status_changed",
      title: "Rollback",
      email: MARK + "user@example.com",
      emailHtml: "<p>rollback</p>",
      dedupeKey: `booking:${booking.id}:${userId}:rollback`,
    },
  }]);
  await assert.rejects(db.transaction(async (tx) => {
    await cancelBookingConfirmationEffects(
      tx as unknown as typeof db,
      booking.id,
      "failure injection",
    );
    throw new Error("rollback terminalization");
  }), /rollback terminalization/);
  assert.equal((await bookingEffectFor(booking.id, CONFIRMATION_NOTIFICATION_EFFECT))?.status, "pending");
  assert.equal((await bookingEffectDeliveriesFor(effect.id))[0]?.status, "pending");
});

test("exhaustion reaper terminalizes parent and children in one transaction", async () => {
  const booking = await createBooking();
  const effect = await enqueueBookingEffect(db, booking.id, CONFIRMATION_NOTIFICATION_EFFECT);
  const [delivery] = await enqueueBookingEffectDeliveries(db, effect.id, [{
    recipientUserId: userId,
    channel: "email",
    dedupeKey: `booking:${booking.id}:${userId}:reaper:email`,
    payload: {
      userId,
      type: "booking_status_changed",
      title: "Reaper",
      email: MARK + "user@example.com",
      emailHtml: "<p>reaper</p>",
      dedupeKey: `booking:${booking.id}:${userId}:reaper`,
    },
  }]);
  await db
    .update(bookingEffectDeliveries)
    .set({ status: "failed", attempts: BOOKING_EFFECT_MAX_ATTEMPTS })
    .where(eq(bookingEffectDeliveries.id, delivery.id));

  await assert.rejects(db.transaction(async (tx) => {
    assert.equal(await reapExhaustedBookingEffectDeliveries(
      tx as unknown as typeof db,
      effect.id,
    ), 1);
    throw new Error("rollback reaper");
  }), /rollback reaper/);
  assert.equal((await bookingEffectFor(booking.id, CONFIRMATION_NOTIFICATION_EFFECT))?.status, "pending");
  assert.equal((await bookingEffectDeliveriesFor(effect.id))[0]?.status, "failed");

  await dueBookingEffectDeliveries(effect.id);
  assert.equal((await bookingEffectFor(booking.id, CONFIRMATION_NOTIFICATION_EFFECT))?.status, "dead_letter");
  assert.equal((await bookingEffectDeliveriesFor(effect.id))[0]?.status, "dead_letter");
});

test("heartbeat protects a slow channel worker beyond the original lease", async () => {
  const booking = await createBooking();
  const effect = await enqueueBookingEffect(db, booking.id, CONFIRMATION_NOTIFICATION_EFFECT);
  const [delivery] = await enqueueBookingEffectDeliveries(db, effect.id, [{
    recipientUserId: userId,
    channel: "email",
    dedupeKey: `booking:${booking.id}:${userId}:slow-test:email`,
    payload: {
      userId,
      type: "booking_status_changed",
      title: "Slow test",
      email: MARK + "user@example.com",
      emailHtml: "<p>slow</p>",
      dedupeKey: `booking:${booking.id}:${userId}:slow-test`,
    },
  }]);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const worker = processBookingEffectDelivery(
    delivery.id,
    async () => gate,
    { leaseMs: 120, heartbeatMs: 20 },
  );
  await new Promise((resolve) => setTimeout(resolve, 220));
  const stolen = await claimBookingEffectDelivery(delivery.id, { leaseMs: 120 });
  assert.equal(stolen, null, "renewed lease cannot be stolen by a second worker");
  release();
  assert.equal((await worker).status, "delivered");
});

test("permanent channel failure dead-letters and does not starve healthy work", async () => {
  const brokenBooking = await createBooking();
  const brokenEffect = await enqueueBookingEffect(db, brokenBooking.id, CONFIRMATION_NOTIFICATION_EFFECT);
  let terminalStatus = "";
  for (let attempt = 1; attempt <= BOOKING_EFFECT_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 1) {
      await enqueueBookingEffect(db, brokenBooking.id, CONFIRMATION_NOTIFICATION_EFFECT);
    }
    const result = await processConfirmationNotificationEffect(brokenEffect.id, {
      drivers: channelDrivers({ email: async () => { throw new Error("permanent email failure"); } }),
    });
    terminalStatus = result.status;
  }
  assert.equal(terminalStatus, "dead_letter");
  const dead = (await bookingEffectDeliveriesFor(brokenEffect.id))
    .find((row) => row.channel === "email");
  assert.equal(dead?.status, "dead_letter");
  assert.equal(dead?.attempts, BOOKING_EFFECT_MAX_ATTEMPTS);

  const healthyBooking = await createBooking();
  await enqueueBookingEffect(db, healthyBooking.id, CONFIRMATION_NOTIFICATION_EFFECT);
  const drained = await drainConfirmationNotificationOutbox({
    limit: 50,
    drivers: channelDrivers(),
  });
  assert.ok(drained.delivered >= 1, "healthy rows behind a dead letter still run");
  assert.ok(drained.terminal >= 1, "dead letters remain visible to monitoring");

  const secondDrain = await drainConfirmationNotificationOutbox({
    limit: 50,
    drivers: channelDrivers(),
  });
  assert.equal(secondDrain.newlyReportedTerminal, 0,
    "historical dead letters do not fail every scheduler run");
  assert.equal(await requeueBookingEffectDeadLetter(
    brokenEffect.id,
    "provider recovered",
  ), true);
  assert.equal((await bookingEffectFor(
    brokenBooking.id,
    CONFIRMATION_NOTIFICATION_EFFECT,
  ))?.status, "pending");
  await vendorCancelBooking(brokenBooking.id, "end requeue test");
});

test("provider timeout releases a wedged channel and lets healthy rows behind run", async () => {
  const booking = await createBooking();
  const effect = await enqueueBookingEffect(db, booking.id, CONFIRMATION_NOTIFICATION_EFFECT);
  let emails = 0;
  let emailIdempotencyKey = "";
  const started = Date.now();
  const result = await processConfirmationNotificationEffect(effect.id, {
    providerTimeoutMs: 25,
    drivers: {
      sendPushToUser: async () => new Promise(() => undefined),
      sendWhatsAppToUser: async () => ({ sent: true }),
      sendEmail: async (input) => {
        emails += 1;
        emailIdempotencyKey = input.idempotencyKey ?? "";
        return { data: { id: "ok" }, error: null };
      },
    },
  });
  assert.equal(result.status, "failed");
  assert.ok(Date.now() - started < 2_000, "never-resolving provider is bounded");
  assert.equal(emails, 1, "later healthy channel is not starved");
  assert.match(emailIdempotencyKey, new RegExp(`^booking:${booking.id}:.*:email$`));
  await vendorCancelBooking(booking.id, "end timeout test");
});

test("cron auth, Inngest recovery and API confirmation wiring stay active", async () => {
  const terminalBooking = await createBooking();
  const terminalEffect = await enqueueBookingEffect(
    db,
    terminalBooking.id,
    CONFIRMATION_NOTIFICATION_EFFECT,
  );
  await db
    .update(bookingEffectOutbox)
    .set({ status: "dead_letter", lastError: "monitoring test" })
    .where(eq(bookingEffectOutbox.id, terminalEffect.id));
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = MARK + "secret";
  try {
    const response = await cronGet(new NextRequest("http://localhost/api/cron/booking-confirmation-outbox"));
    assert.equal(response.status, 403);
    const authorized = await cronGet(new NextRequest(
      "http://localhost/api/cron/booking-confirmation-outbox",
      { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } },
    ));
    const health = await authorized.json() as { terminal: number; newlyReportedTerminal: number };
    assert.equal(authorized.status, 503, "a new dead letter is reported once");
    assert.ok(health.terminal >= 1);
    assert.ok(health.newlyReportedTerminal >= 1);
    const quiet = await cronGet(new NextRequest(
      "http://localhost/api/cron/booking-confirmation-outbox",
      { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } },
    ));
    assert.equal(quiet.status, 200, "reported historical dead letter no longer poisons cron");
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }

  const inngest = readFileSync("src/lib/inngest/functions.ts", "utf8");
  assert.match(inngest, /id:\s*"booking-confirmation-outbox"/);
  assert.match(inngest, /cron:\s*"\*\/5 \* \* \* \*"/);
  assert.match(inngest, /booking_confirmation_outbox_unhealthy/);
  const route = readFileSync("src/app/api/booking-requests/[id]/route.ts", "utf8");
  assert.match(route, /confirmBookingWithEffects/);
  assert.match(route, /replayConfirmationEffects/);
  assert.match(route, /scheduleConfirmationNotifications\(updated\)/);
  assert.match(route, /clientCancelBooking/);
  assert.match(route, /vendorCancelBooking/);
});
