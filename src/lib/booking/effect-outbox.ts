import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, like, lt, lte, or, sql } from "drizzle-orm";
import {
  bookingEffectDeliveries,
  bookingEffectOutbox,
  bookingRequests,
  notifications,
  users,
  type BookingEffectChannel,
} from "@/lib/db/schema";
import { db } from "@/lib/db";
import {
  BOOKING_EFFECT_LEASE_MS,
  BOOKING_EFFECT_MAX_ATTEMPTS,
  BOOKING_EFFECT_PROVIDER_TIMEOUT_MS,
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
export const BOOKING_CREATION_NOTIFICATION_EFFECT = "create_notify";

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

export class BookingEffectRetryAtError extends Error {
  readonly retryAt: Date;

  constructor(error: unknown, retryAt: Date) {
    super(bookingEffectError(error), { cause: error });
    this.name = "BookingEffectRetryAtError";
    this.retryAt = retryAt;
  }
}

function retryableEffectAt(now: Date) {
  return or(
    and(
      inArray(bookingEffectOutbox.status, ["pending", "failed"]),
      lte(bookingEffectOutbox.nextAttemptAt, now),
    ),
    and(
      eq(bookingEffectOutbox.status, "processing"),
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
      inArray(bookingEffectDeliveries.status, ["processing", "dispatching"]),
      lt(bookingEffectDeliveries.attempts, BOOKING_EFFECT_MAX_ATTEMPTS),
      isNull(bookingEffectDeliveries.cancelRequestedAt),
      or(
        isNull(bookingEffectDeliveries.leaseUntil),
        lte(bookingEffectDeliveries.leaseUntil, now),
      ),
    ),
  );
}

// A fixed two-int advisory-lock namespace avoids collisions with the artist
// and venue availability locks. The commit that wins this barrier defines the
// ordering between cancellation and the start of provider delivery.
const BOOKING_CONFIRMATION_BARRIER_NAMESPACE = 1162888532;

export async function acquireBookingConfirmationBarrier(
  executor: Executor,
  bookingId: number,
): Promise<void> {
  await executor.execute(sql`
    SELECT pg_advisory_xact_lock(
      ${BOOKING_CONFIRMATION_BARRIER_NAMESPACE},
      ${bookingId}
    )
  `);
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
      referralNextAttemptAt: now,
      materializationNextAttemptAt: now,
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
  const leaseToken = effect.leaseToken;
  if (!leaseToken) return false;
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
      eq(bookingEffectOutbox.leaseToken, leaseToken),
    ))
    .returning({ id: bookingEffectOutbox.id });
  return Boolean(renewed);
}

export async function markBookingEffectDelivered(
  effect: Pick<BookingEffect, "id" | "leaseToken">,
  now = new Date(),
): Promise<BookingEffect | null> {
  const leaseToken = effect.leaseToken;
  if (!leaseToken) return null;
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
      eq(bookingEffectOutbox.leaseToken, leaseToken),
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
  const leaseToken = effect.leaseToken;
  if (!leaseToken) return null;
  return db.transaction(async (tx) => {
    const executor = tx as unknown as Executor;
    const [finished] = await executor
      .update(bookingEffectOutbox)
      .set({
        status,
        nextAttemptAt: status === "failed"
          ? error instanceof BookingEffectRetryAtError
            ? error.retryAt
            : new Date(now.getTime() + bookingEffectRetryDelayMs(effect.attempts))
          : now,
        leaseToken: null,
        leaseUntil: null,
        lastError: status === "cancelled" ? "booking_cancelled" : bookingEffectError(error),
        updatedAt: now,
      })
      .where(and(
        eq(bookingEffectOutbox.id, effect.id),
        eq(bookingEffectOutbox.status, "processing"),
        eq(bookingEffectOutbox.leaseToken, leaseToken),
      ))
      .returning();
    if (finished && status === "dead_letter") {
      await executor
        .update(bookingEffectDeliveries)
        .set({
          status: "dead_letter",
          leaseToken: null,
          leaseUntil: null,
          lastError: bookingEffectError(error),
          updatedAt: now,
        })
        .where(and(
          eq(bookingEffectDeliveries.effectId, finished.id),
          inArray(bookingEffectDeliveries.status, ["pending", "processing", "failed"]),
        ));
    }
    return finished ?? null;
  });
}

