import { after } from "next/server";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  artists,
  bookingEffectDeliveries,
  bookingEffectOutbox,
  bookingRequests,
  users,
  type BookingEffectChannel,
  type BookingEffectStepStatus,
} from "@/lib/db/schema";
import {
  dispatchNotification,
  dispatchNotificationChannel,
  resolveNotificationChannels,
  type DispatchInput,
  type NotificationChannelDrivers,
} from "@/lib/notifications/dispatch";
import { getVenueOwnerUserIds } from "@/lib/venue-access";
import {
  BOOKING_EFFECT_MAX_ATTEMPTS,
  BOOKING_EFFECT_PROVIDER_TIMEOUT_MS,
  bookingEffectError,
  bookingEffectRetryDelayMs,
} from "./effect-outbox-policy";
import {
  BookingEffectCancelledError,
  BookingEffectDeadLetterError,
  BookingEffectRetryAtError,
  CONFIRMATION_NOTIFICATION_EFFECT,
  acquireBookingConfirmationBarrier,
  bookingEffectDeliveriesFor,
  bookingEffectFor,
  dueBookingEffectDeliveries,
  dueBookingEffects,
  enqueueBookingEffectDeliveries,
  processBookingEffect,
  processBookingEffectDelivery,
  reconcileOrphanedCancelledBookingEffectDeliveries,
  reconcileCancelledBookingConfirmationEffects,
  withBookingEffectDeliveryDispatchPermit,
  reportUnalertedBookingEffectDeadLetters,
  type BookingEffect,
  type BookingEffectClockOptions,
  type BookingEffectDelivery,
  type BookingEffectProcessResult,
} from "./effect-outbox";

type Booking = typeof bookingRequests.$inferSelect;

export { persistConfirmationEffects, projectBookingOntoCalendar } from "./confirmation-persist";

function confirmationStepDedupePart(b: Booking): string {
  if (b.status === "accepted" && b.clientConfirmedAt) return "client_accepted";
  if (b.status === "accepted") return "vendor_offered";
  return `status_${b.status}`;
}

/** Best-effort notification for non-final steps in the booking flow. */
export async function notifyConfirmationStep(b: Booking, title: string) {
  const vendorUserIds = b.venueId
    ? await getVenueOwnerUserIds(b.venueId)
    : b.artistId
      ? (await db
          .select({ userId: artists.userId })
          .from(artists)
          .where(eq(artists.id, b.artistId))
          .limit(1))
          .map((artist) => artist.userId)
          .filter((id): id is string => Boolean(id))
      : [];
  for (const userId of new Set([b.clientUserId, ...vendorUserIds])) {
    if (!userId) continue;
    const [user] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const { isMultiHallEnabled } = await import("@/lib/feature-flags");
    const actionUrl = userId === b.clientUserId
      ? "/cabinet/rezervari"
      : b.venueId
        ? isMultiHallEnabled()
          ? `/dashboard/locatii/${b.venueId}/rezervari?tab=acceptate`
          : "/dashboard/sala/rezervari?tab=acceptate"
        : "/dashboard/rezervari";
    const { venueHallDisplayName } = await import("@/lib/booking/venue-booking-write");
    const place = b.venueId
      ? await venueHallDisplayName(b.venueId, b.hallId ?? null)
      : "";
    await dispatchNotification({
      userId,
      type: "booking_status_changed",
      title,
      message: `${place ? `${place} · ` : ""}Rezervarea #${b.id} · ${b.eventDate}. Verifică detaliile în cont.`,
      actionUrl,
      email: user?.email,
      emailSubject: title,
      emailHtml: `<p>${title}</p><p>${place ? `${place} · ` : ""}Rezervarea #${b.id} · ${b.eventDate}</p><p><a href="https://epetrecere.md${actionUrl}">Vezi rezervarea în cont</a></p>`,
      // Stable event identity: wording/copy changes cannot create duplicates.
      dedupeKey: `booking:${b.id}:${userId}:${confirmationStepDedupePart(b)}`,
    });
  }
}

