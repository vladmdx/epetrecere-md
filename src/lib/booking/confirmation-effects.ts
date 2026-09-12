import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { artists, users, bookingRequests } from "@/lib/db/schema";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { getVenueOwnerUserIds } from "@/lib/venue-access";
import { persistConfirmationEffects } from "./confirmation-persist";
import {
  CONFIRMATION_NOTIFICATION_EFFECT,
  bookingEffectFor,
  dueBookingEffects,
  processBookingEffect,
  type BookingEffect,
  type BookingEffectClockOptions,
  type BookingEffectProcessResult,
} from "./effect-outbox";

type Booking = typeof bookingRequests.$inferSelect;

export { persistConfirmationEffects, projectBookingOntoCalendar } from "./confirmation-persist";

export async function notifyConfirmationStep(
  b: Booking,
  title: string,
  options: { durableExternal?: boolean } = {},
) {
  // ADR 0028 — notify the venue's real owners (org members), not "the first
  // venue's user". Falls back to the artist owner for artist bookings.
  const vendorUserIds = b.venueId
    ? await getVenueOwnerUserIds(b.venueId)
    : b.artistId
      ? (await db.select({ userId: artists.userId }).from(artists).where(eq(artists.id, b.artistId)).limit(1))
          .map((a) => a.userId)
          .filter((x): x is string => Boolean(x))
      : [];
  const deliveryErrors: unknown[] = [];
  for (const userId of new Set([b.clientUserId, ...vendorUserIds])) {
    if (!userId) continue;
    try {
      const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
      const { isMultiHallEnabled } = await import("@/lib/feature-flags");
      const actionUrl = userId === b.clientUserId
        ? "/cabinet/rezervari"
        : b.venueId
          ? isMultiHallEnabled()
            ? `/dashboard/locatii/${b.venueId}/rezervari?tab=acceptate`
            : "/dashboard/sala/rezervari?tab=acceptate"
          : "/dashboard/rezervari";
      const { venueHallDisplayName } = await import("@/lib/booking/venue-booking-write");
      const place = b.venueId ? await venueHallDisplayName(b.venueId, b.hallId ?? null) : "";
      await dispatchNotification(
        { userId, type: "booking_status_changed", title,
          message: `${place ? `${place} · ` : ""}Rezervarea #${b.id} · ${b.eventDate}. Verifică detaliile în cont.`,
          actionUrl, email: u?.email, emailSubject: title,
          emailHtml: `<p>${title}</p><p>${place ? `${place} · ` : ""}Rezervarea #${b.id} · ${b.eventDate}</p><p><a href="https://epetrecere.md${actionUrl}">Vezi rezervarea în cont</a></p>`,
          dedupeKey: `booking:${b.id}:${userId}:${title}`,
        },
        options.durableExternal ? { delivery: "durable" } : undefined,
      );
    } catch (error) {
      if (!options.durableExternal) throw error;
      deliveryErrors.push(error);
    }
  }
  if (deliveryErrors.length > 0) {
    throw new AggregateError(deliveryErrors, "confirmation_recipient_delivery_failed");
  }
}

async function deliverConfirmationNotifications(b: Booking): Promise<void> {
  // Referral writes are DB-idempotent. Do them before external I/O so a
  // transient referral failure cannot cause avoidable duplicate emails.
  if (b.clientUserId) {
    const { triggerReferral, isFirstBookingForUser } = await import("@/lib/referrals/trigger");
    if (await isFirstBookingForUser(b.clientUserId)) {
      const result = await triggerReferral(b.clientUserId, "first_booking", {
        bookingId: b.id,
        eventDate: b.eventDate,
      });
      if (result.reason === "db_error") throw new Error("referral_delivery_failed");
    }
  }
  await notifyConfirmationStep(
    b,
    "Rezervare confirmată de ambele părți",
    { durableExternal: true },
  );
}

type ConfirmationProcessorOptions = BookingEffectClockOptions & {
  deliver?: (booking: Booking, effect: BookingEffect) => Promise<void>;
};

export async function processConfirmationNotificationEffect(
  effectId: number,
  options: ConfirmationProcessorOptions = {},
): Promise<BookingEffectProcessResult> {
  return processBookingEffect(
    effectId,
    async (effect) => {
      const [booking] = await db
        .select()
        .from(bookingRequests)
        .where(eq(bookingRequests.id, effect.bookingId))
        .limit(1);
      if (!booking) throw new Error("booking_not_found");
      await (options.deliver ?? deliverConfirmationNotifications)(booking, effect);
    },
    options,
  );
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
} = {}) {
  const effects = await dueBookingEffects(
    CONFIRMATION_NOTIFICATION_EFFECT,
    options.limit ?? 25,
    options.now,
  );
  const summary = { selected: effects.length, delivered: 0, failed: 0, skipped: 0 };
  for (const effect of effects) {
    const result = await processConfirmationNotificationEffect(effect.id, {
      ...(options.now ? { now: options.now } : {}),
      deliver: options.deliver,
    });
    if (result.status === "delivered") summary.delivered += 1;
    else if (result.status === "failed") summary.failed += 1;
    else summary.skipped += 1;
  }
  return summary;
}

export function scheduleConfirmationNotifications(b: Booking) {
  after(async () => {
    try {
      const result = await processConfirmationNotificationForBooking(b.id);
      if (result.status === "failed") {
        console.error(`[booking-outbox] confirmation effect ${result.effect.id} failed: ${result.error}`);
      }
    } catch (error) {
      // The durable row is already committed. A cron worker will recover it.
      console.error(`[booking-outbox] immediate processing failed for booking ${b.id}`, error);
    }
  });
}

export async function finalConfirmationEffects(b: Booking) {
  const row = await persistConfirmationEffects(db, b);
  scheduleConfirmationNotifications(row);
}
