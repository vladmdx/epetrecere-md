import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, artists, venues } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ role: "user" });

  // Check our users table first
  const [dbUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (dbUser) {
    // Venue ownership is separate from role — a user can own a venue without
    // being role=artist.
    const [venue] = await db
      .select({ id: venues.id, slug: venues.slug, isActive: venues.isActive })
      .from(venues)
      .where(eq(venues.userId, dbUser.id))
      .limit(1);

    // Check if artist with completed onboarding
    if (dbUser.role === "artist") {
      const [artist] = await db
        .select({ id: artists.id, slug: artists.slug, isActive: artists.isActive })
        .from(artists)
        .where(eq(artists.userId, dbUser.id))
        .limit(1);

      return NextResponse.json({
        role: "artist",
        onboardingComplete: !!artist,
        artistApproved: artist?.isActive ?? false,
        artistId: artist?.id ?? null,
        artistSlug: artist?.slug ?? null,
        venueId: venue?.id ?? null,
        venueSlug: venue?.slug ?? null,
        venueApproved: venue?.isActive ?? false,
      });
    }

    return NextResponse.json({
      role: venue ? "venue" : dbUser.role,
      onboardingComplete: true,
      venueId: venue?.id ?? null,
      venueSlug: venue?.slug ?? null,
      venueApproved: venue?.isActive ?? false,
    });
  }

  // Check if email matches any artist in DB (for linking)
  const [matchedArtist] = await db
    .select({ id: artists.id })
    .from(artists)
    .where(eq(artists.email, email))
    .limit(1);

  if (matchedArtist) {
    return NextResponse.json({ role: "artist", onboardingComplete: true });
  }

  // Default: client
  return NextResponse.json({ role: "user", onboardingComplete: true });
}