export async function markBookingEffectFailed(
  effect: Pick<BookingEffect, "id" | "leaseToken" | "attempts">,
  error: unknown,
  now = new Date(),
): Promise<BookingEffect | null> {
  // Coordinator attempts are an audit counter only. Referral,
  // materialisation and every delivery own independent retry budgets.
  return finishBookingEffect(effect, "failed", error, now);
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
    if (!terminal) {
      const [current] = await db
        .select()
        .from(bookingEffectOutbox)
        .where(eq(bookingEffectOutbox.id, claimed.id))
        .limit(1);
      if (current?.status === "dead_letter") {
        return { status: "dead_letter", effect: current, error: message };
      }
      if (current?.status === "cancelled") {
        return { status: "cancelled", effect: current };
      }
      return { status: "not_due" };
    }
    return terminal.status === "dead_letter"
      ? { status: "dead_letter", effect: terminal, error: message }
      : { status: "failed", effect: terminal, error: message };
  }
}

export async function dueBookingEffects(
  effectKey: string,
  limit: number,
  now = new Date(),
): Promise<BookingEffect[]> {
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
      inArray(bookingEffectDeliveries.status, ["processing", "dispatching"]),
      eq(bookingEffectDeliveries.leaseToken, delivery.leaseToken),
    ))
    .returning({ id: bookingEffectDeliveries.id });
  return Boolean(renewed);
}

/**
 * Linearisation point for provider delivery. Both cancellation and this
 * permit take the same per-booking advisory transaction lock.
 *
 * - cancellation commits first: the status check fails and provider I/O is
 *   never started;
 * - this transaction takes the barrier first: provider I/O starts while the
 *   barrier is held, so cancellation cannot commit until the bounded call
 *   and its delivery settlement finish. The provider result and child state
 *   therefore become visible before cancellation can inspect the row.
 */
async function withBookingEffectDeliveryDispatchPermitPolicy<T>(
  bookingId: number,
  delivery: Pick<BookingEffectDelivery, "id" | "leaseToken" | "recipientUserId">,
  dispatch: (permitted: BookingEffectDelivery, executor: Executor) => Promise<T>,
  now = new Date(),
  statementTimeoutMs = BOOKING_EFFECT_PROVIDER_TIMEOUT_MS,
  eligibility: "confirmed" | "exists" = "confirmed",
  requireRecipientUser = true,
): Promise<{ permitted: false } | { permitted: true; value: T }> {
  const leaseToken = delivery.leaseToken;
  if (!leaseToken) return { permitted: false };
  return db.transaction(async (tx) => {
    const executor = tx as unknown as Executor;
    // The callback reuses this executor. Besides avoiding pool re-entry while
    // the advisory lock is held, this server-side deadline also bounds the
    // lock wait and in-app insert (Promise.race cannot safely cancel a
    // database statement).
    await executor.execute(sql`
      SELECT set_config(
        'statement_timeout',
        ${String(Math.max(1, Math.floor(statementTimeoutMs)))},
        true
      )
    `);
    // Account erasure locks the actor first and then scrubs outbox rows. Take
    // the recipient lock before the booking barrier/child row as well, so an
    // in-app FK insert cannot form user -> child / child -> user deadlocks.
    // Synthetic direct-email recipients simply produce no row here.
    const [recipient] = await executor
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, delivery.recipientUserId))
      .for("share")
      .limit(1);
    if (requireRecipientUser && !recipient) {
      return { permitted: false } as const;
    }
    await acquireBookingConfirmationBarrier(executor, bookingId);
    const [active] = await executor
      .select({ status: bookingRequests.status })
      .from(bookingRequests)
      .where(eq(bookingRequests.id, bookingId))
      .limit(1);
    if (
      !active
      || (
        eligibility === "confirmed"
        && active.status !== "confirmed_by_client"
        && active.status !== "completed"
      )
    ) {
      return { permitted: false } as const;
    }
    const [permitted] = await executor
      .update(bookingEffectDeliveries)
      .set({
        status: "dispatching",
        dispatchStartedAt: now,
        updatedAt: now,
      })
      .where(and(
        eq(bookingEffectDeliveries.id, delivery.id),
        eq(bookingEffectDeliveries.status, "processing"),
        eq(bookingEffectDeliveries.leaseToken, leaseToken),
        isNull(bookingEffectDeliveries.cancelRequestedAt),
      ))
      .returning();
    if (!permitted) return { permitted: false } as const;
    // This is intentionally inside the transaction-level advisory lock. Every
    // production dispatch is bounded by a provider timeout shorter than the
    // lease, so cancellation waits for a finite, defined interval. Database
    // work in the callback must use `executor`, never the global pool.
    // External channel dispatchers own an abortable provider deadline. Do not
    // race away here: a losing Promise.race would release the booking barrier
    // while a push/e-mail request could still be accepted by the provider.
    const value = await dispatch(permitted, executor);
    const [settled] = await executor
      .update(bookingEffectDeliveries)
      .set({
        status: "delivered",
        nextAttemptAt: now,
        leaseToken: null,
        leaseUntil: null,
        lastError: null,
        deliveredAt: now,
        updatedAt: now,
      })
      .where(and(
        eq(bookingEffectDeliveries.id, permitted.id),
        eq(bookingEffectDeliveries.status, "dispatching"),
        eq(bookingEffectDeliveries.leaseToken, leaseToken),
        isNull(bookingEffectDeliveries.cancelRequestedAt),
      ))
      .returning({ id: bookingEffectDeliveries.id });
    if (!settled) throw new Error("booking_effect_delivery_settlement_lost");
    return { permitted: true, value } as const;
  });
}

