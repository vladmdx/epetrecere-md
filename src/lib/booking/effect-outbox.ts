import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import {
  bookingEffectDeliveries,
  bookingEffectOutbox,
  type BookingEffectChannel,
} from "@/lib/db/schema";
import { db } from "@/lib/db";
import {
  BOOKING_EFFECT_LEASE_MS,
  BOOKING_EFFECT_MAX_ATTEMPTS,
  bookingEffectError,
  bookingEffectHeartbeatMs,
  bookingEffectRetryDelayMs,
} from "./effect-outbox-policy";

type Executor = typeof db;
export type BookingEffect = typeof bookingEffectOutbox.$inferSelect;
export type BookingEffectDelivery = typeof bookingEffectDeliveries.$inferSelect;
export type BookingEffectPayload = BookingEffectDelivery["payload"];

// Keep the 0030 key so rows created by the old one-shot implementation are
// recovered by 0031 instead of becoming invisible to the worker.
export const CONFIRMATION_NOTIFICATION_EFFECT = "confirm_notify";

export type BookingEffectClockOptions = {
  now?: Date;
  leaseMs?: number;
  leaseToken?: string;
  /** Test seam; production uses the wall clock. */
  clock?: () => Date;
  /** Test seam. Defaults to one third of the lease, capped at 30 seconds. */
  heartbeatMs?: number;
};

export type BookingEffectProcessResult =
  | { status: "delivered"; effect: BookingEffect }
  | { status: "failed"; effect: BookingEffect; error: string }
  | { status: "dead_letter"; effect: BookingEffect; error: string }
  | { status: "cancelled"; effect: BookingEffect }
  | { status: "not_due" };

export type BookingEffectDeliveryProcessResult =
  | { status: "delivered"; delivery: BookingEffectDelivery }
  | { status: "failed"; delivery: BookingEffectDelivery; error: string }
  | { status: "dead_letter"; delivery: BookingEffectDelivery; error: string }
  | { status: "cancelled"; delivery: BookingEffectDelivery }
  | { status: "not_due" };

export class BookingEffectCancelledError extends Error {
  constructor() {
    super("booking_effect_cancelled");
    this.name = "BookingEffectCancelledError";
  }
}

export class BookingEffectDeadLetterError extends Error {
  constructor(message = "booking_effect_delivery_dead_letter") {
    super(message);
    this.name = "BookingEffectDeadLetterError";
  }
}

function retryableEffectAt(now: Date) {
  return or(
    and(
      inArray(bookingEffectOutbox.status, ["pending", "failed"]),
      lt(bookingEffectOutbox.attempts, BOOKING_EFFECT_MAX_ATTEMPTS),
      lte(bookingEffectOutbox.nextAttemptAt, now),
    ),
    and(
      eq(bookingEffectOutbox.status, "processing"),
      lt(bookingEffectOutbox.attempts, BOOKING_EFFECT_MAX_ATTEMPTS),
      or(
        isNull(bookingEffectOutbox.leaseUntil),
        lte(bookingEffectOutbox.leaseUntil, now),
      ),
    ),
  );
}

function retryableDeliveryAt(now: Date) {
  return or(
    and(
      inArray(bookingEffectDeliveries.status, ["pending", "failed"]),
      lt(bookingEffectDeliveries.attempts, BOOKING_EFFECT_MAX_ATTEMPTS),
      lte(bookingEffectDeliveries.nextAttemptAt, now),
    ),
    and(
      eq(bookingEffectDeliveries.status, "processing"),
      lt(bookingEffectDeliveries.attempts, BOOKING_EFFECT_MAX_ATTEMPTS),
      or(
        isNull(bookingEffectDeliveries.leaseUntil),
        lte(bookingEffectDeliveries.leaseUntil, now),
      ),
    ),
  );
}