async function confirmedBooking(bookingId: number): Promise<Booking | null> {
  const [booking] = await db
    .select()
    .from(bookingRequests)
    .where(eq(bookingRequests.id, bookingId))
    .limit(1);
  if (!booking) return null;
  return booking.status === "confirmed_by_client" || booking.status === "completed"
    ? booking
    : null;
}

async function finalNotificationInputs(
  b: Booking,
  executor: typeof db = db,
): Promise<DispatchInput[]> {
  const vendorUserIds = b.venueId
    ? await getVenueOwnerUserIds(b.venueId, executor)
    : b.artistId
      ? (await executor
          .select({ userId: artists.userId })
          .from(artists)
          .where(eq(artists.id, b.artistId))
          .limit(1))
          .map((artist) => artist.userId)
          .filter((id): id is string => Boolean(id))
      : [];
  const { isMultiHallEnabled } = await import("@/lib/feature-flags");
  const { venueHallDisplayName } = await import("@/lib/booking/venue-booking-write");
  const place = b.venueId
    ? await venueHallDisplayName(b.venueId, b.hallId ?? null, executor)
    : "";
  const title = "Rezervare confirmată de ambele părți";
  const inputs: DispatchInput[] = [];
  for (const userId of new Set([b.clientUserId, ...vendorUserIds])) {
    if (!userId) continue;
    const [user] = await executor
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const actionUrl = userId === b.clientUserId
      ? "/cabinet/rezervari"
      : b.venueId
        ? isMultiHallEnabled()
          ? `/dashboard/locatii/${b.venueId}/rezervari?tab=acceptate`
          : "/dashboard/sala/rezervari?tab=acceptate"
        : "/dashboard/rezervari";
    const message = `${place ? `${place} · ` : ""}Rezervarea #${b.id} · ${b.eventDate}. Verifică detaliile în cont.`;
    inputs.push({
      userId,
      type: "booking_status_changed",
      title,
      message,
      actionUrl,
      email: user?.email,
      emailSubject: title,
      emailHtml: `<p>${title}</p><p>${place ? `${place} · ` : ""}Rezervarea #${b.id} · ${b.eventDate}</p><p><a href="https://epetrecere.md${actionUrl}">Vezi rezervarea în cont</a></p>`,
      // Copy and locale are deliberately absent from the stable event key.
      dedupeKey: `booking:${b.id}:${userId}:confirmed`,
    });
  }
  return inputs;
}

async function materializeConfirmationDeliveries(
  b: Booking,
  effect: BookingEffect,
): Promise<BookingEffectDelivery[]> {
  const existing = await bookingEffectDeliveriesFor(effect.id);
  if (existing.length > 0) return existing;
  // Resolve recipients once outside the transaction only to establish the
  // global lock order. The immutable payload itself is rebuilt from a fresh
  // booking and current recipients/preferences inside the transaction.
  const candidateInputs = await finalNotificationInputs(b);
  const candidateUserIds = [...new Set(candidateInputs.map(({ userId }) => userId))]
    .sort();
  return db.transaction(async (tx) => {
    const executor = tx as unknown as typeof db;
    // Account erasure owns a user row before scrubbing outbox rows. Matching
    // that order here prevents user/coordinator deadlocks and ensures erasure
    // either sees committed children or makes the recipient disappear first.
    const lockedUsers = candidateUserIds.length > 0
      ? await tx
          .select({ id: users.id })
          .from(users)
          .where(inArray(users.id, candidateUserIds))
          .orderBy(users.id)
          .for("share")
      : [];
    const lockedUserIds = new Set(lockedUsers.map(({ id }) => id));

    // Lock in the same booking -> outbox order used by cancellation. If
    // cancellation committed first, no children are created. If this lock
    // wins first, cancellation waits and then invalidates every inserted row.
    await acquireBookingConfirmationBarrier(executor, b.id);
    const [activeBooking] = await tx
      .select()
      .from(bookingRequests)
      .where(eq(bookingRequests.id, b.id))
      .for("share")
      .limit(1);
    if (
      !activeBooking
      || (activeBooking.status !== "confirmed_by_client" && activeBooking.status !== "completed")
    ) {
      throw new BookingEffectCancelledError();
    }
    const [coordinator] = await tx
      .select({
        status: bookingEffectOutbox.status,
        leaseToken: bookingEffectOutbox.leaseToken,
      })
      .from(bookingEffectOutbox)
      .where(eq(bookingEffectOutbox.id, effect.id))
      .for("update")
      .limit(1);
    if (
      coordinator?.status !== "processing"
      || coordinator.leaseToken !== effect.leaseToken
    ) {
      throw new BookingEffectCancelledError();
    }
    const concurrentExisting = await bookingEffectDeliveriesFor(effect.id, executor);
    if (concurrentExisting.length > 0) return concurrentExisting;
    const rows: Array<{
      recipientUserId: string;
      channel: BookingEffectChannel;
      dedupeKey: string;
      payload: NonNullable<BookingEffectDelivery["payload"]>;
    }> = [];
    for (const input of await finalNotificationInputs(activeBooking, executor)) {
      // A recipient deleted while this worker waited must never be recreated
      // as a stale durable payload after account erasure committed.
      if (!lockedUserIds.has(input.userId)) continue;
      const channels = await resolveNotificationChannels(input, executor);
      for (const channel of channels) {
        rows.push({
          recipientUserId: input.userId,
          channel,
          dedupeKey: `${input.dedupeKey}:${channel}`,
          payload: {
            userId: input.userId,
            type: String(input.type),
            title: input.title,
            ...(input.message ? { message: input.message } : {}),
            ...(input.actionUrl ? { actionUrl: input.actionUrl } : {}),
            ...(input.email ? { email: input.email } : {}),
            ...(input.emailSubject ? { emailSubject: input.emailSubject } : {}),
            ...(input.emailHtml ? { emailHtml: input.emailHtml } : {}),
            dedupeKey: input.dedupeKey!,
          },
        });
      }
    }
    return enqueueBookingEffectDeliveries(executor, effect.id, rows);
  });
}

