import { after } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  artists,
  bookingEffectOutbox,
  bookingRequests,
  users,
  type BookingEffectChannel,
} from "@/lib/db/schema";
import {
  dispatchNotification,
  dispatchNotificationChannel,
  resolveNotificationChannels,
  type DispatchInput,
  type NotificationChannelDrivers,
} from "@/lib/notifications/dispatch";
import { getVenueOwnerUserIds } from "@/lib/venue-access";
import { persistConfirmationEffects } from "./confirmation-persist";
import {
  BookingEffectCancelledError,
  BookingEffectDeadLetterError,
  CONFIRMATION_NOTIFICATION_EFFECT,
  bookingEffectDeliveriesFor,
  bookingEffectFor,
  cancelBookingConfirmationEffects,
  dueBookingEffectDeliveries,
  dueBookingEffects,
  enqueueBookingEffectDeliveries,
  processBookingEffect,
  processBookingEffectDelivery,
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

async function finalNotificationInputs(b: Booking): Promise<DispatchInput[]> {
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
  const { isMultiHallEnabled } = await import("@/lib/feature-flags");
  const { venueHallDisplayName } = await import("@/lib/booking/venue-booking-write");
  const place = b.venueId
    ? await venueHallDisplayName(b.venueId, b.hallId ?? null)
    : "";
  const title = "Rezervare confirmată de ambele părți";
  const inputs: DispatchInput[] = [];
  for (const userId of new Set([b.clientUserId, ...vendorUserIds])) {
    if (!userId) continue;
    const [user] = await db
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
  const rows: Array<{
    recipientUserId: string;
    channel: BookingEffectChannel;
    dedupeKey: string;
    payload: NonNullable<BookingEffectDelivery["payload"]>;
  }> = [];
  for (const input of await finalNotificationInputs(b)) {
    const channels = await resolveNotificationChannels(input);
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
  return db.transaction(async (tx) => {
    // Lock in the same booking -> outbox order used by cancellation. If
    // cancellation committed first, no children are created. If this lock
    // wins first, cancellation waits and then invalidates every inserted row.
    const [activeBooking] = await tx
      .select({ status: bookingRequests.status })
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
    const executor = tx as unknown as typeof db;
    const concurrentExisting = await bookingEffectDeliveriesFor(effect.id, executor);
    if (concurrentExisting.length > 0) return concurrentExisting;
    return enqueueBookingEffectDeliveries(executor, effect.id, rows);
  });
}

async function runConfirmationDeliveries(
  booking: Booking,
  effect: BookingEffect,
  options: ConfirmationProcessorOptions,
): Promise<void> {
  if (booking.clientUserId) {
    const { triggerReferral, isFirstBookingForUser } = await import("@/lib/referrals/trigger");
    if (await isFirstBookingForUser(booking.clientUserId)) {
      const result = await triggerReferral(booking.clientUserId, "first_booking", {
        bookingId: booking.id,
        eventDate: booking.eventDate,
      });
      if (result.reason === "db_error") throw new Error("referral_delivery_failed");
    }
  }

  await materializeConfirmationDeliveries(booking, effect);
  const due = await dueBookingEffectDeliveries(effect.id, 100, options.now);
  for (const row of due) {
    const result = await processBookingEffectDelivery(
      row.id,
      async (claimed) => {
        // A cancellation transaction invalidates all leases; this fresh status
        // check also stops a worker that claimed immediately before cancellation.
        if (!await confirmedBooking(effect.bookingId)) {
          throw new BookingEffectCancelledError();
        }
        await dispatchNotificationChannel(
          claimed.payload as DispatchInput,
          claimed.channel,
          options.drivers,
        );
      },
      options,
    );
    if (result.status === "cancelled") throw new BookingEffectCancelledError();
  }

  const all = await bookingEffectDeliveriesFor(effect.id);
  if (all.some((row) => row.status === "dead_letter")) {
    const terminal = all
      .filter((row) => row.status === "dead_letter")
      .map((row) => `${row.channel}:${row.recipientUserId}:${row.lastError ?? "failed"}`)
      .join("; ");
    throw new BookingEffectDeadLetterError(terminal);
  }
  if (all.some((row) => row.status === "cancelled")) {
    throw new BookingEffectCancelledError();
  }
  if (all.some((row) => row.status !== "delivered")) {
    const retrying = all.filter((row) => row.status !== "delivered").length;
    throw new Error(`confirmation_deliveries_retrying:${retrying}`);
  }
}

type ConfirmationProcessorOptions = BookingEffectClockOptions & {
  /** Legacy coordinator-level test seam. Production uses per-channel rows. */
  deliver?: (booking: Booking, effect: BookingEffect) => Promise<void>;
  drivers?: NotificationChannelDrivers;
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
      else await runConfirmationDeliveries(booking, effect, options);
    },
    options,
  );
  if (result.status === "cancelled") {
    await cancelBookingConfirmationEffects(db, result.effect.bookingId);
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
} = {}) {
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
    errors: [] as Array<{ effectId: number; error: string }>,
  };
  for (const effect of effects) {
    const result = await processConfirmationNotificationEffect(effect.id, {
      ...(options.now ? { now: options.now } : {}),
      deliver: options.deliver,
      drivers: options.drivers,
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
  const row = await persistConfirmationEffects(db, b);
  scheduleConfirmationNotifications(row);
}
