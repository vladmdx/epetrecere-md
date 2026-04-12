// F-A8 (venue flavour) — Venue-side analytics aggregation.
//
// Mirror of `artist-analytics.ts` scoped to a single venue. Reads live
// in the `bookings` table (the admin CRM store used for venue flows)
// rather than `booking_requests` which is artist-only. Feeds the
// entity-aware `/dashboard/analytics` page when the signed-in user
// owns a venue rather than an artist.
//
// Fan-out mirrors the artist helper; keep the shapes aligned so the
// dashboard page can render either payload with the same card layout.

import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, calendarEvents, profileViews } from "@/lib/db/schema";

export type VenueAnalytics = {
  viewsThisMonth: number;
  viewsLastMonth: number;
  viewsDeltaPct: number;
  leadsThisMonth: number;
  confirmedTotal: number;
  conversionPct: number | null;
  daysBookedThisYear: number;
  viewsByMonth: number[]; // 12 entries
  traffic: Array<{ source: string; pct: number }>;
};

function startOfMonth(offset = 0): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - offset, 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfYear(): Date {
  const d = new Date();
  d.setMonth(0, 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function bucketReferrer(referrer: string | null): string {
  if (!referrer) return "Direct";
  try {
    const u = new URL(referrer);
    const host = u.hostname.toLowerCase();
    if (host.includes("google.")) return "Google";
    if (host.includes("bing.") || host.includes("duckduckgo")) return "Search";
    if (host.includes("facebook.") || host.includes("fb.")) return "Facebook";
    if (host.includes("instagram.")) return "Instagram";
    if (host.includes("tiktok.")) return "TikTok";
    if (host.includes("youtube.")) return "YouTube";
    if (host.includes("epetrecere.md")) return "Internal";
    return "Referral";
  } catch {
    return "Direct";
  }
}

function pctDelta(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 100);
}

export async function getVenueAnalytics(
  venueId: number,
): Promise<VenueAnalytics> {
  const thisMonth = startOfMonth(0);
  const lastMonth = startOfMonth(1);
  const yearStart = startOfYear();

  const [
    viewsThisRows,
    viewsLastRows,
    leadsThisRows,
    confirmedTotalRows,
    leadsTotalRows,
    daysBookedRows,
    viewsByMonthRows,
    referrerRows,
  ] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(profileViews)
      .where(
        and(
          eq(profileViews.venueId, venueId),
          gte(profileViews.createdAt, thisMonth),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(profileViews)
      .where(
        and(
          eq(profileViews.venueId, venueId),
          gte(profileViews.createdAt, lastMonth),
          lt(profileViews.createdAt, thisMonth),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookings)
      .where(
        and(
          eq(bookings.venueId, venueId),
          gte(bookings.createdAt, thisMonth),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookings)
      .where(
        and(eq(bookings.venueId, venueId), eq(bookings.status, "confirmed")),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookings)
      .where(eq(bookings.venueId, venueId)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.entityType, "venue"),
          eq(calendarEvents.entityId, venueId),
          eq(calendarEvents.status, "booked"),
          gte(calendarEvents.date, yearStart.toISOString().slice(0, 10)),
        ),
      ),
    db
      .select({
        month: sql<number>`extract(month from ${profileViews.createdAt})::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(profileViews)
      .where(
        and(
          eq(profileViews.venueId, venueId),
          gte(profileViews.createdAt, yearStart),
        ),
      )
      .groupBy(sql`extract(month from ${profileViews.createdAt})`),
    db
      .select({
        referrer: profileViews.referrer,
        count: sql<number>`count(*)::int`,
      })
      .from(profileViews)
      .where(
        and(
          eq(profileViews.venueId, venueId),
          gte(profileViews.createdAt, thisMonth),
        ),
      )
      .groupBy(profileViews.referrer),
  ]);

  const viewsThisMonth = viewsThisRows[0]?.count ?? 0;
  const viewsLastMonth = viewsLastRows[0]?.count ?? 0;
  const leadsThisMonth = leadsThisRows[0]?.count ?? 0;
  const confirmedTotal = confirmedTotalRows[0]?.count ?? 0;
  const leadsTotal = leadsTotalRows[0]?.count ?? 0;
  const daysBookedThisYear = daysBookedRows[0]?.count ?? 0;

  const conversionPct =
    leadsTotal > 0
      ? Math.round((confirmedTotal / leadsTotal) * 1000) / 10
      : null;

  const viewsByMonth = new Array(12).fill(0) as number[];
  for (const row of viewsByMonthRows) {
    const idx = Number(row.month) - 1;
    if (idx >= 0 && idx < 12) viewsByMonth[idx] = Number(row.count);
  }

  const bucketCounts = new Map<string, number>();
  let totalWithReferrer = 0;
  for (const row of referrerRows) {
    totalWithReferrer += Number(row.count);
    const label = bucketReferrer(row.referrer);
    bucketCounts.set(label, (bucketCounts.get(label) ?? 0) + Number(row.count));
  }
  const traffic = Array.from(bucketCounts.entries())
    .map(([source, count]) => ({
      source,
      pct:
        totalWithReferrer > 0
          ? Math.round((count / totalWithReferrer) * 100)
          : 0,
    }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 5);

  return {
    viewsThisMonth,
    viewsLastMonth,
    viewsDeltaPct: pctDelta(viewsThisMonth, viewsLastMonth),
    leadsThisMonth,
    confirmedTotal,
    conversionPct,
    daysBookedThisYear,
    viewsByMonth,
    traffic,
  };
}
