// Venue dashboard home — spec section 1.
//
// Layout: 4 KPI cards in a row, then a grid with a mini calendar on the
// left and a recent activity feed on the right, then a "last 5 bookings"
// table for quick action.

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, venues, calendarEvents } from "@/lib/db/schema";
import {
  getVenueStats,
  getVenueActivity,
  getVenueRecentBookings,
} from "@/lib/db/queries/venue-stats";
import { VenueHomeDashboard } from "./home-client";

export const dynamic = "force-dynamic";

export default async function VenueHomePage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in?redirect_url=/dashboard/sala");

  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) redirect("/");

  const [venue] = await db
    .select({ id: venues.id, nameRo: venues.nameRo, slug: venues.slug })
    .from(venues)
    .where(eq(venues.userId, appUser.id))
    .limit(1);
  if (!venue) redirect("/dashboard");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const monthStartIso = monthStart.toISOString().split("T")[0];
  const monthEndIso = monthEnd.toISOString().split("T")[0];

  const [stats, activity, recentBookings, monthCalendar] = await Promise.all([
    getVenueStats(venue.id),
    getVenueActivity(appUser.id, 10),
    getVenueRecentBookings(venue.id, 5),
    // Scope to this venue only — the previous query fetched events for ALL
    // venues and filtered in JS, leaking other venues' availability.
    db
      .select({
        date: calendarEvents.date,
        status: calendarEvents.status,
        eventType: calendarEvents.eventType,
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
  ]);

  return (
    <VenueHomeDashboard
      venueName={venue.nameRo}
      venueSlug={venue.slug}
      stats={stats}
      activity={activity.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
      }))}
      recentBookings={recentBookings}
      monthCalendar={monthCalendar}
      monthYear={now.getFullYear()}
      monthIndex={now.getMonth()}
    />
  );
}
