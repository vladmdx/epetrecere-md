// Venue dashboard home — spec section 1.
//
// Layout: 4 KPI cards in a row, then a grid with a mini calendar on the
// left and a recent activity feed on the right, then a "last 5 bookings"
// table for quick action.

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { listAccessibleVenueIds, requireVenueCapability } from "@/lib/venue-access";
import { users, venues, calendarEvents } from "@/lib/db/schema";
import {
  getVenueStats,
  getVenueActivity,
  getVenueRecentBookings,
  getVenueLegacyRecentBookings,
} from "@/lib/db/queries/venue-stats";
import { VenueHomeDashboard } from "./home-client";
import { DEFAULT_LOCALE, isLocale, localizePath } from "@/lib/i18n/routing";
import { venueDashboardMonths } from "@/lib/vendors/dashboard-bookings";

export const dynamic = "force-dynamic";

export default async function VenueHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect(`${localizePath("/sign-in", locale)}?redirect_url=${encodeURIComponent(localizePath("/dashboard/sala", locale))}`);

  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) redirect(localizePath("/", locale));

  const [venue] = await db
    .select({ id: venues.id, nameRo: venues.nameRo, slug: venues.slug, isActive: venues.isActive })
    .from(venues)
    .where(inArray(venues.id, await listAccessibleVenueIds(appUser.id)))
    .limit(1);
  if (!venue) redirect(localizePath("/dashboard", locale));
  const financialAccess = await requireVenueCapability(
    venue.id,
    "manage_financials",
  );
  const canManageFinancials = financialAccess.ok;

  const now = new Date();
  const { monthStart, nextMonthStart, monthYear, monthIndex } = venueDashboardMonths(now);

  const [stats, activity, recentBookings, monthCalendar, legacyBookings] = await Promise.all([
    getVenueStats(venue.id, now, { includeFinancials: canManageFinancials }),
    getVenueActivity(appUser.id, 10),
    getVenueRecentBookings(venue.id, 5, { includeFinancials: canManageFinancials }),
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
          gte(calendarEvents.date, monthStart),
          lt(calendarEvents.date, nextMonthStart),
        ),
      ),
    getVenueLegacyRecentBookings(venue.id, 5, {
      includeFinancials: canManageFinancials,
    }),
  ]);

  return (
    <VenueHomeDashboard
      venueName={venue.nameRo}
      venueSlug={venue.slug}
      isActive={venue.isActive}
      canManageFinancials={canManageFinancials}
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
