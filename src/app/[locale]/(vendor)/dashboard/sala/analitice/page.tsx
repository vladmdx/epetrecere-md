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
  profileClicks,
} from "@/lib/db/schema";
import { VenueAnalyticsClient } from "./client";

export const dynamic = "force-dynamic";

/** Whitelisted period presets. Custom ranges can be added later with
 *  `from` + `to` query params. */
const PERIOD_DAYS: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "12m": 365,
};

export default async function VenueAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
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

  const sp = await searchParams;
  const periodKey = sp.period && PERIOD_DAYS[sp.period] ? sp.period : "30d";
  const periodDays = PERIOD_DAYS[periodKey];
  const now = new Date();
  const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

  // Views grouped per day — drives the line chart
  const viewsByDay = await db
    .select({
      day: sql<string>`DATE_TRUNC('day', ${profileViews.createdAt})::date::text`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(profileViews)
    .where(
      and(
        eq(profileViews.venueId, venue.id),
        gte(profileViews.createdAt, periodStart),
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
        gte(profileViews.createdAt, periodStart),
      ),
    )
    .groupBy(profileViews.referrer);

  // Click breakdown by type (CTA, phone, gallery, menu, contact)
  const clickRows = await db
    .select({
      clickType: profileClicks.clickType,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(profileClicks)
    .where(
      and(
        eq(profileClicks.venueId, venue.id),
        gte(profileClicks.createdAt, periodStart),
      ),
    )
    .groupBy(profileClicks.clickType);

  const clicksByType: Record<string, number> = {};
  for (const r of clickRows) {
    clicksByType[r.clickType] = Number(r.count);
  }

  // Total views within the selected period
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

    // Average views per venue in this city within the same period
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
          gte(profileViews.createdAt, periodStart),
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

  // Build chart data. We fill missing days with zero. For a 12-month period
  // the chart aggregates by week to keep the x-axis readable.
  const chartPoints: Array<{ date: string; label: string; views: number }> = [];
  const viewsMap = new Map<string, number>();
  for (const v of viewsByDay) {
    viewsMap.set(v.day, Number(v.count));
  }
  if (periodDays <= 90) {
    for (let i = periodDays - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().split("T")[0];
      chartPoints.push({
        date: ds,
        label: d.toLocaleDateString("ro-RO", { day: "numeric", month: "short" }),
        views: viewsMap.get(ds) ?? 0,
      });
    }
  } else {
    // 12-month view: bucket by month
    const byMonth = new Map<string, number>();
    for (const [day, count] of viewsMap.entries()) {
      const ym = day.slice(0, 7);
      byMonth.set(ym, (byMonth.get(ym) ?? 0) + count);
    }
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      chartPoints.push({
        date: ym,
        label: d.toLocaleDateString("ro-RO", { month: "short", year: "2-digit" }),
        views: byMonth.get(ym) ?? 0,
      });
    }
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
      periodKey={periodKey}
      periodDays={periodDays}
      totalViews30d={totalViews30d}
      clicksByType={clicksByType}
      chartPoints={chartPoints}
      referrerBreakdown={referrerRows.map((r) => ({
        referrer: r.referrer,
        count: Number(r.count),
      }))}
      cityComparison={cityComparison}
    />
  );
}