/** Final-confirmation delivery permit; cancelled bookings are suppressed. */
export async function withBookingEffectDeliveryDispatchPermit<T>(
  bookingId: number,
  delivery: Pick<BookingEffectDelivery, "id" | "leaseToken" | "recipientUserId">,
  dispatch: (permitted: BookingEffectDelivery, executor: Executor) => Promise<T>,
  now = new Date(),
  statementTimeoutMs = BOOKING_EFFECT_PROVIDER_TIMEOUT_MS,
): Promise<{ permitted: false } | { permitted: true; value: T }> {
  return withBookingEffectDeliveryDispatchPermitPolicy(
    bookingId,
    delivery,
    dispatch,
    now,
    statementTimeoutMs,
    "confirmed",
    true,
  );
}

/**
 * Booking-created delivery permit. Creation is a historical event, so a later
 * accept/reject/cancel transition must not erase its notification; the durable
 * outbox FK guarantees the booking still exists while the effect is pending.
 */
export async function withBookingCreationEffectDeliveryDispatchPermit<T>(
  bookingId: number,
  delivery: Pick<BookingEffectDelivery, "id" | "leaseToken" | "recipientUserId">,
  dispatch: (permitted: BookingEffectDelivery, executor: Executor) => Promise<T>,
  now = new Date(),
  statementTimeoutMs = BOOKING_EFFECT_PROVIDER_TIMEOUT_MS,
): Promise<{ permitted: false } | { permitted: true; value: T }> {
  return withBookingEffectDeliveryDispatchPermitPolicy(
    bookingId,
    delivery,
    dispatch,
    now,
    statementTimeoutMs,
    "exists",
    false,
  );
}