type ConfirmationPreparationStep = "referral" | "materialization";

async function beginPreparationStep(
  effect: BookingEffect,
  step: ConfirmationPreparationStep,
  now = new Date(),
): Promise<number | null> {
  if (!effect.leaseToken) return null;
  const attemptsColumn = step === "referral"
    ? bookingEffectOutbox.referralAttempts
    : bookingEffectOutbox.materializationAttempts;
  const statusColumn = step === "referral"
    ? bookingEffectOutbox.referralStatus
    : bookingEffectOutbox.materializationStatus;
  const dueColumn = step === "referral"
    ? bookingEffectOutbox.referralNextAttemptAt
    : bookingEffectOutbox.materializationNextAttemptAt;
  const values = step === "referral"
    ? {
        referralAttempts: sql`${bookingEffectOutbox.referralAttempts} + 1`,
        referralLastError: null,
        updatedAt: now,
      }
    : {
        materializationAttempts: sql`${bookingEffectOutbox.materializationAttempts} + 1`,
        materializationLastError: null,
        updatedAt: now,
      };
  const [started] = await db
    .update(bookingEffectOutbox)
    .set(values)
    .where(sql`
      ${bookingEffectOutbox.id} = ${effect.id}
      AND ${bookingEffectOutbox.status} = 'processing'
      AND ${bookingEffectOutbox.leaseToken} = ${effect.leaseToken}
      AND ${statusColumn} IN ('pending', 'failed')
      AND ${dueColumn} <= ${now}
    `)
    .returning({ attempts: attemptsColumn });
  return started?.attempts ?? null;
}

async function preparationStepState(
  effectId: number,
  step: ConfirmationPreparationStep,
): Promise<string | null> {
  const statusColumn = step === "referral"
    ? bookingEffectOutbox.referralStatus
    : bookingEffectOutbox.materializationStatus;
  const [row] = await db
    .select({ status: statusColumn })
    .from(bookingEffectOutbox)
    .where(eq(bookingEffectOutbox.id, effectId))
    .limit(1);
  return row?.status ?? null;
}

