// F-A1 / F-S1 — Vendor dashboard home, entity-aware.
//
// Was a client component with four hardcoded "0" stat cards — zero
// signal for the artist and a trust killer on first login. Then F-A1
// wired the artist flow via getArtistStats. F-S1 completes the picture
// for venue owners so they don't see a row of dashes either.
//
// Resolution order: try artist first (most common), fall back to venue.
// Users who own both still land on the artist view — they can reach the
// venue pages via direct link. Users with neither still see the shell
// with dashes, so mid-onboarding flows aren't locked out.

import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BookOpen,
  Eye,
  Star,
  CheckCircle2,
} from "lucide-react";
import { db } from "@/lib/db";
import { artists, users, venues } from "@/lib/db/schema";
import {
  getArtistStats,
  type ArtistStats,
} from "@/lib/db/queries/artist-stats";
import {
  getVenueStats,
  type VenueStats,
} from "@/lib/db/queries/venue-stats";

export const dynamic = "force-dynamic";

type Loaded =
  | { kind: "artist"; stats: ArtistStats }
  | { kind: "venue"; stats: VenueStats; venueName: string }
  | null;

async function loadStats(): Promise<Loaded> {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) return null;

  // Artist first — the dominant flow on ePetrecere.md.
  const [artist] = await db
    .select({ id: artists.id })
    .from(artists)
    .where(eq(artists.userId, appUser.id))
    .limit(1);
  if (artist) {
    return { kind: "artist", stats: await getArtistStats(artist.id) };
  }

  // Venue fallback — mirrors the artist path so the home card grid
  // works for venue-only owners too.
  const [venue] = await db
    .select({ id: venues.id, nameRo: venues.nameRo })
    .from(venues)
    .where(eq(venues.userId, appUser.id))
    .limit(1);
  if (venue) {
    return {
      kind: "venue",
      stats: await getVenueStats(venue.id),
      venueName: venue.nameRo,
    };
  }

  return null;
}

function formatRating(ratingAvg: number | null, ratingCount: number): string {
  if (ratingCount === 0 || ratingAvg === null) return "—";
  return ratingAvg.toFixed(1);
}

export default async function VendorDashboard() {
  const loaded = await loadStats();

  // Same four slots for both entity types — different data sources.
  const cards = (() => {
    if (loaded?.kind === "artist") {
      const s = loaded.stats;
      return [
        { label: "Cereri noi", value: String(s.pendingRequests), icon: BookOpen, color: "text-gold" },
        { label: "Vizite profil (30 zile)", value: String(s.profileViews30d), icon: Eye, color: "text-info" },
        { label: "Rating mediu", value: formatRating(s.ratingAvg, s.ratingCount), icon: Star, color: "text-warning" },
        { label: "Confirmate luna", value: String(s.confirmedThisMonth), icon: CheckCircle2, color: "text-success" },
      ];
    }
    if (loaded?.kind === "venue") {
      const s = loaded.stats;
      return [
        { label: "Rezervări pending", value: String(s.pendingBookings), icon: BookOpen, color: "text-gold" },
        { label: "Vizite profil (30 zile)", value: String(s.profileViews30d), icon: Eye, color: "text-info" },
        { label: "Rating mediu", value: formatRating(s.ratingAvg, s.ratingCount), icon: Star, color: "text-warning" },
        { label: "Rezervări luna", value: String(s.bookingsThisMonth), icon: CheckCircle2, color: "text-success" },
      ];
    }
    // Unresolved entity — show dashes so the shell still renders.
    return [
      { label: "Cereri noi", value: "—", icon: BookOpen, color: "text-gold" },
      { label: "Vizite profil (30 zile)", value: "—", icon: Eye, color: "text-info" },
      { label: "Rating mediu", value: "—", icon: Star, color: "text-warning" },
      { label: "Confirmate luna", value: "—", icon: CheckCircle2, color: "text-success" },
    ];
  })();

  const subtitle =
    loaded?.kind === "venue"
      ? loaded.venueName
      : "Bine ai venit în panoul tău";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Panoul Meu</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

    </div>
  );
}