async function finishBookingEffectDelivery(
  delivery: Pick<BookingEffectDelivery, "id" | "effectId" | "leaseToken" | "attempts">,
  status: "delivered" | "failed" | "dead_letter" | "cancelled",
  error: unknown,
  now = new Date(),
): Promise<BookingEffectDelivery | null> {
  const leaseToken = delivery.leaseToken;
  if (!leaseToken) return null;
  if (status !== "delivered") {
    const [cancelled] = await db
      .update(bookingEffectDeliveries)
      .set({
        status: "cancelled",
        nextAttemptAt: now,
        leaseToken: null,
        leaseUntil: null,
        lastError: "booking_cancelled",
        deliveredAt: null,
        updatedAt: now,
      })
      .where(and(
        eq(bookingEffectDeliveries.id, delivery.id),
        inArray(bookingEffectDeliveries.status, ["processing", "dispatching"]),
        eq(bookingEffectDeliveries.leaseToken, leaseToken),
        sql`${bookingEffectDeliveries.cancelRequestedAt} IS NOT NULL`,
      ))
      .returning();
    if (cancelled) return cancelled;
  }
  if (status === "dead_letter") {
    return db.transaction(async (tx) => {
      const executor = tx as unknown as Executor;
      const [parent] = await executor
        .select({ id: bookingEffectOutbox.id })
        .from(bookingEffectOutbox)
        .where(eq(bookingEffectOutbox.id, delivery.effectId))
        .for("update")
        .limit(1);
      if (!parent) return null;
      const [finished] = await executor
        .update(bookingEffectDeliveries)
        .set({
          status: "dead_letter",
          nextAttemptAt: now,
          leaseToken: null,
          leaseUntil: null,
          lastError: bookingEffectError(error),
          deliveredAt: null,
          updatedAt: now,
        })
        .where(and(
          eq(bookingEffectDeliveries.id, delivery.id),
          inArray(bookingEffectDeliveries.status, ["processing", "dispatching"]),
          eq(bookingEffectDeliveries.leaseToken, leaseToken),
          isNull(bookingEffectDeliveries.cancelRequestedAt),
        ))
        .returning();
      if (!finished) return null;
      await executor
        .update(bookingEffectDeliveries)
        .set({
          status: "dead_letter",
          leaseToken: null,
          leaseUntil: null,
          lastError: "sibling delivery exhausted retry budget",
          updatedAt: now,
        })
        .where(and(
          eq(bookingEffectDeliveries.effectId, delivery.effectId),
          inArray(bookingEffectDeliveries.status, ["pending", "processing", "failed"]),
        ));
      await executor
        .update(bookingEffectOutbox)
        .set({
          status: "dead_letter",
          leaseToken: null,
          leaseUntil: null,
          lastError: bookingEffectError(error),
          updatedAt: now,
        })
        .where(and(
          eq(bookingEffectOutbox.id, delivery.effectId),
          inArray(bookingEffectOutbox.status, ["pending", "processing", "failed"]),
        ));
      return finished;
    });
  }
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
      inArray(bookingEffectDeliveries.status, ["processing", "dispatching"]),
      eq(bookingEffectDeliveries.leaseToken, leaseToken),
      ...(status === "delivered" ? [] : [isNull(bookingEffectDeliveries.cancelRequestedAt)]),
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
    if (!delivered) {
      const [settled] = await db
        .select()
        .from(bookingEffectDeliveries)
        .where(eq(bookingEffectDeliveries.id, claimed.id))
        .limit(1);
      if (settled?.status === "delivered") {
        return { status: "delivered", delivery: settled };
      }
    }
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
    if (failed.status === "cancelled") {
      return { status: "cancelled", delivery: failed };
    }
    return failed.status === "dead_letter"
      ? { status: "dead_letter", delivery: failed, error: message }
      : { status: "failed", delivery: failed, error: message };
  }
}