async function withLeaseHeartbeat<T>(
  renew: () => Promise<boolean>,
  work: () => Promise<T>,
  intervalMs: number,
): Promise<T> {
  let renewal: Promise<void> | null = null;
  let leaseLost = false;
  const tick = () => {
    if (renewal || leaseLost) return;
    renewal = renew()
      .then((ok) => {
        if (!ok) leaseLost = true;
      })
      .catch(() => {
        leaseLost = true;
      })
      .finally(() => {
        renewal = null;
      });
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  try {
    const value = await work();
    if (renewal) await renewal;
    if (leaseLost) throw new Error("booking_effect_lease_lost");
    return value;
  } finally {
    clearInterval(timer);
  }
}

/**
 * Persist the coordinator before the confirmation transaction commits.
 * Explicit replay pulls pending/failed coordinator and child work forward;
 * delivered, cancelled, dead-lettered and live processing rows stay terminal.
 */
export async function enqueueBookingEffect(
  executor: Executor,
  bookingId: number,
  effectKey: string,
): Promise<BookingEffect> {
  const now = new Date();
  const [inserted] = await executor
    .insert(bookingEffectOutbox)
    .values({
      bookingId,
      effectKey,
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
    })
    .onConflictDoNothing()
    .returning();
  if (inserted) return inserted;

  const [rescheduled] = await executor
    .update(bookingEffectOutbox)
    .set({
      status: "pending",
      nextAttemptAt: now,
      lastError: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(bookingEffectOutbox.bookingId, bookingId),
        eq(bookingEffectOutbox.effectKey, effectKey),
        inArray(bookingEffectOutbox.status, ["pending", "failed"]),
      ),
    )
    .returning();
  if (rescheduled) {
    await rescheduleBookingEffectDeliveries(executor, rescheduled.id, now);
    return rescheduled;
  }

  const [existing] = await executor
    .select()
    .from(bookingEffectOutbox)
    .where(
      and(
        eq(bookingEffectOutbox.bookingId, bookingId),
        eq(bookingEffectOutbox.effectKey, effectKey),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("booking_effect_enqueue_lost");
  return existing;
}

/** Atomic CAS claim. Expired processing leases are eligible for recovery. */
export async function claimBookingEffect(
  effectId: number,
  options: BookingEffectClockOptions = {},
): Promise<BookingEffect | null> {
  const now = options.now ?? new Date();
  const token = options.leaseToken ?? randomUUID();
  const leaseUntil = new Date(now.getTime() + (options.leaseMs ?? BOOKING_EFFECT_LEASE_MS));
  const [claimed] = await db
    .update(bookingEffectOutbox)
    .set({
      status: "processing",
      attempts: sql`${bookingEffectOutbox.attempts} + 1`,
      leaseToken: token,
      leaseUntil,
      lastError: null,
      updatedAt: now,
    })
    .where(and(eq(bookingEffectOutbox.id, effectId), retryableEffectAt(now)))
    .returning();
  return claimed ?? null;
}

export async function renewBookingEffectLease(
  effect: Pick<BookingEffect, "id" | "leaseToken">,
  options: BookingEffectClockOptions = {},
): Promise<boolean> {
  if (!effect.leaseToken) return false;
  const now = options.clock?.() ?? new Date();
  const [renewed] = await db
    .update(bookingEffectOutbox)
    .set({
      leaseUntil: new Date(now.getTime() + (options.leaseMs ?? BOOKING_EFFECT_LEASE_MS)),
      updatedAt: now,
    })
    .where(and(
      eq(bookingEffectOutbox.id, effect.id),
      eq(bookingEffectOutbox.status, "processing"),
      eq(bookingEffectOutbox.leaseToken, effect.leaseToken),
    ))
    .returning({ id: bookingEffectOutbox.id });
  return Boolean(renewed);
}

export async function markBookingEffectDelivered(
  effect: Pick<BookingEffect, "id" | "leaseToken">,
  now = new Date(),
): Promise<BookingEffect | null> {
  if (!effect.leaseToken) return null;
  const [delivered] = await db
    .update(bookingEffectOutbox)
    .set({
      status: "delivered",
      deliveredAt: now,
      leaseToken: null,
      leaseUntil: null,
      lastError: null,
      updatedAt: now,
    })
    .where(and(
      eq(bookingEffectOutbox.id, effect.id),
      eq(bookingEffectOutbox.status, "processing"),
      eq(bookingEffectOutbox.leaseToken, effect.leaseToken),
    ))
    .returning();
  return delivered ?? null;
}

async function finishBookingEffect(
  effect: Pick<BookingEffect, "id" | "leaseToken" | "attempts">,
  status: "failed" | "dead_letter" | "cancelled",
  error: unknown,
  now = new Date(),
): Promise<BookingEffect | null> {
  if (!effect.leaseToken) return null;
  const [finished] = await db
    .update(bookingEffectOutbox)
    .set({
      status,
      nextAttemptAt: status === "failed"
        ? new Date(now.getTime() + bookingEffectRetryDelayMs(effect.attempts))
        : now,
      leaseToken: null,
      leaseUntil: null,
      lastError: status === "cancelled" ? "booking_cancelled" : bookingEffectError(error),
      updatedAt: now,
    })
    .where(and(
      eq(bookingEffectOutbox.id, effect.id),
      eq(bookingEffectOutbox.status, "processing"),
      eq(bookingEffectOutbox.leaseToken, effect.leaseToken),
    ))
    .returning();
  if (finished && status === "dead_letter") {
    await deadLetterBookingEffectDeliveries(
      finished.id,
      bookingEffectError(error),
      now,
    );
  }
  return finished ?? null;
}

export async function markBookingEffectFailed(
  effect: Pick<BookingEffect, "id" | "leaseToken" | "attempts">,
  error: unknown,
  now = new Date(),
): Promise<BookingEffect | null> {
  const status = effect.attempts >= BOOKING_EFFECT_MAX_ATTEMPTS
    ? "dead_letter"
    : "failed";
  return finishBookingEffect(effect, status, error, now);
}

/** Process one coordinator. External I/O happens only after a durable claim. */
export async function processBookingEffect(
  effectId: number,
  deliver: (effect: BookingEffect) => Promise<void>,
  options: BookingEffectClockOptions = {},
): Promise<BookingEffectProcessResult> {
  const claimed = await claimBookingEffect(effectId, options);
  if (!claimed) return { status: "not_due" };
  const leaseMs = options.leaseMs ?? BOOKING_EFFECT_LEASE_MS;
  try {
    await withLeaseHeartbeat(
      () => renewBookingEffectLease(claimed, options),
      () => deliver(claimed),
      options.heartbeatMs ?? bookingEffectHeartbeatMs(leaseMs),
    );
    const delivered = await markBookingEffectDelivered(claimed, options.now ?? new Date());
    return delivered ? { status: "delivered", effect: delivered } : { status: "not_due" };
  } catch (error) {
    if (error instanceof BookingEffectCancelledError) {
      const cancelled = await finishBookingEffect(claimed, "cancelled", error, options.now ?? new Date());
      return cancelled ? { status: "cancelled", effect: cancelled } : { status: "not_due" };
    }
    const message = bookingEffectError(error);
    const terminal = error instanceof BookingEffectDeadLetterError
      ? await finishBookingEffect(claimed, "dead_letter", error, options.now ?? new Date())
      : await markBookingEffectFailed(claimed, error, options.now ?? new Date());
    if (!terminal) return { status: "not_due" };
    return terminal.status === "dead_letter"
      ? { status: "dead_letter", effect: terminal, error: message }
      : { status: "failed", effect: terminal, error: message };
  }
}

async function reapExhaustedEffects(now: Date): Promise<void> {
  const exhausted = await db
    .update(bookingEffectOutbox)
    .set({
      status: "dead_letter",
      leaseToken: null,
      leaseUntil: null,
      lastError: sql`COALESCE(${bookingEffectOutbox.lastError}, 'maximum attempts exhausted')`,
      updatedAt: now,
    })
    .where(or(
      and(
        inArray(bookingEffectOutbox.status, ["pending", "failed"]),
        sql`${bookingEffectOutbox.attempts} >= ${BOOKING_EFFECT_MAX_ATTEMPTS}`,
      ),
      and(
        eq(bookingEffectOutbox.status, "processing"),
        sql`${bookingEffectOutbox.attempts} >= ${BOOKING_EFFECT_MAX_ATTEMPTS}`,
        lte(bookingEffectOutbox.leaseUntil, now),
      ),
    ))
    .returning({ id: bookingEffectOutbox.id });
  for (const effect of exhausted) {
    await deadLetterBookingEffectDeliveries(
      effect.id,
      "coordinator maximum attempts exhausted",
      now,
    );
  }
}

export async function dueBookingEffects(
  effectKey: string,
  limit: number,
  now = new Date(),
): Promise<BookingEffect[]> {
  await reapExhaustedEffects(now);
  return db
    .select()
    .from(bookingEffectOutbox)
    .where(and(eq(bookingEffectOutbox.effectKey, effectKey), retryableEffectAt(now)))
    .orderBy(asc(bookingEffectOutbox.nextAttemptAt), asc(bookingEffectOutbox.id))
    .limit(Math.max(1, Math.min(limit, 100)));
}

export async function bookingEffectFor(
  bookingId: number,
  effectKey: string,
): Promise<BookingEffect | null> {
  const [effect] = await db
    .select()
    .from(bookingEffectOutbox)
    .where(and(
      eq(bookingEffectOutbox.bookingId, bookingId),
      eq(bookingEffectOutbox.effectKey, effectKey),
    ))
    .limit(1);
  return effect ?? null;
}

export async function enqueueBookingEffectDeliveries(
  executor: Executor,
  effectId: number,
  deliveries: Array<{
    recipientUserId: string;
    channel: BookingEffectChannel;
    dedupeKey: string;
    payload: BookingEffectPayload;
  }>,
): Promise<BookingEffectDelivery[]> {
  if (deliveries.length > 0) {
    await executor
      .insert(bookingEffectDeliveries)
      .values(deliveries.map((delivery) => ({
        effectId,
        ...delivery,
        status: "pending" as const,
        attempts: 0,
        nextAttemptAt: new Date(),
      })))
      .onConflictDoNothing();
  }
  return bookingEffectDeliveriesFor(effectId, executor);
}

export async function bookingEffectDeliveriesFor(
  effectId: number,
  executor: Executor = db,
): Promise<BookingEffectDelivery[]> {
  return executor
    .select()
    .from(bookingEffectDeliveries)
    .where(eq(bookingEffectDeliveries.effectId, effectId))
    .orderBy(asc(bookingEffectDeliveries.id));
}

export async function rescheduleBookingEffectDeliveries(
  executor: Executor,
  effectId: number,
  now = new Date(),
): Promise<void> {
  await executor
    .update(bookingEffectDeliveries)
    .set({ nextAttemptAt: now, lastError: null, updatedAt: now })
    .where(and(
      eq(bookingEffectDeliveries.effectId, effectId),
      inArray(bookingEffectDeliveries.status, ["pending", "failed"]),
    ));
}

async function deadLetterBookingEffectDeliveries(
  effectId: number,
  reason: string,
  now = new Date(),
): Promise<void> {
  await db
    .update(bookingEffectDeliveries)
    .set({
      status: "dead_letter",
      leaseToken: null,
      leaseUntil: null,
      lastError: reason,
      updatedAt: now,
    })
    .where(and(
      eq(bookingEffectDeliveries.effectId, effectId),
      inArray(bookingEffectDeliveries.status, ["pending", "processing", "failed"]),
    ));
}

export async function claimBookingEffectDelivery(
  deliveryId: number,
  options: BookingEffectClockOptions = {},
): Promise<BookingEffectDelivery | null> {
  const now = options.now ?? new Date();
  const token = options.leaseToken ?? randomUUID();
  const leaseUntil = new Date(now.getTime() + (options.leaseMs ?? BOOKING_EFFECT_LEASE_MS));
  const [claimed] = await db
    .update(bookingEffectDeliveries)
    .set({
      status: "processing",
      attempts: sql`${bookingEffectDeliveries.attempts} + 1`,
      leaseToken: token,
      leaseUntil,
      lastError: null,
      updatedAt: now,
    })
    .where(and(eq(bookingEffectDeliveries.id, deliveryId), retryableDeliveryAt(now)))
    .returning();
  return claimed ?? null;
}

export async function renewBookingEffectDeliveryLease(
  delivery: Pick<BookingEffectDelivery, "id" | "leaseToken">,
  options: BookingEffectClockOptions = {},
): Promise<boolean> {
  if (!delivery.leaseToken) return false;
  const now = options.clock?.() ?? new Date();
  const [renewed] = await db
    .update(bookingEffectDeliveries)
    .set({
      leaseUntil: new Date(now.getTime() + (options.leaseMs ?? BOOKING_EFFECT_LEASE_MS)),
      updatedAt: now,
    })
    .where(and(
      eq(bookingEffectDeliveries.id, delivery.id),
      eq(bookingEffectDeliveries.status, "processing"),
      eq(bookingEffectDeliveries.leaseToken, delivery.leaseToken),
    ))
    .returning({ id: bookingEffectDeliveries.id });
  return Boolean(renewed);
}

async function finishBookingEffectDelivery(
  delivery: Pick<BookingEffectDelivery, "id" | "leaseToken" | "attempts">,
  status: "delivered" | "failed" | "dead_letter" | "cancelled",
  error: unknown,
  now = new Date(),
): Promise<BookingEffectDelivery | null> {
  if (!delivery.leaseToken) return null;
  const [finished] = await db
    .update(bookingEffectDeliveries)
    .set({
      status,
      nextAttemptAt: status === "failed"
        ? new Date(now.getTime() + bookingEffectRetryDelayMs(delivery.attempts))
        : now,
      leaseToken: null,
      leaseUntil: null,
      lastError: status === "delivered"
        ? null
        : status === "cancelled"
          ? "booking_cancelled"
          : bookingEffectError(error),
      deliveredAt: status === "delivered" ? now : null,
      updatedAt: now,
    })
    .where(and(
      eq(bookingEffectDeliveries.id, delivery.id),
      eq(bookingEffectDeliveries.status, "processing"),
      eq(bookingEffectDeliveries.leaseToken, delivery.leaseToken),
    ))
    .returning();
  return finished ?? null;
}

export async function processBookingEffectDelivery(
  deliveryId: number,
  deliver: (delivery: BookingEffectDelivery) => Promise<void>,
  options: BookingEffectClockOptions = {},
): Promise<BookingEffectDeliveryProcessResult> {
  const claimed = await claimBookingEffectDelivery(deliveryId, options);
  if (!claimed) return { status: "not_due" };
  const leaseMs = options.leaseMs ?? BOOKING_EFFECT_LEASE_MS;
  try {
    await withLeaseHeartbeat(
      () => renewBookingEffectDeliveryLease(claimed, options),
      () => deliver(claimed),
      options.heartbeatMs ?? bookingEffectHeartbeatMs(leaseMs),
    );
    const delivered = await finishBookingEffectDelivery(
      claimed,
      "delivered",
      null,
      options.now ?? new Date(),
    );
    return delivered
      ? { status: "delivered", delivery: delivered }
      : { status: "not_due" };
  } catch (error) {
    if (error instanceof BookingEffectCancelledError) {
      const cancelled = await finishBookingEffectDelivery(
        claimed,
        "cancelled",
        error,
        options.now ?? new Date(),
      );
      return cancelled
        ? { status: "cancelled", delivery: cancelled }
        : { status: "not_due" };
    }
    const status = claimed.attempts >= BOOKING_EFFECT_MAX_ATTEMPTS
      ? "dead_letter"
      : "failed";
    const failed = await finishBookingEffectDelivery(
      claimed,
      status,
      error,
      options.now ?? new Date(),
    );
    if (!failed) return { status: "not_due" };
    const message = bookingEffectError(error);
    return status === "dead_letter"
      ? { status, delivery: failed, error: message }
      : { status, delivery: failed, error: message };
  }
}

export async function dueBookingEffectDeliveries(
  effectId: number,
  limit = 100,
  now = new Date(),
): Promise<BookingEffectDelivery[]> {
  await db
    .update(bookingEffectDeliveries)
    .set({
      status: "dead_letter",
      leaseToken: null,
      leaseUntil: null,
      lastError: sql`COALESCE(${bookingEffectDeliveries.lastError}, 'maximum attempts exhausted')`,
      updatedAt: now,
    })
    .where(and(
      eq(bookingEffectDeliveries.effectId, effectId),
      or(
        and(
          inArray(bookingEffectDeliveries.status, ["pending", "failed"]),
          sql`${bookingEffectDeliveries.attempts} >= ${BOOKING_EFFECT_MAX_ATTEMPTS}`,
        ),
        and(
          eq(bookingEffectDeliveries.status, "processing"),
          sql`${bookingEffectDeliveries.attempts} >= ${BOOKING_EFFECT_MAX_ATTEMPTS}`,
          lte(bookingEffectDeliveries.leaseUntil, now),
        ),
      ),
    ));
  return db
    .select()
    .from(bookingEffectDeliveries)
    .where(and(
      eq(bookingEffectDeliveries.effectId, effectId),
      retryableDeliveryAt(now),
    ))
    .orderBy(asc(bookingEffectDeliveries.nextAttemptAt), asc(bookingEffectDeliveries.id))
    .limit(Math.max(1, Math.min(limit, 200)));
}

/** Atomically invalidates every confirmation delivery not already complete. */
export async function cancelBookingConfirmationEffects(
  executor: Executor,
  bookingId: number,
  reason = "booking_cancelled",
): Promise<void> {
  const effects = await executor
    .select({ id: bookingEffectOutbox.id })
    .from(bookingEffectOutbox)
    .where(and(
      eq(bookingEffectOutbox.bookingId, bookingId),
      eq(bookingEffectOutbox.effectKey, CONFIRMATION_NOTIFICATION_EFFECT),
    ));
  if (effects.length === 0) return;
  const ids = effects.map(({ id }) => id);
  const now = new Date();
  await executor
    .update(bookingEffectDeliveries)
    .set({
      status: "cancelled",
      leaseToken: null,
      leaseUntil: null,
      lastError: reason,
      updatedAt: now,
    })
    .where(and(
      inArray(bookingEffectDeliveries.effectId, ids),
      inArray(bookingEffectDeliveries.status, ["pending", "processing", "failed", "dead_letter"]),
    ));
  await executor
    .update(bookingEffectOutbox)
    .set({
      status: "cancelled",
      leaseToken: null,
      leaseUntil: null,
      lastError: reason,
      updatedAt: now,
    })
    .where(and(
      inArray(bookingEffectOutbox.id, ids),
      inArray(bookingEffectOutbox.status, ["pending", "processing", "failed", "dead_letter"]),
    ));
}
