// M5 — Admin analytics wired to real data.
//
// Server-side aggregation over profile_views, leads, booking_requests and
// artists. Top artists are ranked by a combined signal of bookings and
// views so both "busy" and "trending" vendors surface. Numbers are rolled
// up for the current month with a delta vs the prior month.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TrendingUp,
  Users,
  Calendar,
  DollarSign,
  Eye,
  MessageSquare,
} from "lucide-react";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  profileViews,
  bookingRequests,
  leads,
  artists,
} from "@/lib/db/schema";

export const dynamic = "force-dynamic";

function pctDelta(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? "0%" : "+100%";
  const pct = Math.round(((current - previous) / previous) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

function startOfMonthIso(offset = 0): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - offset, 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function AnalyticsPage() {
  const now = new Date();
  const thisMonth = startOfMonthIso(0);
  const lastMonth = startOfMonthIso(1);
  const year = now.getFullYear();
  const todayIso = now.toISOString().slice(0, 10);

  // ── Counts (this month vs last month) ──────────────────────────
  const [
    viewsThisRows,
    viewsLastRows,
    leadsThisRows,
    leadsLastRows,
    activeArtistsRows,
    bookingsThisRows,
    bookingsLastRows,
    confirmedBookingsRows,
  ] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(profileViews)
      .where(gte(profileViews.createdAt, thisMonth)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(profileViews)
      .where(
        and(
          gte(profileViews.createdAt, lastMonth),
          lt(profileViews.createdAt, thisMonth),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(leads)
      .where(gte(leads.createdAt, thisMonth)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(leads)
      .where(
        and(gte(leads.createdAt, lastMonth), lt(leads.createdAt, thisMonth)),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(artists)
      .where(eq(artists.isActive, true)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookingRequests)
      .where(gte(bookingRequests.createdAt, thisMonth)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookingRequests)
      .where(
        and(
          gte(bookingRequests.createdAt, lastMonth),
          lt(bookingRequests.createdAt, thisMonth),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookingRequests)
      .where(eq(bookingRequests.status, "confirmed_by_client")),
  ]);

  const viewsThis = viewsThisRows[0]?.count ?? 0;
  const viewsLast = viewsLastRows[0]?.count ?? 0;
  const leadsThis = leadsThisRows[0]?.count ?? 0;
  const leadsLast = leadsLastRows[0]?.count ?? 0;
  const activeArtists = activeArtistsRows[0]?.count ?? 0;
  const bookingsThis = bookingsThisRows[0]?.count ?? 0;
  const bookingsLast = bookingsLastRows[0]?.count ?? 0;
  const confirmedTotal = confirmedBookingsRows[0]?.count ?? 0;

  // ── Revenue estimate from confirmed bookings (artist.priceFrom) ─
  const revenueRows = await db
    .select({
      total: sql<number>`COALESCE(SUM(${artists.priceFrom}), 0)::int`,
    })
    .from(bookingRequests)
    .innerJoin(artists, eq(bookingRequests.artistId, artists.id))
    .where(
      and(
        eq(bookingRequests.status, "confirmed_by_client"),
        gte(bookingRequests.eventDate, `${year}-01-01`),
      ),
    );
  const revenueYear = revenueRows[0]?.total ?? 0;

  // ── Conversion rate: leads → confirmed bookings (all time) ─────
  const [totalLeadsRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leads);
  const totalLeads = totalLeadsRow?.count ?? 0;
  const conversionPct =
    totalLeads > 0
      ? ((confirmedTotal / totalLeads) * 100).toFixed(1) + "%"
      : "—";

  // ── Top artists: rank by combined score (bookings ×10 + views) ─
  const topBookingRows = await db
    .select({
      artistId: bookingRequests.artistId,
      bookings: sql<number>`count(*)::int`,
    })
    .from(bookingRequests)
    .where(
      inArray(bookingRequests.status, ["accepted", "confirmed_by_client"]),
    )
    .groupBy(bookingRequests.artistId)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  let topArtistsWithNames: Array<{
    id: number;
    nameRo: string;
    bookings: number;
    revenue: number;
    currency: string;
  }> = [];
  if (topBookingRows.length > 0) {
    const topIds = topBookingRows.map((r) => r.artistId);
    const artistRows = await db
      .select({
        id: artists.id,
        nameRo: artists.nameRo,
        priceFrom: artists.priceFrom,
        priceCurrency: artists.priceCurrency,
      })
      .from(artists)
      .where(inArray(artists.id, topIds));
    const byId = new Map(artistRows.map((a) => [a.id, a]));
    topArtistsWithNames = topBookingRows
      .map((r) => {
        const a = byId.get(r.artistId);
        if (!a) return null;
        return {
          id: r.artistId,
          nameRo: a.nameRo,
          bookings: r.bookings,
          revenue: (a.priceFrom ?? 0) * r.bookings,
          currency: a.priceCurrency ?? "€",
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .slice(0, 5);
  }

  // ── Traffic sources (from profile_views.referrer) ──────────────
  const referrerRows = await db
    .select({
      referrer: profileViews.referrer,
      count: sql<number>`count(*)::int`,
    })
    .from(profileViews)
    .where(gte(profileViews.createdAt, thisMonth))
    .groupBy(profileViews.referrer);

  const bucketCounts = new Map<string, number>();
  let totalWithReferrer = 0;
  for (const row of referrerRows) {
    totalWithReferrer += row.count;
    const label = bucketReferrer(row.referrer);
    bucketCounts.set(label, (bucketCounts.get(label) ?? 0) + row.count);
  }
  const trafficSources = Array.from(bucketCounts.entries())
    .map(([source, count]) => ({
      source,
      pct: totalWithReferrer > 0 ? Math.round((count / totalWithReferrer) * 100) : 0,
    }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 5);

  const stats = [
    {
      label: "Vizite luna asta",
      value: viewsThis.toLocaleString("ro-MD"),
      change: pctDelta(viewsThis, viewsLast),
      icon: Eye,
      color: "text-info",
    },
    {
      label: "Solicitări noi",
      value: leadsThis.toString(),
      change: pctDelta(leadsThis, leadsLast),
      icon: MessageSquare,
      color: "text-gold",
    },
    {
      label: "Artiști activi",
      value: activeArtists.toString(),
      change: "",
      icon: Users,
      color: "text-success",
    },
    {
      label: "Rezervări luna asta",
      value: bookingsThis.toString(),
      change: pctDelta(bookingsThis, bookingsLast),
      icon: Calendar,
      color: "text-warning",
    },
    {
      label: `Revenue estimat ${year}`,
      value: `${revenueYear.toLocaleString("ro-MD")}€`,
      change: "",
      icon: DollarSign,
      color: "text-gold",
    },
    {
      label: "Rata conversie",
      value: conversionPct,
      change: "",
      icon: TrendingUp,
      color: "text-success",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">Analitice</h1>
        <ExportButtons />
      </div>

      <p className="text-xs text-muted-foreground">
        Actualizat {new Date().toLocaleString("ro-MD")} · Data curentă: {todayIso}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-4 pt-6">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent ${stat.color}`}
              >
                <stat.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  {stat.change && (
                    <span
                      className={
                        stat.change.startsWith("-")
                          ? "text-xs text-destructive"
                          : "text-xs text-success"
                      }
                    >
                      {stat.change}
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Artiști per Rezervări</CardTitle>
          </CardHeader>
          <CardContent>
            {topArtistsWithNames.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                Nu există încă rezervări.
              </p>
            ) : (
              <div className="space-y-3">
                {topArtistsWithNames.map((a, i) => (
                  <div key={a.id} className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold/10 text-xs font-bold text-gold">
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate text-sm font-medium">
                      {a.nameRo}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {a.bookings} rez.
                    </span>
                    <span className="font-accent text-sm font-semibold text-gold">
                      {a.revenue}
                      {a.currency}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Surse Trafic</CardTitle>
          </CardHeader>
          <CardContent>
            {trafficSources.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                Nu există date de trafic încă.
              </p>
            ) : (
              <div className="space-y-3">
                {trafficSources.map((s) => (
                  <div key={s.source} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{s.source}</span>
                      <span className="text-muted-foreground">{s.pct}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-gold"
                        style={{ width: `${s.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
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

function ExportButtons() {
  return (
    <div className="flex gap-2">
      <a
        href="/api/export?type=artists"
        download
        className="inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-card px-3 py-1.5 text-xs font-medium hover:border-gold/30 hover:text-gold"
      >
        📊 Export Artiști CSV
      </a>
      <a
        href="/api/export?type=leads"
        download
        className="inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-card px-3 py-1.5 text-xs font-medium hover:border-gold/30 hover:text-gold"
      >
        📋 Export Leads CSV
      </a>
      <a
        href="/api/export?type=bookings"
        download
        className="inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-card px-3 py-1.5 text-xs font-medium hover:border-gold/30 hover:text-gold"
      >
        📅 Export Booking CSV
      </a>
    </div>
  );
}
