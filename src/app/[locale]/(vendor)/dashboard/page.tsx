// Partner dashboard — entity-aware home.
//
// Resolution order: artist first (the dominant flow on ePetrecere.md),
// venue fallback (redirected to /dashboard/sala for the venue-specific
// layout), client fallback (redirected to /cabinet). Artists who
// completed the role pick but haven't onboarded yet stay here on a
// pending shell so the rest of the app remains consistent.
//
// All data loads server-side in parallel — stats + profile snapshot +
// next event + recent requests — and is handed to DashboardClient
// for the redesigned UI (hero card, 4 stat tiles with deltas, next
// event card with cover image, recent requests list, bottom shortcuts).

import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { artists, users, venues } from "@/lib/db/schema";
import { getArtistStats } from "@/lib/db/queries/artist-stats";
import {
  getArtistNextEvent,
  getArtistRecentRequests,
  getArtistProfileSnapshot,
} from "@/lib/db/queries/artist-dashboard";
import { DashboardClient } from "@/components/vendor/dashboard-client";
import { t } from "@/i18n";
import { DEFAULT_LOCALE, isLocale, type AppLocale } from "@/lib/i18n/routing";

export const dynamic = "force-dynamic";

export default async function VendorDashboard({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  // Route the user to the right shell:
  //   has venue, no artist → /dashboard/sala
  //   role=user, no records → /cabinet (they're a client)
  //   artist or role=artist (pending) → stay here
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return null;
  }

  const [appUser] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) return null;

  const [artist] = await db
    .select({ id: artists.id })
    .from(artists)
    .where(eq(artists.userId, appUser.id))
    .limit(1);

  if (!artist) {
    const [venue] = await db
      .select({ id: venues.id })
      .from(venues)
      .where(eq(venues.userId, appUser.id))
      .limit(1);
    if (venue) {
      redirect("/dashboard/sala");
    }
    // No vendor record at all — artists mid-onboarding stay; everyone
    // else goes back to the client cabinet.
    if (appUser.role !== "artist") {
      redirect("/cabinet");
    }
    // Pending shell for new artists who haven't filled the profile yet.
    return <ArtistPendingShell locale={locale} />;
  }

  // Fan-out all four reads in parallel. The dashboard is the first paint
  // a partner sees after login so p95 latency matters.
  const [profile, stats, nextEvent, recentRequests] = await Promise.all([
    getArtistProfileSnapshot(artist.id),
    getArtistStats(artist.id),
    getArtistNextEvent(artist.id),
    getArtistRecentRequests(artist.id, 3),
  ]);

  if (!profile) return <ArtistPendingShell locale={locale} />;

  return (
    <DashboardClient
      profile={profile}
      stats={stats}
      nextEvent={nextEvent}
      recentRequests={recentRequests}
    />
  );
}

function ArtistPendingShell({ locale }: { locale: AppLocale }) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="font-heading text-2xl font-bold sm:text-3xl">
          {t("vendor.dashboard", locale)}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("vendor.pending.subtitle", locale)}
        </p>
      </header>

      <Card className="border-gold/40 bg-gold/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="flex items-center gap-3">
            <Sparkles className="h-6 w-6 shrink-0 text-gold" />
            <div>
              <p className="font-heading font-bold">
                {t("vendor.pending.title", locale)}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("vendor.pending.hint", locale)}
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/onboarding"
            className="group inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-medium text-[#0D0D0D] transition-all duration-200 hover:bg-gold-dark hover:shadow-[0_4px_20px_rgba(201,168,76,0.35)] active:scale-95"
          >
            {t("vendor.pending.cta", locale)}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