async function finishPreparationStep(
  effect: BookingEffect,
  step: ConfirmationPreparationStep,
  attempts: number,
  error?: unknown,
  now = new Date(),
): Promise<"delivered" | "failed" | "dead_letter"> {
  if (!effect.leaseToken) throw new Error("booking_effect_lease_lost");
  const status: BookingEffectStepStatus = error
    ? attempts >= BOOKING_EFFECT_MAX_ATTEMPTS ? "dead_letter" : "failed"
    : "delivered";
  const nextAttemptAt = error
    ? new Date(now.getTime() + bookingEffectRetryDelayMs(attempts))
    : now;
  const values = step === "referral"
    ? {
        referralStatus: status,
        referralNextAttemptAt: nextAttemptAt,
        referralLastError: error ? bookingEffectError(error) : null,
        updatedAt: now,
      }
    : {
        materializationStatus: status,
        materializationNextAttemptAt: nextAttemptAt,
        materializationLastError: error ? bookingEffectError(error) : null,
        updatedAt: now,
      };
  const [finished] = await db
    .update(bookingEffectOutbox)
    .set(values)
    .where(sql`
      ${bookingEffectOutbox.id} = ${effect.id}
      AND ${bookingEffectOutbox.status} = 'processing'
      AND ${bookingEffectOutbox.leaseToken} = ${effect.leaseToken}
    `)
    .returning({ id: bookingEffectOutbox.id });
  if (!finished) throw new Error("booking_effect_lease_lost");
  return status;
}

async function runPreparationStep(
  effect: BookingEffect,
  step: ConfirmationPreparationStep,
  work: () => Promise<void>,
  now?: Date,
): Promise<void> {
  const current = await preparationStepState(effect.id, step);
  if (current === "delivered") return;
  if (current === "dead_letter") {
    throw new BookingEffectDeadLetterError(`${step}_retry_budget_exhausted`);
  }
  const attempts = await beginPreparationStep(effect, step, now);
  if (attempts === null) throw new Error(`${step}_not_due_or_lease_lost`);
  try {
    await work();
  } catch (error) {
    const result = await finishPreparationStep(effect, step, attempts, error, now);
    if (result === "dead_letter") {
      throw new BookingEffectDeadLetterError(`${step}_retry_budget_exhausted`);
    }
    throw error;
  }
  await finishPreparationStep(effect, step, attempts, undefined, now);
}

async function runConfirmationDeliveries(
  booking: Booking,
  effect: BookingEffect,
  options: ConfirmationProcessorOptions,
): Promise<void> {
  await runPreparationStep(effect, "referral", async () => {
    if (options.referral) {
      await options.referral(booking, effect);
      return;
    }
    if (booking.clientUserId) {
      const { triggerFirstBookingReferral } = await import("@/lib/referrals/trigger");
      const result = await triggerFirstBookingReferral({
        bookingId: booking.id,
        referredUserId: booking.clientUserId,
      });
      if (result.reason === "db_error") throw new Error("referral_delivery_failed");
    }
  }, options.now);

  await runPreparationStep(effect, "materialization", async () => {
    await materializeConfirmationDeliveries(booking, effect);
  }, options.now);
  const due = await dueBookingEffectDeliveries(
    effect.id,
    options.maxDeliveriesPerEffect ?? 100,
    options.now,
  );
  for (const row of due) {
    const result = await processBookingEffectDelivery(
      row.id,
      async (claimed) => {
        // A cancellation transaction invalidates all leases; this fresh status
        // check also stops a worker that claimed immediately before cancellation.
        if (!await confirmedBooking(effect.bookingId)) {
          throw new BookingEffectCancelledError();
        }
        await options.beforeDispatchPermit?.(claimed);
        const dispatch = await withBookingEffectDeliveryDispatchPermit(
          effect.bookingId,
          claimed,
          async (_permitted, executor) => {
            await dispatchNotificationChannel(
              claimed.payload as DispatchInput,
              claimed.channel,
              options.drivers,
              {
                idempotencyKey: claimed.dedupeKey,
                timeoutMs: options.providerTimeoutMs ?? BOOKING_EFFECT_PROVIDER_TIMEOUT_MS,
                executor: executor as unknown as typeof db,
              },
            );
          },
          options.now ?? new Date(),
          options.providerTimeoutMs ?? BOOKING_EFFECT_PROVIDER_TIMEOUT_MS,
        );
        if (!dispatch.permitted) throw new BookingEffectCancelledError();
      },
      options,
    );
    if (result.status === "cancelled") {
      // Account erasure may cancel only one recipient. Keep delivering to the
      // other party while the booking itself remains final; a true booking
      // cancellation still terminates the whole coordinator.
      if (!await confirmedBooking(effect.bookingId)) {
        throw new BookingEffectCancelledError();
      }
    }
  }

  const all = await bookingEffectDeliveriesFor(effect.id);
  if (all.some((row) => row.status === "dead_letter")) {
    const terminal = all
      .filter((row) => row.status === "dead_letter")
      .map((row) => `${row.channel}:${row.recipientUserId}:${row.lastError ?? "failed"}`)
      .join("; ");
    throw new BookingEffectDeadLetterError(terminal);
  }
  const live = all.filter((row) => row.status !== "cancelled");
  if (live.length === 0 && all.length > 0) {
    throw new BookingEffectCancelledError();
  }
  if (live.some((row) => row.status !== "delivered")) {
    const retrying = live.filter((row) => row.status !== "delivered").length;
    throw new Error(`confirmation_deliveries_retrying:${retrying}`);
  }
}

