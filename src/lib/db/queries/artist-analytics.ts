// F-A8 — Vendor-side analytics aggregation.
//
// Mirror of the admin analytics page but scoped to a single artist. Feeds
// `src/app/(vendor)/dashboard/analytics/page.tsx`. The admin variant lives
// inline in the admin page; keeping the vendor flavour as a helper means
// we can reuse it from an `/api/me/artist/analytics` route later without
// duplicating the SQL.
//
// Everything the dashboard needs in one parallel fan-out:
//   - viewsThisMonth / viewsLastMonth   → delta + big number
//   - leadsThisMonth                    → booking_requests created this month
//   - confirmedTotal                    → lifetime confirmed_by_client count
//   - conversionPct                     → confirmed / booking_requests
//   - daysBookedThisYear                → distinct calendar_events rows for
//                                          this artist with status='booked'
//                                          and date ≥ Jan 1 of current year
//   - viewsByMonth                      → 12-entry array for the bar chart
//   - traffic                           → top 5 referrer buckets this month
//
// The helper is DB-bound only — no Clerk or HTTP concerns. Callers resolve
// the artist id first and hand it in.

import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  bookingRequests,
  calendarEvents,
  profileViews,
} from "@/lib/db/schema";

export type ArtistAnalytics = {
  viewsThisMonth: number;
  viewsLastMonth: number;
  viewsDeltaPct: number; // rounded signed integer; +100 means doubled
  leadsThisMonth: number;
  confirmedTotal: number;
  conversionPct: number | null; // 0..100, null if zero leads lifetime
  daysBookedThisYear: number;
  viewsByMonth: number[]; // 12 entries, Jan..Dec of current year
  traffic: Array<{ source: string; pct: number }>; // top 5, sorted desc
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

export async function getArtistAnalytics(
  artistId: number,
): Promise<ArtistAnalytics> {
  const thisMonth = startOfMonth(0);
  const lastMonth = startOfMonth(1);
  const yearStart = startOfYear();

  // Single parallel fan-out — the dashboard is a first-paint surface so
  // sequential awaits would hurt p95. None of these depend on each other.
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
          eq(profileViews.artistId, artistId),
          gte(profileViews.createdAt, thisMonth),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(profileViews)
      .where(
        and(
          eq(profileViews.artistId, artistId),
          gte(profileViews.createdAt, lastMonth),
          lt(profileViews.createdAt, thisMonth),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.artistId, artistId),
          gte(bookingRequests.createdAt, thisMonth),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.artistId, artistId),
          eq(bookingRequests.status, "confirmed_by_client"),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookingRequests)
      .where(eq(bookingRequests.artistId, artistId)),
    // Days with a calendar_events row in status='booked' for this artist
    // this year. Used as the "days booked" headline stat on the page.
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.entityType, "artist"),
          eq(calendarEvents.entityId, artistId),
          eq(calendarEvents.status, "booked"),
          gte(calendarEvents.date, yearStart.toISOString().slice(0, 10)),
        ),
      ),
    // Views per month for the current year. Month is 1-12 here; we map
    // into a zero-indexed array below.
    db
      .select({
        month: sql<number>`extract(month from ${profileViews.createdAt})::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(profileViews)
      .where(
        and(
          eq(profileViews.artistId, artistId),
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
          eq(profileViews.artistId, artistId),
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
    leadsTotal > 0 ? Math.round((confirmedTotal / leadsTotal) * 1000) / 10 : null;

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
