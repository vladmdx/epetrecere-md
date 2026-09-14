import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookingRequests, eventPlans, users } from "@/lib/db/schema";
import { acquireBookingCreateIdempotencyLock } from "./advisory-locks";
import {
  BOOKING_CREATION_NOTIFICATION_EFFECT,
  enqueueBookingEffect,
} from "./effect-outbox";

export type BookingRequestWriteTx = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export type OwnedEventPlanWriteScope = {
  eventPlanId: number;
  userId: string;
};

export type BookingCreationActor = {
  id: string;
  role: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type BookingCreationIdempotency = {
  requestId: string;
  scopeHash: string;
};

export type BookingCreationPreparation<T> = {
  value: T;
  payloadHash: string;
};

export type BookingCreationWriteOptions<T> = {
  actorUserId: string | null;
  eventPlanId: number | null;
  idempotency: BookingCreationIdempotency | null;
  prepare: (
    actor: BookingCreationActor | null,
  ) => BookingCreationPreparation<T>;
  /** Optional server-side authorization consumed only for a new write. */
  authorize?: (
    tx: BookingRequestWriteTx,
    actor: BookingCreationActor | null,
    prepared: T,
    payloadHash: string,
  ) => Promise<void>;
  /** Authorization for a lost-response replay of an already-created row. */
  authorizeReplay?: (
    tx: BookingRequestWriteTx,
    actor: BookingCreationActor | null,
    prepared: T,
    payloadHash: string,
    existing: typeof bookingRequests.$inferSelect,
  ) => Promise<void | "allow_payload_mismatch">;
};

export type BookingCreationWriteResult = {
  booking: typeof bookingRequests.$inferSelect;
  created: boolean;
};

export class EventPlanBookingWriteError extends Error {
  readonly code = "EVENT_PLAN_NOT_FOUND";
  readonly status = 404;

  constructor() {
    super("Event plan not found");
    this.name = "EventPlanBookingWriteError";
  }
}

export class BookingCreationActorNotFoundError extends Error {
  readonly status = 403;

  constructor() {
    super("User not found");
    this.name = "BookingCreationActorNotFoundError";
  }
}

export class BookingCreationIdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_KEY_REUSED";
  readonly status = 409;

  constructor() {
    super("Idempotency-Key was already used with a different booking request.");
    this.name = "BookingCreationIdempotencyConflictError";
  }
}

/**
 * Re-read the canonical account identity under a row lock before hashing or
 * persisting it. SHARE is intentional: it freezes name/e-mail/phone/role and
 * blocks account deletion, while remaining compatible with the FK KEY SHARE
 * taken by a concurrent standalone booking that already holds availability.
 */
export async function lockBookingCreationActor(
  tx: BookingRequestWriteTx,
  userId: string,
): Promise<BookingCreationActor> {
  const [actor] = await tx
    .select({
      id: users.id,
      role: users.role,
      name: users.name,
      email: users.email,
      phone: users.phone,
    })
    .from(users)
    .where(eq(users.id, userId))
    .for("share")
    .limit(1);
  if (!actor) throw new BookingCreationActorNotFoundError();
  return actor;
}

/** Actor is already locked by the caller. */
export async function lockOwnedEventPlanAfterActor(
  tx: BookingRequestWriteTx,
  scope: OwnedEventPlanWriteScope,
): Promise<void> {
  const [ownedPlan] = await tx
    .select({ id: eventPlans.id })
    .from(eventPlans)
    .where(
      and(
        eq(eventPlans.id, scope.eventPlanId),
        eq(eventPlans.userId, scope.userId),
      ),
    )
    .for("update")
    .limit(1);

  if (!ownedPlan) throw new EventPlanBookingWriteError();
}

/**
 * Serialize every artist/venue request created for one event plan.
 *
 * The actor row is acquired first to match account deletion's user -> plan
 * order. The plan row then precedes every artist or venue availability lock.
 * A future idempotency barrier belongs between actor and plan; callers must
 * not add a plan -> actor edge around this helper.
 */
