import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, bookingRequests, venueHalls } from "@/lib/db/schema";
import { getVenueIcalTokenForUser } from "@/lib/calendar/ical-token";
import { VenueCalendarClient } from "../../../sala/calendar/client";
import { bookingTextForViewer } from "@/lib/privacy/booking-text";
import { contactsAreShared } from "@/lib/privacy/booking-contact";
import { DEFAULT_LOCALE, isLocale, localizePath } from "@/lib/i18n/routing";
import { requireLocatieVenue, venueDashboardBase } from "@/lib/venues/dashboard-scope";
import { getMergedVenueCalendar } from "@/lib/booking/merged-calendar";

export const dynamic = "force-dynamic";

export default async function LocatieCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; venueId: string }>;
  searchParams: Promise<{ month?: string; date?: string; hallId?: string }>;
}) {
  const { locale: rawLocale, venueId: venueIdRaw } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const venue = await requireLocatieVenue(venueIdRaw, locale);
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect(`${localizePath("/sign-in", locale)}?redirect_url=${encodeURIComponent(localizePath(`${venueDashboardBase(venue.id)}/calendar`, locale))}`);

  const [appUser] = await db
    .select({ id: users.id, googleRefreshToken: users.googleRefreshToken })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) redirect(localizePath("/", locale));

  const sp = await searchParams;
  const now = new Date();
  let monthYear = now.getFullYear();
  let monthIndex = now.getMonth();
  if (sp.month) {
    const [y, m] = sp.month.split("-").map(Number);
    if (Number.isFinite(y) && Number.isFinite(m)) {
      monthYear = y;
      monthIndex = m - 1;
    }
  }
  const hallFilter = sp.hallId ? Number(sp.hallId) : null;

  const monthStart = new Date(monthYear, monthIndex, 1);
  const monthEnd = new Date(monthYear, monthIndex + 1, 0);
  const monthStartIso = monthStart.toISOString().split("T")[0];
  const monthEndIso = monthEnd.toISOString().split("T")[0];

  const [events, bookingsRows, halls] = await Promise.all([
    getMergedVenueCalendar({
      venueId: venue.id,
      monthStartIso,
      monthEndIso,
      hallId: Number.isFinite(hallFilter) ? hallFilter : null,
    }),
    db
      .select({
        id: bookingRequests.id,
        eventDate: bookingRequests.eventDate,
        eventType: bookingRequests.eventType,
        clientName: bookingRequests.clientName,
        guestCount: bookingRequests.guestCount,
        agreedPrice: bookingRequests.agreedPrice,
        status: bookingRequests.status,
        startTime: bookingRequests.startTime,
        endTime: bookingRequests.endTime,
        hallId: bookingRequests.hallId,
      })
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.venueId, venue.id),
          gte(bookingRequests.eventDate, monthStartIso),
          lte(bookingRequests.eventDate, monthEndIso),
          inArray(bookingRequests.status, ["pending", "accepted", "confirmed_by_client"]),
        ),
      ),
    db
      .select({ id: venueHalls.id, nameRo: venueHalls.nameRo, status: venueHalls.status })
      .from(venueHalls)
      .where(eq(venueHalls.venueId, venue.id)),
  ]);

  const icalToken = await getVenueIcalTokenForUser(venue.id, appUser.id);
  if (!icalToken) redirect(localizePath("/dashboard", locale));
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://epetrecere.md";
  const hallQs = Number.isFinite(hallFilter) ? `?hallId=${hallFilter}` : "";
  const icalUrl = `${appUrl}/api/calendar/venue-ical/${venue.id}/${icalToken}.ics${hallQs}`;

  const visibleBookings = Number.isFinite(hallFilter)
    ? bookingsRows.filter((row) => row.hallId == null || row.hallId === hallFilter)
    : bookingsRows;

  return (
    <VenueCalendarClient
      venueId={venue.id}
      venueName={venue.nameRo}
      monthYear={monthYear}
      monthIndex={monthIndex}
      basePath={`${venueDashboardBase(venue.id)}/calendar`}
      halls={halls}
      selectedHallId={Number.isFinite(hallFilter) ? hallFilter : null}
      events={events}
      bookings={visibleBookings.map((booking) => ({
        ...booking,
        clientName: bookingTextForViewer(booking.clientName, contactsAreShared(booking.status)),
        eventType: bookingTextForViewer(booking.eventType, contactsAreShared(booking.status)),
      }))}
      initialDate={sp.date || null}
      icalUrl={icalUrl}
      googleConnected={!!appUser.googleRefreshToken}
      writeTarget="schedule-blocks"
    />
  );
}