async function nextConfirmationRetryAt(
  effectId: number,
  now = new Date(),
): Promise<Date> {
  const [parent] = await db
    .select({
      referralStatus: bookingEffectOutbox.referralStatus,
      referralNextAttemptAt: bookingEffectOutbox.referralNextAttemptAt,
      materializationStatus: bookingEffectOutbox.materializationStatus,
      materializationNextAttemptAt: bookingEffectOutbox.materializationNextAttemptAt,
    })
    .from(bookingEffectOutbox)
    .where(eq(bookingEffectOutbox.id, effectId))
    .limit(1);
  if (parent?.referralStatus !== "delivered") {
    return parent?.referralNextAttemptAt
      ?? new Date(now.getTime() + bookingEffectRetryDelayMs(1));
  }
  if (parent.materializationStatus !== "delivered") {
    return parent.materializationNextAttemptAt;
  }
  const [delivery] = await db
    .select({
      next: sql<Date | null>`min(
        CASE
          WHEN ${bookingEffectDeliveries.status} IN ('pending', 'failed')
            THEN ${bookingEffectDeliveries.nextAttemptAt}
          WHEN ${bookingEffectDeliveries.status} IN ('processing', 'dispatching')
            THEN ${bookingEffectDeliveries.leaseUntil}
          ELSE NULL
        END
      )`,
    })
    .from(bookingEffectDeliveries)
    .where(eq(bookingEffectDeliveries.effectId, effectId));
  return delivery?.next
    ? new Date(delivery.next)
    : new Date(now.getTime() + bookingEffectRetryDelayMs(1));
}

type ConfirmationProcessorOptions = BookingEffectClockOptions & {
  /** Legacy coordinator-level test seam. Production uses per-channel rows. */
  deliver?: (booking: Booking, effect: BookingEffect) => Promise<void>;
  drivers?: NotificationChannelDrivers;
  /** Controlled race seam immediately before the dispatch barrier. */
  beforeDispatchPermit?: (delivery: BookingEffectDelivery) => Promise<void>;
  /** Test seam for preparation retry budgets. */
  referral?: (booking: Booking, effect: BookingEffect) => Promise<void>;
  providerTimeoutMs?: number;
  /** Vercel fallback only: cap sequential provider calls inside one effect. */
  maxDeliveriesPerEffect?: number;
};

export async function processConfirmationNotificationEffect(
  effectId: number,
  options: ConfirmationProcessorOptions = {},
): Promise<BookingEffectProcessResult> {
  const result = await processBookingEffect(
    effectId,
    async (effect) => {
      const booking = await confirmedBooking(effect.bookingId);
      if (!booking) throw new BookingEffectCancelledError();
      if (options.deliver) await options.deliver(booking, effect);
      else {
        try {
          await runConfirmationDeliveries(booking, effect, options);
        } catch (error) {
          if (
            error instanceof BookingEffectCancelledError
            || error instanceof BookingEffectDeadLetterError
          ) {
            throw error;
          }
          throw new BookingEffectRetryAtError(
            error,
            await nextConfirmationRetryAt(effect.id, options.now),
          );
        }
      }
    },
    options,
  );
  if (result.status === "cancelled") {
    await reconcileCancelledBookingConfirmationEffects(result.effect.bookingId);
  }
  return result;
}

