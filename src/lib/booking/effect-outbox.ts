import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  bookingEffectOutbox,
} from "@/lib/db/schema";
import { db } from "@/lib/db";
import {
  BOOKING_EFFECT_LEASE_MS,
  bookingEffectError,
  bookingEffectRetryDelayMs,
} from "./effect-outbox-policy";

type Executor = typeof db;
export type BookingEffect = typeof bookingEffectOutbox.$inferSelect;

// Keep the 0030 key so rows created by the old one-shot implementation are
// recovered by 0031 instead of becoming invisible to the worker.
export const CONFIRMATION_NOTIFICATION_EFFECT = "confirm_notify";

export type BookingEffectClockOptions = {
  now?: Date;
  leaseMs?: number;
  leaseToken?: string;
};

export type BookingEffectProcessResult =
  | { status: "delivered"; effect: BookingEffect }
  | { status: "failed"; effect: BookingEffect; error: string }
  | { status: "not_due" };

function retryableAt(now: Date) {
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

/**
 * Persist the effect before the surrounding confirmation transaction commits.
 * A replay pulls failed work forward, while delivered and live leases remain
 * untouched.
 */
export async function enqueueBookingEffect(
  executor: Executor,
  bookingId: number,
  effectKey: string,
): Promise<BookingEffect> {
  const [inserted] = await executor
    .insert(bookingEffectOutbox)
    .values({
      bookingId,
      effectKey,
      status: "pending",
      attempts: 0,
      nextAttemptAt: new Date(),
    })
    .onConflictDoNothing()
    .returning();
  if (inserted) return inserted;

  const [rescheduled] = await executor
    .update(bookingEffectOutbox)
    .set({
      status: "pending",
      nextAttemptAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(bookingEffectOutbox.bookingId, bookingId),
        eq(bookingEffectOutbox.effectKey, effectKey),
        inArray(bookingEffectOutbox.status, ["pending", "failed"]),
      ),
    )
    .returning();
  if (rescheduled) return rescheduled;

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
    .where(and(eq(bookingEffectOutbox.id, effectId), retryableAt(now)))
    .returning();
  return claimed ?? null;
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
    .where(
      and(
        eq(bookingEffectOutbox.id, effect.id),
        eq(bookingEffectOutbox.status, "processing"),
        eq(bookingEffectOutbox.leaseToken, effect.leaseToken),
      ),
    )
    .returning();
  return delivered ?? null;
}

export async function markBookingEffectFailed(
  effect: Pick<BookingEffect, "id" | "leaseToken" | "attempts">,
  error: unknown,
  now = new Date(),
): Promise<BookingEffect | null> {
  if (!effect.leaseToken) return null;
  const [failed] = await db
    .update(bookingEffectOutbox)
    .set({
      status: "failed",
      nextAttemptAt: new Date(now.getTime() + bookingEffectRetryDelayMs(effect.attempts)),
      leaseToken: null,
      leaseUntil: null,
      lastError: bookingEffectError(error),
      updatedAt: now,
    })
    .where(
      and(
        eq(bookingEffectOutbox.id, effect.id),
        eq(bookingEffectOutbox.status, "processing"),
        eq(bookingEffectOutbox.leaseToken, effect.leaseToken),
      ),
    )
    .returning();
  return failed ?? null;
}

/** Process one row. External I/O happens outside database transactions. */
export async function processBookingEffect(
  effectId: number,
  deliver: (effect: BookingEffect) => Promise<void>,
  options: BookingEffectClockOptions = {},
): Promise<BookingEffectProcessResult> {
  const claimed = await claimBookingEffect(effectId, options);
  if (!claimed) return { status: "not_due" };
  try {
    await deliver(claimed);
    const delivered = await markBookingEffectDelivered(claimed, options.now ?? new Date());
    return delivered
      ? { status: "delivered", effect: delivered }
      : { status: "not_due" };
  } catch (error) {
    const message = bookingEffectError(error);
    const failed = await markBookingEffectFailed(claimed, error, options.now ?? new Date());
    return failed
      ? { status: "failed", effect: failed, error: message }
      : { status: "not_due" };
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
    .where(and(eq(bookingEffectOutbox.effectKey, effectKey), retryableAt(now)))
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
    .where(
      and(
        eq(bookingEffectOutbox.bookingId, bookingId),
        eq(bookingEffectOutbox.effectKey, effectKey),
      ),
    )
    .limit(1);
  return effect ?? null;
}
