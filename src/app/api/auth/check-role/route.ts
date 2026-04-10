import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, artists } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

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
      });
    }

    return NextResponse.json({ role: dbUser.role, onboardingComplete: true });
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