export async function processConfirmationNotificationForBooking(
  bookingId: number,
  options: ConfirmationProcessorOptions = {},
): Promise<BookingEffectProcessResult> {
  const effect = await bookingEffectFor(bookingId, CONFIRMATION_NOTIFICATION_EFFECT);
  if (!effect) return { status: "not_due" };
  return processConfirmationNotificationEffect(effect.id, options);
}

export async function drainConfirmationNotificationOutbox(options: {
  limit?: number;
  now?: Date;
  deliver?: ConfirmationProcessorOptions["deliver"];
  drivers?: NotificationChannelDrivers;
  providerTimeoutMs?: number;
  maxDeliveriesPerEffect?: number;
} = {}) {
  await reconcileOrphanedCancelledBookingEffectDeliveries(db, options.now);
  const effects = await dueBookingEffects(
    CONFIRMATION_NOTIFICATION_EFFECT,
    options.limit ?? 25,
    options.now,
  );
  const summary = {
    selected: effects.length,
    delivered: 0,
    failed: 0,
    deadLettered: 0,
    cancelled: 0,
    skipped: 0,
    retrying: 0,
    failedBacklog: 0,
    terminal: 0,
    newlyReportedTerminal: 0,
    errors: [] as Array<{ effectId: number; error: string }>,
  };
  for (const effect of effects) {
    const result = await processConfirmationNotificationEffect(effect.id, {
      ...(options.now ? { now: options.now } : {}),
      deliver: options.deliver,
      drivers: options.drivers,
      providerTimeoutMs: options.providerTimeoutMs,
      maxDeliveriesPerEffect: options.maxDeliveriesPerEffect,
    });
    if (result.status === "delivered") summary.delivered += 1;
    else if (result.status === "failed") {
      summary.failed += 1;
      summary.errors.push({ effectId: result.effect.id, error: result.error });
    } else if (result.status === "dead_letter") {
      summary.deadLettered += 1;
      summary.errors.push({ effectId: result.effect.id, error: result.error });
    } else if (result.status === "cancelled") summary.cancelled += 1;
    else summary.skipped += 1;
  }
  const states = await db
    .select({
      status: bookingEffectOutbox.status,
      count: sql<number>`count(*)::int`,
    })
    .from(bookingEffectOutbox)
    .where(eq(bookingEffectOutbox.effectKey, CONFIRMATION_NOTIFICATION_EFFECT))
    .groupBy(bookingEffectOutbox.status);
  for (const state of states) {
    if (state.status === "pending" || state.status === "failed" || state.status === "processing") {
      summary.retrying += Number(state.count);
    }
    if (state.status === "failed") summary.failedBacklog += Number(state.count);
    if (state.status === "dead_letter") summary.terminal += Number(state.count);
  }
  summary.newlyReportedTerminal = await reportUnalertedBookingEffectDeadLetters(
    CONFIRMATION_NOTIFICATION_EFFECT,
    options.now,
  );
  return summary;
}

export function scheduleConfirmationNotifications(b: Booking) {
  after(async () => {
    try {
      const result = await processConfirmationNotificationForBooking(b.id);
      if (result.status === "failed" || result.status === "dead_letter") {
        console.error(
          `[booking-outbox] confirmation effect ${result.effect.id} ${result.status}: ${result.error}`,
        );
      }
    } catch (error) {
      // The durable row is already committed. A scheduler will recover it.
      console.error(`[booking-outbox] immediate processing failed for booking ${b.id}`, error);
    }
  });
}

export async function finalConfirmationEffects(b: Booking) {
  // The replay helper owns the canonical vendor -> booking lock protocol.
  // Calling persistence directly here would release a standalone vendor read
  // lock before the commission/booking effects are committed.
  const { replayConfirmationEffects } = await import("./booking-transitions");
  const row = await replayConfirmationEffects(b);
  scheduleConfirmationNotifications(row);
}
