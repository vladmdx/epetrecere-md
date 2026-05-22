// GET /api/v1/me/artist/dashboard — single endpoint that bundles all
// the data the mobile partner dashboard needs.
//
// Why not 4 separate endpoints? Mobile networks are slower than wifi
// and 4 round-trips adds 800ms+ to TTI. One request reduces it to a
// single hop. The web version uses Promise.all inside the server
// component which lives in the same Vercel region — that's already
// optimal. The mobile client doesn't have that locality.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { artists, users } from "@/lib/db/schema";
import { getArtistStats } from "@/lib/db/queries/artist-stats";
import {
  getArtistNextEvent,
  getArtistRecentRequests,
  getArtistProfileSnapshot,
} from "@/lib/db/queries/artist-dashboard";

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const [artist] = await db
    .select({ id: artists.id })
    .from(artists)
    .where(eq(artists.userId, appUser.id))
    .limit(1);
  if (!artist) {
    return NextResponse.json({ error: "no_artist_profile" }, { status: 404 });
  }

  // Fan-out — same parallel pattern the web dashboard uses.
  const [profile, stats, nextEvent, recentRequests] = await Promise.all([
    getArtistProfileSnapshot(artist.id),
    getArtistStats(artist.id),
    getArtistNextEvent(artist.id),
    getArtistRecentRequests(artist.id, 3),
  ]);

  return NextResponse.json({
    profile,
    stats,
    nextEvent,
    recentRequests,
  });
}
