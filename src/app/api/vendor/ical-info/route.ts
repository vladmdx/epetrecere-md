import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { artists, users } from "@/lib/db/schema";
import { getIcalToken } from "@/lib/calendar/ical-token";

// M5 — GET /api/vendor/ical-info
//
// Returns the signed-in artist's personal iCal subscription URL. The
// token is a deterministic HMAC so we don't need to store anything — same
// URL is returned on every call.

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
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const [artist] = await db
    .select({ id: artists.id, nameRo: artists.nameRo })
    .from(artists)
    .where(eq(artists.userId, appUser.id))
    .limit(1);
  if (!artist) {
    return NextResponse.json({ error: "Artist profile not found" }, { status: 404 });
  }

  const token = getIcalToken(artist.id);
  const path = `/api/calendar/ical/${artist.id}/${token}.ics`;

  return NextResponse.json({
    artistId: artist.id,
    artistName: artist.nameRo,
    path,
    // Full URL is assembled client-side so we don't hardcode the host
  });
}
