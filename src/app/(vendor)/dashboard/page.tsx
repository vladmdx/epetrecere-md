// F-A1 — Artist dashboard home.
//
// Was a client component with four hardcoded "0" stat cards — zero
// signal for the artist and a trust killer on first login. It's now a
// server component that resolves the signed-in user → artist row and
// renders real numbers via `getArtistStats` (same helper the
// /api/me/artist/stats endpoint uses).
//
// Users who aren't signed in or don't have an artist row yet still see
// the dashboard shell (so venue-only vendors and mid-onboarding artists
// aren't locked out); they just get dashes in the stat cards.

import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BookOpen,
  Eye,
  Star,
  CheckCircle2,
  Building2,
} from "lucide-react";
import { db } from "@/lib/db";
import { artists, users } from "@/lib/db/schema";
import {
  getArtistStats,
  type ArtistStats,
} from "@/lib/db/queries/artist-stats";

export const dynamic = "force-dynamic";

async function loadStats(): Promise<ArtistStats | null> {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) return null;

  const [artist] = await db
    .select({ id: artists.id })
    .from(artists)
    .where(eq(artists.userId, appUser.id))
    .limit(1);
  if (!artist) return null;

  return getArtistStats(artist.id);
}

function formatRating(stats: ArtistStats | null): string {
  if (!stats || stats.ratingCount === 0 || stats.ratingAvg === null) return "—";
  return stats.ratingAvg.toFixed(1);
}

export default async function VendorDashboard() {
  const stats = await loadStats();

  const cards = [
    {
      label: "Cereri noi",
      value: stats ? String(stats.pendingRequests) : "—",
      icon: BookOpen,
      color: "text-gold",
    },
    {
      label: "Vizite profil (30 zile)",
      value: stats ? String(stats.profileViews30d) : "—",
      icon: Eye,
      color: "text-info",
    },
    {
      label: "Rating mediu",
      value: formatRating(stats),
      icon: Star,
      color: "text-warning",
    },
    {
      label: "Confirmate luna",
      value: stats ? String(stats.confirmedThisMonth) : "—",
      icon: CheckCircle2,
      color: "text-success",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Panoul Meu</h1>
        <p className="text-sm text-muted-foreground">
          Bine ai venit în panoul tău
        </p>
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

      {/* M12 — Call-to-action for users who want to list a venue. The actual
          gating happens inside venue-onboarding (redirects if already a
          venue owner). */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-gold/10 p-2 text-gold">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="font-heading font-bold">Ai o sală de evenimente?</p>
              <p className="text-sm text-muted-foreground">
                Publică-o pe ePetrecere.md și primește cereri de ofertă.
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/venue-onboarding"
            className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/5 px-4 py-2 text-sm font-medium text-gold hover:bg-gold/10"
          >
            Înregistrează sala
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
