// Venue Analytics — spec section 9.
//
// Profile views, CTA clicks, traffic sources, plus a Premium-style
// comparison card: your rating/price/views vs the city average.

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { and, avg, count, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  users,
  venues,
  profileViews,
} from "@/lib/db/schema";
import { VenueAnalyticsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function VenueAnalyticsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in?redirect_url=/dashboard/sala/analitice");

  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) redirect("/");

  const [venue] = await db
    .select({
      id: venues.id,
      nameRo: venues.nameRo,
      city: venues.city,
      pricePerPerson: venues.pricePerPerson,
      ratingAvg: venues.ratingAvg,
      ratingCount: venues.ratingCount,
    })
    .from(venues)
    .where(eq(venues.userId, appUser.id))
    .limit(1);
  if (!venue) redirect("/dashboard");

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Last 30 days of views, grouped per day for a line chart
  const viewsByDay = await db
    .select({
      day: sql<string>`DATE_TRUNC('day', ${profileViews.createdAt})::date::text`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(profileViews)
    .where(
      and(
        eq(profileViews.venueId, venue.id),
        gte(profileViews.createdAt, thirtyDaysAgo),
      ),
    )
    .groupBy(sql`DATE_TRUNC('day', ${profileViews.createdAt})`);

  // Referrer breakdown
  const referrerRows = await db
    .select({
      referrer: profileViews.referrer,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(profileViews)
    .where(
      and(
        eq(profileViews.venueId, venue.id),
        gte(profileViews.createdAt, thirtyDaysAgo),
      ),
    )
    .groupBy(profileViews.referrer);

  // Total views (30d)
  const totalViews30d = viewsByDay.reduce((s, v) => s + Number(v.count), 0);

  // City comparison — average rating + price for active venues in same city
  let cityComparison: {
    avgPrice: number | null;
    avgRating: number | null;
    avgViewsPerVenue: number | null;
    venueCount: number;
  } = {
    avgPrice: null,
    avgRating: null,
    avgViewsPerVenue: null,
    venueCount: 0,
  };

  if (venue.city) {
    const [cmp] = await db
      .select({
        avgPrice: avg(venues.pricePerPerson),
        avgRating: avg(venues.ratingAvg),
        venueCount: count(),
      })
      .from(venues)
      .where(and(eq(venues.city, venue.city), eq(venues.isActive, true)));

    // Average views per venue in this city (last 30d)
    const cityViewRow = await db
      .select({
        total: sql<number>`COUNT(*)::int`,
      })
      .from(profileViews)
      .innerJoin(venues, eq(profileViews.venueId, venues.id))
      .where(
        and(
          eq(venues.city, venue.city),
          eq(venues.isActive, true),
          gte(profileViews.createdAt, thirtyDaysAgo),
        ),
      );

    const vc = Number(cmp?.venueCount ?? 0);
    cityComparison = {
      avgPrice: cmp?.avgPrice !== null ? Number(cmp?.avgPrice) : null,
      avgRating: cmp?.avgRating !== null ? Number(cmp?.avgRating) : null,
      avgViewsPerVenue:
        vc > 0 ? Math.round(Number(cityViewRow[0]?.total ?? 0) / vc) : null,
      venueCount: vc,
    };
  }

  // Build chart data for last 30 days (fill missing days with zero)
  const chartPoints: Array<{ date: string; label: string; views: number }> = [];
  const viewsMap = new Map<string, number>();
  for (const v of viewsByDay) {
    viewsMap.set(v.day, Number(v.count));
  }
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().split("T")[0];
    chartPoints.push({
      date: ds,
      label: d.toLocaleDateString("ro-RO", { day: "numeric", month: "short" }),
      views: viewsMap.get(ds) ?? 0,
    });
  }

  return (
    <VenueAnalyticsClient
      venue={{
        id: venue.id,
        nameRo: venue.nameRo,
        city: venue.city,
        pricePerPerson: venue.pricePerPerson,
        ratingAvg: venue.ratingAvg,
        ratingCount: venue.ratingCount,
      }}
      totalViews30d={totalViews30d}
      chartPoints={chartPoints}
      referrerBreakdown={referrerRows.map((r) => ({
        referrer: r.referrer,
        count: Number(r.count),
      }))}
      cityComparison={cityComparison}
    />
  );
}