export async function reapExhaustedBookingEffectDeliveries(
  executor: Executor,
  effectId: number,
  now = new Date(),
): Promise<number> {
  // Every multi-row terminal transition uses parent -> child lock order.
  const [parent] = await executor
    .select({ id: bookingEffectOutbox.id })
    .from(bookingEffectOutbox)
    .where(eq(bookingEffectOutbox.id, effectId))
    .for("update")
    .limit(1);
  if (!parent) return 0;
  await executor
    .update(bookingEffectDeliveries)
    .set({
      status: "cancelled",
      leaseToken: null,
      leaseUntil: null,
      lastError: "booking_cancelled_after_dispatch_crash",
      updatedAt: now,
    })
    .where(and(
      eq(bookingEffectDeliveries.effectId, effectId),
      eq(bookingEffectDeliveries.status, "dispatching"),
      sql`${bookingEffectDeliveries.cancelRequestedAt} IS NOT NULL`,
      lte(bookingEffectDeliveries.leaseUntil, now),
    ));
  const terminal = await executor
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
      isNull(bookingEffectDeliveries.cancelRequestedAt),
      or(
        and(
          inArray(bookingEffectDeliveries.status, ["pending", "failed"]),
          sql`${bookingEffectDeliveries.attempts} >= ${BOOKING_EFFECT_MAX_ATTEMPTS}`,
        ),
        and(
          inArray(bookingEffectDeliveries.status, ["processing", "dispatching"]),
          sql`${bookingEffectDeliveries.attempts} >= ${BOOKING_EFFECT_MAX_ATTEMPTS}`,
          lte(bookingEffectDeliveries.leaseUntil, now),
        ),
      ),
    ))
    .returning({ id: bookingEffectDeliveries.id });
  if (terminal.length > 0) {
    await executor
      .update(bookingEffectDeliveries)
      .set({
        status: "dead_letter",
        leaseToken: null,
        leaseUntil: null,
        lastError: "sibling delivery exhausted retry budget",
        updatedAt: now,
      })
      .where(and(
        eq(bookingEffectDeliveries.effectId, effectId),
        inArray(bookingEffectDeliveries.status, ["pending", "processing", "failed"]),
      ));
    await executor
      .update(bookingEffectOutbox)
      .set({
        status: "dead_letter",
        leaseToken: null,
        leaseUntil: null,
        lastError: "delivery maximum attempts exhausted",
        updatedAt: now,
      })
      .where(and(
        eq(bookingEffectOutbox.id, effectId),
        inArray(bookingEffectOutbox.status, ["pending", "processing", "failed"]),
      ));
  }
  return terminal.length;
}

