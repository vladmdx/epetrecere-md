// F-A1 — Stats for the artist dashboard home.
//
// Returns the four cards shown on `/dashboard` for the signed-in artist:
// pending booking requests, profile views in the last 30 days, rating
// rollup, and "confirmed this month" (our "Venituri luna" proxy until we
// start persisting agreed price per request).
//
// Auth: signed in + linked to an artist row. Non-artist users get an
// empty 200 response so the vendor shell can still render for users who
// are mid-onboarding instead of hard-failing their first dashboard view.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { artists, users } from "@/lib/db/schema";
import { getArtistStats } from "@/lib/db/queries/artist-stats";

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  if (!appUser) {
    return NextResponse.json({ stats: null });
  }

  const [artist] = await db
    .select({ id: artists.id })
    .from(artists)
    .where(eq(artists.userId, appUser.id))
    .limit(1);

  if (!artist) {
    return NextResponse.json({ stats: null });
  }

  const stats = await getArtistStats(artist.id);
  return NextResponse.json({ stats });
}
