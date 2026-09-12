/**
 * Durable booking-confirmation outbox regression suite.
 * Guarded disposable local DB only.
 * Run after migration 0031: npm run test:booking-outbox
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";

import { db } from "../src/lib/db";
import {
  bookingRequests,
  notifications,
  users,
} from "../src/lib/db/schema";
import {
  CONFIRMATION_NOTIFICATION_EFFECT,
  bookingEffectFor,
  claimBookingEffect,
  enqueueBookingEffect,
  markBookingEffectDelivered,
} from "../src/lib/booking/effect-outbox";
import { persistConfirmationEffects } from "../src/lib/booking/confirmation-persist";
import {
  processConfirmationNotificationEffect,
} from "../src/lib/booking/confirmation-effects";
import { dispatchNotification } from "../src/lib/notifications/dispatch";

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

before(async () => {
  // Fail clearly instead of running against a pre-0031 disposable schema.
  // `run-guarded-db-test` has already verified the local marker.
  const columns = await db.execute(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'booking_effect_outbox'
      AND column_name = 'status'
  `) as unknown as Array<{ column_name: string }>;
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error("Migration 0031 is required before the booking outbox regression suite.");
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
  await db.delete(bookingRequests).where(eq(bookingRequests.clientUserId, userId));
  await db.delete(users).where(eq(users.id, userId));
});

test("confirmation and pending outbox row commit or roll back together", async () => {
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

  const confirmed = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(bookingRequests)
      .set({ status: "confirmed_by_client", confirmedAt: new Date() })
      .where(eq(bookingRequests.id, booking.id))
      .returning();
    return persistConfirmationEffects(tx as unknown as typeof db, row);
  });
  const pending = await bookingEffectFor(confirmed.id, CONFIRMATION_NOTIFICATION_EFFECT);
  assert.equal(pending?.status, "pending");

  let deliveries = 0;
  const result = await processConfirmationNotificationEffect(pending!.id, {
    deliver: async () => { deliveries += 1; },
  });
  assert.equal(result.status, "delivered");
  assert.equal(deliveries, 1);
});

test("expired lease recovers crashes before/after delivery and fences stale worker", async () => {
  const booking = await createBooking();
  const effect = await enqueueBookingEffect(db, booking.id, CONFIRMATION_NOTIFICATION_EFFECT);
  const now = new Date("2028-01-01T00:00:00.000Z");
  const stale = await claimBookingEffect(effect.id, {
    now,
    leaseMs: 1_000,
    leaseToken: randomUUID(),
  });
  assert.equal(stale?.status, "processing");
  assert.equal(stale?.attempts, 1);

  const early = await processConfirmationNotificationEffect(effect.id, {
    now: new Date(now.getTime() + 999),
    deliver: async () => assert.fail("live lease must not be stolen"),
  });
  assert.equal(early.status, "not_due");

  // A provider may have accepted the first delivery just before the process
  // died. Recovery deliberately sends again (external at-least-once).
  let externalAttempts = 1;
  const retried = await processConfirmationNotificationEffect(effect.id, {
    now: new Date(now.getTime() + 1_001),
    deliver: async () => { externalAttempts += 1; },
  });
  assert.equal(retried.status, "delivered");
  if (retried.status === "delivered") assert.equal(retried.effect.attempts, 2);
  assert.equal(externalAttempts, 2);
  assert.equal(await markBookingEffectDelivered(stale!), null, "stale lease token is fenced");
});

test("failure stays retryable; replay pulls it forward; delivered is last", async () => {
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
  let retries = 0;
  const delivered = await processConfirmationNotificationEffect(effect.id, {
    now: new Date(rescheduled.nextAttemptAt.getTime() + 1),
    deliver: async () => { retries += 1; },
  });
  assert.equal(delivered.status, "delivered");
  if (delivered.status === "delivered") {
    assert.equal(delivered.effect.attempts, 2);
    assert.ok(delivered.effect.deliveredAt);
  }
  assert.equal(retries, 1);
});

test("concurrent workers cannot hold the same live lease", async () => {
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

test("durable retry keeps one DB notification and retries external channels", async () => {
  const dedupeKey = MARK + "durable-notification";
  let pushes = 0;
  let whatsapps = 0;
  let emails = 0;
  let failEmail = true;
  const drivers = {
    sendPushToUser: async () => { pushes += 1; return { sent: 1, pruned: 0, failed: 0 }; },
    sendWhatsAppToUser: async () => { whatsapps += 1; return { sent: true }; },
    sendEmail: async () => {
      emails += 1;
      if (failEmail) throw new Error("email down");
      return { data: { id: "ok" }, error: null };
    },
  };
  const input = {
    userId,
    type: "booking_status_changed",
    title: "Confirmată",
    message: "Booking confirmed",
    actionUrl: "/cabinet/rezervari",
    email: MARK + "user@example.com",
    emailHtml: "<p>Confirmed</p>",
    dedupeKey,
  };
  await assert.rejects(
    dispatchNotification(input, { delivery: "durable", drivers }),
    /notification_channel_delivery_failed/,
  );
  failEmail = false;
  await dispatchNotification(input, { delivery: "durable", drivers });

  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.dedupeKey, dedupeKey)));
  assert.equal(rows.length, 1);
  assert.equal(pushes, 2, "at-least-once push retries after partial delivery");
  assert.equal(whatsapps, 2);
  assert.equal(emails, 2);
});
