// Venue calendar — spec section 2.
//
// Monthly grid with event-type-colored days. Click a day → popup with
// status options (Available/Blocked/Note) or booking details. Venue-
// owned calendar_events + accepted bookings from booking_requests.

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  users,
  venues,
  calendarEvents,
  bookingRequests,
} from "@/lib/db/schema";
import { getVenueIcalToken } from "@/lib/calendar/ical-token";
import { VenueCalendarClient } from "./client";

export const dynamic = "force-dynamic";

export default async function VenueCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; date?: string }>;
}) {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in?redirect_url=/dashboard/sala/calendar");

  const [appUser] = await db
    .select({
      id: users.id,
      googleRefreshToken: users.googleRefreshToken,
    })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) redirect("/");

  const [venue] = await db
    .select({ id: venues.id, nameRo: venues.nameRo })
    .from(venues)
    .where(eq(venues.userId, appUser.id))
    .limit(1);
  if (!venue) redirect("/dashboard");

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

  const monthStart = new Date(monthYear, monthIndex, 1);
  const monthEnd = new Date(monthYear, monthIndex + 1, 0);
  const monthStartIso = monthStart.toISOString().split("T")[0];
  const monthEndIso = monthEnd.toISOString().split("T")[0];

  const [events, bookingsRows] = await Promise.all([
    db
      .select({
        date: calendarEvents.date,
        status: calendarEvents.status,
        eventType: calendarEvents.eventType,
        note: calendarEvents.note,
        source: calendarEvents.source,
      })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.entityType, "venue"),
          eq(calendarEvents.entityId, venue.id),
          gte(calendarEvents.date, monthStartIso),
          lte(calendarEvents.date, monthEndIso),
        ),
      ),
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
      })
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.venueId, venue.id),
          gte(bookingRequests.eventDate, monthStartIso),
          lte(bookingRequests.eventDate, monthEndIso),
          inArray(bookingRequests.status, [
            "pending",
            "accepted",
            "confirmed_by_client",
          ]),
        ),
      ),
  ]);

  const icalToken = getVenueIcalToken(venue.id);
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://epetrecere.md";
  const icalUrl = `${appUrl}/api/calendar/venue-ical/${venue.id}/${icalToken}.ics`;

  return (
    <VenueCalendarClient
      venueId={venue.id}
      venueName={venue.nameRo}
      monthYear={monthYear}
      monthIndex={monthIndex}
      events={events}
      bookings={bookingsRows}
      initialDate={sp.date || null}
      icalUrl={icalUrl}
      googleConnected={!!appUser.googleRefreshToken}
    />
  );
}
