import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, calendarEvents } from "@/lib/db/schema";
import {
  getVenueStats,
  getVenueActivity,
  getVenueRecentBookings,
  getVenueLegacyRecentBookings,
} from "@/lib/db/queries/venue-stats";
import { VenueHomeDashboard } from "../../sala/home-client";
import { DEFAULT_LOCALE, isLocale, localizePath } from "@/lib/i18n/routing";
import { venueDashboardMonths } from "@/lib/vendors/dashboard-bookings";
import { requireLocatieVenue, venueDashboardBase } from "@/lib/venues/dashboard-scope";

export const dynamic = "force-dynamic";

export default async function LocatieHomePage({
  params,
}: {
  params: Promise<{ locale: string; venueId: string }>;
}) {
  const { locale: rawLocale, venueId: venueIdRaw } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const venue = await requireLocatieVenue(venueIdRaw, locale);
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    redirect(
      `${localizePath("/sign-in", locale)}?redirect_url=${encodeURIComponent(localizePath(venueDashboardBase(venue.id), locale))}`,
    );
  }
  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) redirect(localizePath("/", locale));

  const now = new Date();
  const { monthStart, nextMonthStart, monthYear, monthIndex } = venueDashboardMonths(now);

  const [stats, activity, recentBookings, monthCalendar, legacyBookings] = await Promise.all([
    getVenueStats(venue.id, now),
    getVenueActivity(appUser.id, 10),
    getVenueRecentBookings(venue.id, 5),
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
          gte(calendarEvents.date, monthStart),
          lt(calendarEvents.date, nextMonthStart),
        ),
      ),
    getVenueLegacyRecentBookings(venue.id, 5),
  ]);

  return (
    <VenueHomeDashboard
      venueName={venue.nameRo}
      venueSlug={venue.slug}
      isActive={venue.isActive}
      basePath={venueDashboardBase(venue.id)}
      stats={stats}
      activity={activity.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
      }))}
      recentBookings={recentBookings}
      legacyBookings={legacyBookings}
      monthCalendar={monthCalendar}
      monthYear={monthYear}
      monthIndex={monthIndex}
    />
  );
}