export async function dueBookingEffectDeliveries(
  effectId: number,
  limit = 100,
  now = new Date(),
): Promise<BookingEffectDelivery[]> {
  await db.transaction(async (tx) => {
    await reapExhaustedBookingEffectDeliveries(
      tx as unknown as Executor,
      effectId,
      now,
    );
  });
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

/** Recover rows left by an older worker after its parent was cancelled. */
export async function reconcileOrphanedCancelledBookingEffectDeliveries(
  executor: Executor = db,
  now = new Date(),
): Promise<number> {
  const rows = await executor
    .update(bookingEffectDeliveries)
    .set({
      status: "cancelled",
      nextAttemptAt: now,
      leaseToken: null,
      leaseUntil: null,
      cancelRequestedAt: sql`COALESCE(${bookingEffectDeliveries.cancelRequestedAt}, ${now})`,
      lastError: sql`COALESCE(${bookingEffectDeliveries.lastError}, 'booking_cancelled_reconciled')`,
      deliveredAt: null,
      updatedAt: now,
    })
    .where(and(
      eq(bookingEffectDeliveries.status, "dispatching"),
      sql`EXISTS (
        SELECT 1
        FROM ${bookingEffectOutbox}
        WHERE ${bookingEffectOutbox.id} = ${bookingEffectDeliveries.effectId}
          AND ${bookingEffectOutbox.status} = 'cancelled'
      )`,
    ))
    .returning({ id: bookingEffectDeliveries.id });
  return rows.length;
}

/**
 * Minimize every durable booking notification payload before account erasure
 * commits. The deleting transaction already owns the actor row, which blocks
 * new booking creation; locking coordinators here serializes an in-flight
 * materializer. Updating delivery rows then waits for any already-started
 * provider call to settle, so no worker can dispatch the old payload after
 * this transaction commits.
 *
 * Historical delivery/dedupe records remain for operational evidence, but all
 * recipient/contact/message data is replaced with deterministic non-PII.
 */
async function scrubPersistedBookingNotificationsForErasure(
  executor: Executor,
  bookingIds: readonly number[],
): Promise<void> {
  // A client-facing status notification may have been written by the older
  // best-effort path and therefore have no child outbox row. Stable booking
  // dedupe prefixes let us minimize every already-persisted projection.
  const batchSize = 250;
  for (let offset = 0; offset < bookingIds.length; offset += batchSize) {
    const batch = bookingIds.slice(offset, offset + batchSize);
    const predicate = or(...batch.map((bookingId) =>
      like(notifications.dedupeKey, `booking:${bookingId}:%`)
    ));
    if (!predicate) continue;
    await executor
      .update(notifications)
      .set({
        type: "booking_erased",
        title: "Date personale eliminate",
        message: null,
        actionUrl: null,
      })
      .where(predicate);
  }
}

export async function scrubBookingEffectsForClientErasure(
  executor: Executor,
  bookingIds: readonly number[],
  now = new Date(),
): Promise<void> {
  const ids = [...new Set(bookingIds)]
    .filter((id) => Number.isSafeInteger(id) && id > 0)
    .sort((left, right) => left - right);
  if (ids.length === 0) return;

  const effects = await executor
    .select({ id: bookingEffectOutbox.id })
    .from(bookingEffectOutbox)
    .where(and(
      inArray(bookingEffectOutbox.bookingId, ids),
      inArray(bookingEffectOutbox.effectKey, [
        BOOKING_CREATION_NOTIFICATION_EFFECT,
        CONFIRMATION_NOTIFICATION_EFFECT,
      ]),
    ))
    .orderBy(asc(bookingEffectOutbox.id))
    .for("update");
  if (effects.length > 0) {
    const effectIds = effects.map((effect) => effect.id);

    await executor
      .update(bookingEffectDeliveries)
      .set({
        recipientUserId: sql`md5('booking-effect-erased:' || ${bookingEffectDeliveries.id}::text)::uuid`,
        payload: sql`jsonb_build_object(
          'userId', md5('booking-effect-erased:' || ${bookingEffectDeliveries.id}::text)::uuid::text,
          'type', 'booking_erased',
          'title', 'Date personale eliminate',
          'dedupeKey', ${bookingEffectDeliveries.dedupeKey}
        )`,
        status: sql`CASE
          WHEN ${bookingEffectDeliveries.status} IN ('pending', 'processing', 'dispatching', 'failed')
            THEN 'cancelled'
          ELSE ${bookingEffectDeliveries.status}
        END`,
        nextAttemptAt: now,
        leaseToken: null,
        leaseUntil: null,
        cancelRequestedAt: sql`COALESCE(${bookingEffectDeliveries.cancelRequestedAt}, ${now})`,
        lastError: "personal_data_erased",
        deliveredAt: sql`CASE
          WHEN ${bookingEffectDeliveries.status} = 'delivered'
            THEN ${bookingEffectDeliveries.deliveredAt}
          ELSE NULL
        END`,
        updatedAt: now,
      })
      .where(inArray(bookingEffectDeliveries.effectId, effectIds));

    await executor
      .update(bookingEffectOutbox)
      .set({
        status: sql`CASE
          WHEN ${bookingEffectOutbox.status} IN ('pending', 'processing', 'failed')
            THEN 'cancelled'
          ELSE ${bookingEffectOutbox.status}
        END`,
        nextAttemptAt: now,
        leaseToken: null,
        leaseUntil: null,
        lastError: "personal_data_erased",
        referralLastError: null,
        materializationLastError: null,
        resolutionNote: null,
        deliveredAt: sql`CASE
          WHEN ${bookingEffectOutbox.status} = 'delivered'
            THEN ${bookingEffectOutbox.deliveredAt}
          ELSE NULL
        END`,
        updatedAt: now,
      })
      .where(inArray(bookingEffectOutbox.id, effectIds));
  }

  // Last by design: a worker that began before erasure can only insert an
  // in-app row while its child delivery is still live. Waiting for/scrubbing
  // every child first guarantees this final pass observes that insertion.
  await scrubPersistedBookingNotificationsForErasure(executor, ids);
}

/**
 * Remove a deleted account from already-materialized creation and confirmation
 * deliveries, including when it was a venue owner, artist or administrator
 * rather than the booking client.
 *
 * The caller must hold this user's row FOR UPDATE. Materialization locks every
 * real recipient FOR SHARE before its coordinator, so either these delivery
 * rows are committed and visible here, or account erasure wins and the worker
 * drops the now-missing recipient before inserting anything.
 */
export async function scrubBookingEffectRecipientForErasure(
  executor: Executor,
  userId: string,
  now = new Date(),
): Promise<void> {
  const rows = await executor
    .select({ effectId: bookingEffectDeliveries.effectId })
    .from(bookingEffectDeliveries)
    .innerJoin(
      bookingEffectOutbox,
      eq(bookingEffectOutbox.id, bookingEffectDeliveries.effectId),
    )
    .where(and(
      eq(bookingEffectDeliveries.recipientUserId, userId),
      inArray(bookingEffectOutbox.effectKey, [
        BOOKING_CREATION_NOTIFICATION_EFFECT,
        CONFIRMATION_NOTIFICATION_EFFECT,
      ]),
    ));
  const effectIds = [...new Set(rows.map(({ effectId }) => effectId))]
    .sort((left, right) => left - right);
  if (effectIds.length === 0) return;

  await executor
    .select({ id: bookingEffectOutbox.id })
    .from(bookingEffectOutbox)
    .where(inArray(bookingEffectOutbox.id, effectIds))
    .orderBy(asc(bookingEffectOutbox.id))
    .for("update");

  await executor
    .update(bookingEffectDeliveries)
    .set({
      recipientUserId: sql`md5('booking-effect-erased:' || ${bookingEffectDeliveries.id}::text)::uuid`,
      payload: sql`jsonb_build_object(
        'userId', md5('booking-effect-erased:' || ${bookingEffectDeliveries.id}::text)::uuid::text,
        'type', 'booking_erased',
        'title', 'Date personale eliminate',
        'dedupeKey', ${bookingEffectDeliveries.dedupeKey}
      )`,
      status: sql`CASE
        WHEN ${bookingEffectDeliveries.status} IN ('pending', 'processing', 'dispatching', 'failed')
          THEN 'cancelled'
        ELSE ${bookingEffectDeliveries.status}
      END`,
      nextAttemptAt: now,
      leaseToken: null,
      leaseUntil: null,
      cancelRequestedAt: sql`COALESCE(${bookingEffectDeliveries.cancelRequestedAt}, ${now})`,
      lastError: "recipient_personal_data_erased",
      deliveredAt: sql`CASE
        WHEN ${bookingEffectDeliveries.status} = 'delivered'
          THEN ${bookingEffectDeliveries.deliveredAt}
        ELSE NULL
      END`,
      updatedAt: now,
    })
    .where(and(
      inArray(bookingEffectDeliveries.effectId, effectIds),
      eq(bookingEffectDeliveries.recipientUserId, userId),
    ));
}

/**
 * Invalidates every confirmation delivery not already complete. The caller
 * must pass its status-transition transaction so booking + parent + children
 * commit or roll back together.
 */
export async function cancelBookingConfirmationEffects(
  executor: Executor,
  bookingId: number,
  reason = "booking_cancelled",
): Promise<void> {
  await acquireBookingConfirmationBarrier(executor, bookingId);
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
  await executor
    .update(bookingEffectDeliveries)
    .set({
      status: "cancelled",
      nextAttemptAt: now,
      leaseToken: null,
      leaseUntil: null,
      cancelRequestedAt: now,
      lastError: reason,
      deliveredAt: null,
      updatedAt: now,
    })
    .where(and(
      inArray(bookingEffectDeliveries.effectId, ids),
      inArray(bookingEffectDeliveries.status, [
        "pending",
        "processing",
        "dispatching",
        "failed",
        "dead_letter",
      ]),
    ));
}

export async function reconcileCancelledBookingConfirmationEffects(
  bookingId: number,
  reason = "booking_cancelled",
): Promise<void> {
  await db.transaction(async (tx) => {
    await cancelBookingConfirmationEffects(
      tx as unknown as Executor,
      bookingId,
      reason,
    );
  });
}

/**
 * Claims each previously unseen dead letter once for scheduler alerting.
 * Historical terminal rows remain queryable but do not keep every future
 * scheduler run unhealthy forever.
 */
export async function reportUnalertedBookingEffectDeadLetters(
  effectKey: string,
  now = new Date(),
): Promise<number> {
  const rows = await db
    .update(bookingEffectOutbox)
    .set({ alertedAt: now, updatedAt: now })
    .where(and(
      eq(bookingEffectOutbox.effectKey, effectKey),
      eq(bookingEffectOutbox.status, "dead_letter"),
      isNull(bookingEffectOutbox.alertedAt),
      isNull(bookingEffectOutbox.resolvedAt),
    ))
    .returning({ id: bookingEffectOutbox.id });
  return rows.length;
}

export async function acknowledgeBookingEffectDeadLetter(
  effectId: number,
  note: string,
  now = new Date(),
): Promise<boolean> {
  const [resolved] = await db
    .update(bookingEffectOutbox)
    .set({
      alertedAt: sql`COALESCE(${bookingEffectOutbox.alertedAt}, ${now})`,
      resolvedAt: now,
      resolutionNote: note.slice(0, 2_000),
      updatedAt: now,
    })
    .where(and(
      eq(bookingEffectOutbox.id, effectId),
      eq(bookingEffectOutbox.status, "dead_letter"),
    ))
    .returning({ id: bookingEffectOutbox.id });
  return Boolean(resolved);
}

/** Explicit operator recovery. Delivered/cancelled rows are never reopened. */
export async function requeueBookingEffectDeadLetter(
  effectId: number,
  note: string,
  now = new Date(),
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const executor = tx as unknown as Executor;
    const [locked] = await executor
      .select({ status: bookingEffectOutbox.status })
      .from(bookingEffectOutbox)
      .where(eq(bookingEffectOutbox.id, effectId))
      .for("update")
      .limit(1);
    if (locked?.status !== "dead_letter") return false;
    await executor
      .update(bookingEffectDeliveries)
      .set({
        status: "failed",
        attempts: 0,
        nextAttemptAt: now,
        leaseToken: null,
        leaseUntil: null,
        dispatchStartedAt: null,
        cancelRequestedAt: null,
        lastError: `operator requeue: ${note}`.slice(0, 2_000),
        updatedAt: now,
      })
      .where(and(
        eq(bookingEffectDeliveries.effectId, effectId),
        eq(bookingEffectDeliveries.status, "dead_letter"),
      ));
    const [requeued] = await executor
      .update(bookingEffectOutbox)
      .set({
        status: "pending",
        nextAttemptAt: now,
        leaseToken: null,
        leaseUntil: null,
        lastError: `operator requeue: ${note}`.slice(0, 2_000),
        alertedAt: null,
        resolvedAt: null,
        resolutionNote: null,
        referralStatus: sql`CASE WHEN ${bookingEffectOutbox.referralStatus} = 'dead_letter' THEN 'failed' ELSE ${bookingEffectOutbox.referralStatus} END`,
        referralAttempts: sql`CASE WHEN ${bookingEffectOutbox.referralStatus} = 'dead_letter' THEN 0 ELSE ${bookingEffectOutbox.referralAttempts} END`,
        referralNextAttemptAt: now,
        materializationStatus: sql`CASE WHEN ${bookingEffectOutbox.materializationStatus} = 'dead_letter' THEN 'failed' ELSE ${bookingEffectOutbox.materializationStatus} END`,
        materializationAttempts: sql`CASE WHEN ${bookingEffectOutbox.materializationStatus} = 'dead_letter' THEN 0 ELSE ${bookingEffectOutbox.materializationAttempts} END`,
        materializationNextAttemptAt: now,
        updatedAt: now,
      })
      .where(and(
        eq(bookingEffectOutbox.id, effectId),
        eq(bookingEffectOutbox.status, "dead_letter"),
      ))
      .returning({ id: bookingEffectOutbox.id });
    return Boolean(requeued);
  });
}
