import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { artists, users, bookingRequests } from "@/lib/db/schema";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { getVenueOwnerUserIds } from "@/lib/venue-access";
import { persistConfirmationEffects } from "./confirmation-persist";

type Booking = typeof bookingRequests.$inferSelect;

export { persistConfirmationEffects, projectBookingOntoCalendar } from "./confirmation-persist";

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
    await dispatchNotification({ userId, type: "booking_status_changed", title,
      message: `${place ? `${place} · ` : ""}Rezervarea #${b.id} · ${b.eventDate}. Verifică detaliile în cont.`,
      actionUrl, email: u?.email, emailSubject: title,
      emailHtml: `<p>${title}</p><p>${place ? `${place} · ` : ""}Rezervarea #${b.id} · ${b.eventDate}</p><p><a href="https://epetrecere.md${actionUrl}">Vezi rezervarea în cont</a></p>`,
    });
  }
}

export function scheduleConfirmationNotifications(b: Booking) {
  after(async () => {
    await notifyConfirmationStep(b, "Rezervare confirmată de ambele părți");
    if (b.clientUserId) {
      const { triggerReferral, isFirstBookingForUser } = await import("@/lib/referrals/trigger");
      if (await isFirstBookingForUser(b.clientUserId)) {
        await triggerReferral(b.clientUserId, "first_booking", { bookingId: b.id, eventDate: b.eventDate });
      }
    }
  });
}

export async function finalConfirmationEffects(b: Booking) {
  const row = await persistConfirmationEffects(db, b);
  scheduleConfirmationNotifications(row);
}