export async function lockOwnedEventPlanForBookingWrite(
  tx: BookingRequestWriteTx,
  scope: OwnedEventPlanWriteScope,
): Promise<void> {
  try {
    await lockBookingCreationActor(tx, scope.userId);
  } catch (error) {
    if (error instanceof BookingCreationActorNotFoundError) {
      throw new EventPlanBookingWriteError();
    }
    throw error;
  }
  await lockOwnedEventPlanAfterActor(tx, scope);
}

/**
 * One short transaction for the complete request decision. Identity and
 * other external work must be completed before this wrapper is entered.
 */
export async function withBookingRequestWrite<T>(
  scope: OwnedEventPlanWriteScope | null,
  write: (tx: BookingRequestWriteTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    if (scope) await lockOwnedEventPlanForBookingWrite(tx, scope);
    return write(tx);
  });
}

/**
 * Complete booking-create protocol. The ordering is part of the concurrency
 * contract and must remain:
 *
 * actor -> idempotency advisory -> replay lookup -> event plan ->
 * plan constraints (in caller) -> availability (in caller) -> inserts.
 *
 * The callback runs only for a new request. A replay returns the existing row
 * and therefore cannot enqueue another offer or trigger post-commit effects.
 */
export async function withBookingRequestCreation<T>(
  options: BookingCreationWriteOptions<T>,
  write: (
    tx: BookingRequestWriteTx,
    prepared: T,
    creationIdentity: {
      scopeHash: string | null;
      requestId: string | null;
      payloadHash: string | null;
    },
  ) => Promise<typeof bookingRequests.$inferSelect>,
): Promise<BookingCreationWriteResult> {
  return db.transaction(async (tx) => {
    const actor = options.actorUserId
      ? await lockBookingCreationActor(tx, options.actorUserId)
      : null;
    const prepared = options.prepare(actor);

    if (options.idempotency) {
      await acquireBookingCreateIdempotencyLock(
        tx,
        options.idempotency.scopeHash,
        options.idempotency.requestId,
      );
      const [existing] = await tx
        .select()
        .from(bookingRequests)
        .where(
          and(
            eq(
              bookingRequests.creationScopeHash,
              options.idempotency.scopeHash,
            ),
            eq(
              bookingRequests.creationRequestId,
              options.idempotency.requestId,
            ),
          ),
        )
        .limit(1);
      if (existing) {
        // AI confirmation uses a consumed, payload-bound nonce. For a
        // lost-response retry it can prove the exact persisted booking even
        // if mutable plan/profile fields changed after the first commit.
        // Every ordinary HTTP/mobile replay still requires the generic hash
        // to match exactly.
        const replayAuthorization = await options.authorizeReplay?.(
          tx,
          actor,
          prepared.value,
          prepared.payloadHash,
          existing,
        );
        if (
          existing.creationPayloadHash !== prepared.payloadHash
          && replayAuthorization !== "allow_payload_mismatch"
        ) {
          throw new BookingCreationIdempotencyConflictError();
        }
        // A lost-response replay also pulls pending/failed durable work
        // forward. The unique (booking_id, effect_key) constraint makes this
        // an idempotent repair, never a second logical effect.
        await enqueueBookingEffect(
          tx as unknown as typeof db,
          existing.id,
          BOOKING_CREATION_NOTIFICATION_EFFECT,
        );
        return { booking: existing, created: false };
      }
    }

    if (options.eventPlanId != null) {
      if (!actor) throw new EventPlanBookingWriteError();
      await lockOwnedEventPlanAfterActor(tx, {
        eventPlanId: options.eventPlanId,
        userId: actor.id,
      });
    }

    await options.authorize?.(tx, actor, prepared.value, prepared.payloadHash);

    const creationIdentity = options.idempotency
      ? {
          scopeHash: options.idempotency.scopeHash,
          requestId: options.idempotency.requestId,
          payloadHash: prepared.payloadHash,
        }
      : { scopeHash: null, requestId: null, payloadHash: null };
    const booking = await write(tx, prepared.value, creationIdentity);
    // This coordinator commits in the same transaction as booking + offer.
    // HTTP/AI `after()` callbacks are only accelerators; the scheduled worker
    // can recover even if the request process stops immediately after commit.
    await enqueueBookingEffect(
      tx as unknown as typeof db,
      booking.id,
      BOOKING_CREATION_NOTIFICATION_EFFECT,
    );
    return { booking, created: true };
  });
}
