// F-A8 — Vendor-side analytics surface.
//
// Mirrors the admin analytics page but scoped to the signed-in artist.
// Before this existed the only place an artist could see their own
// profile views / conversion numbers was the admin dashboard, which
// they can't reach. The underlying profile_views table has been
// collecting hashed sessions since M5, so the data is already there —
// this page just surfaces it.
//
// Venue owners are out of scope here: the venue nav doesn't link to
// this route, and the resolution logic redirects venue-only users back
// to /dashboard. Adding a venue flavour would be a straightforward
// clone of `getArtistAnalytics` against the venues / bookings tables.

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Eye,
  MessageSquare,
  CheckCircle2,
  TrendingUp,
  CalendarDays,
  Percent,
} from "lucide-react";
import { db } from "@/lib/db";
import { artists, users } from "@/lib/db/schema";
import { getArtistAnalytics } from "@/lib/db/queries/artist-analytics";

export const dynamic = "force-dynamic";

const ROMANIAN_MONTHS = [
  "Ian",
  "Feb",
  "Mar",
  "Apr",
  "Mai",
  "Iun",
  "Iul",
  "Aug",
  "Sep",
  "Oct",
  "Noi",
  "Dec",
];

export default async function VendorAnalyticsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in?redirect_url=/dashboard/analytics");

  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) redirect("/sign-in?redirect_url=/dashboard/analytics");

  const [artist] = await db
    .select({
      id: artists.id,
      nameRo: artists.nameRo,
    })
    .from(artists)
    .where(eq(artists.userId, appUser.id))
    .limit(1);

  if (!artist) {
    // Venue-only or mid-onboarding users: bounce home so they don't
    // stare at an empty "0 views" shell they can't do anything about.
    redirect("/dashboard");
  }

  const analytics = await getArtistAnalytics(artist.id);
  const year = new Date().getFullYear();
  const maxMonth = Math.max(...analytics.viewsByMonth, 1);

  const deltaSign = analytics.viewsDeltaPct >= 0 ? "+" : "";
  const conversionDisplay =
    analytics.conversionPct === null ? "—" : `${analytics.conversionPct}%`;

  const stats = [
    {
      label: "Vizite luna asta",
      value: analytics.viewsThisMonth.toLocaleString("ro-MD"),
      change: `${deltaSign}${analytics.viewsDeltaPct}%`,
      icon: Eye,
      color: "text-info",
    },
    {
      label: "Cereri luna asta",
      value: analytics.leadsThisMonth.toString(),
      change: "",
      icon: MessageSquare,
      color: "text-gold",
    },
    {
      label: "Rezervări confirmate",
      value: analytics.confirmedTotal.toString(),
      change: "",
      icon: CheckCircle2,
      color: "text-success",
    },
    {
      label: "Rata conversie",
      value: conversionDisplay,
      change: "",
      icon: Percent,
      color: "text-warning",
    },
    {
      label: `Zile rezervate ${year}`,
      value: analytics.daysBookedThisYear.toString(),
      change: "",
      icon: CalendarDays,
      color: "text-gold",
    },
    {
      label: "Trend luna vs luna",
      value: `${deltaSign}${analytics.viewsDeltaPct}%`,
      change: "",
      icon: TrendingUp,
      color:
        analytics.viewsDeltaPct >= 0 ? "text-success" : "text-destructive",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Analitice</h1>
        <p className="text-sm text-muted-foreground">
          {artist.nameRo} · date live din profilul tău public
        </p>
      </div>

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
        {/* Views chart — 12-month bar chart for the current year. */}
        <Card>
          <CardHeader>
            <CardTitle>Vizite profil — {year}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-40 items-end gap-1">
              {analytics.viewsByMonth.map((v, i) => (
                <div
                  key={i}
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  <span className="text-[10px] font-medium text-info">
                    {v || ""}
                  </span>
                  <div
                    className="w-full rounded-t bg-info/20"
                    style={{
                      height: `${Math.max(4, (v / maxMonth) * 100)}%`,
                    }}
                  >
                    <div
                      className="h-full rounded-t bg-info"
                      style={{ opacity: v ? 1 : 0.2 }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {ROMANIAN_MONTHS[i]}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Traffic sources — top 5 referrer buckets this month. */}
        <Card>
          <CardHeader>
            <CardTitle>Surse trafic (luna asta)</CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.traffic.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                Nu există încă vizite în luna curentă.
              </p>
            ) : (
              <div className="space-y-3">
                {analytics.traffic.map((s) => (
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
