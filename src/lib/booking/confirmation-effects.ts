import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { artists, users, bookingRequests, calendarEvents } from "@/lib/db/schema";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { ensureCommissionForBooking } from "@/lib/commissions/service";
import { getVenueOwnerUserIds } from "@/lib/venue-access";

type Booking = typeof bookingRequests.$inferSelect;

export async function notifyConfirmationStep(b: Booking, title: string) {
  // ADR 0028 — notify the venue's real owners (org members), not "the first
  // venue's user". Falls back to the artist owner for artist bookings.
  const vendorUserIds = b.venueId
    ? await getVenueOwnerUserIds(b.venueId)
    : b.artistId
      ? (await db.select({ userId: artists.userId }).from(artists).where(eq(artists.id, b.artistId)).limit(1))
          .map((a) => a.userId)
          .filter((x): x is string => Boolean(x))
      : [];
  for (const userId of [b.clientUserId, ...vendorUserIds]) {
    if (!userId) continue;
    const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    const actionUrl = userId === b.clientUserId
      ? "/cabinet/rezervari"
      : b.venueId
        ? `/dashboard/locatii/${b.venueId}/rezervari?tab=acceptate`
        : "/dashboard/rezervari";
    const { venueHallDisplayName } = await import("@/lib/booking/venue-booking-write");
    const place = b.venueId ? await venueHallDisplayName(b.venueId, b.hallId ?? null) : "";
    await dispatchNotification({ userId, type: "booking_status_changed", title,
      message: `${place ? `${place} · ` : ""}Rezervarea #${b.id} · ${b.eventDate}. Verifică detaliile în cont.`,
      actionUrl, email: u?.email, emailSubject: title,
      emailHtml: `<p>${title}</p><p>${place ? `${place} · ` : ""}Rezervarea #${b.id} · ${b.eventDate}</p><p><a href="https://epetrecere.md${actionUrl}">Vezi rezervarea în cont</a></p>`,
    });
  }
}

export async function finalConfirmationEffects(b: Booking) {
  // Await the financial write. Never rely on an unawaited serverless promise.
  await ensureCommissionForBooking(b.id);
  if (b.venueId && !b.commercialSnapshot) {
    const { commercialSnapshotFor } = await import("@/lib/booking/venue-booking-write");
    const snapshot = await commercialSnapshotFor({
      venueId: b.venueId,
      hallId: b.hallId ?? null,
      reservationScope: b.reservationScope ?? "hall",
      agreedPrice: b.agreedPrice,
      currency: b.agreedCurrency,
      guestCount: b.guestCount,
      eventType: b.eventType,
    });
    await db.update(bookingRequests).set({ commercialSnapshot: snapshot, updatedAt: new Date() }).where(eq(bookingRequests.id, b.id));
  }
  const entityId = b.venueId ?? b.artistId;
  if (entityId) {
    const entityType = b.venueId ? "venue" : "artist";
    const note = `Rezervare #${b.id}`;
    const [existing] = await db.select({ id: calendarEvents.id }).from(calendarEvents).where(and(
      eq(calendarEvents.bookingId, b.id),
    )).limit(1);
    if (!existing) await db.insert(calendarEvents).values({
      entityType,
      entityId,
      date: b.eventDate,
      status: "booked",
      source: "booking",
      bookingId: b.id,
      hallId: b.hallId,
      eventType: b.eventType,
      startTime: b.startTime,
      endTime: b.endTime,
      note,
    });
  }
  after(async () => {
    await notifyConfirmationStep(b, "Rezervare confirmată de ambele părți");
    if (b.clientUserId) {
      const { triggerReferral, isFirstBookingForUser } = await import("@/lib/referrals/trigger");
      if (await isFirstBookingForUser(b.clientUserId)) await triggerReferral(b.clientUserId, "first_booking", { bookingId: b.id, eventDate: b.eventDate });
    }
  });
}
