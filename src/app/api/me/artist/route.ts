// F-S6 — Returns the artist owned by the currently signed-in user, or null.
// Mirrors /api/me/venue. Powers entity-agnostic dashboard pages like the
// calendar, which needs to know whether to load artist or venue data.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { artists, users } from "@/lib/db/schema";

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
    return NextResponse.json({ artist: null });
  }

  const [artist] = await db
    .select({
      id: artists.id,
      slug: artists.slug,
      nameRo: artists.nameRo,
      isActive: artists.isActive,
    })
    .from(artists)
    .where(eq(artists.userId, appUser.id))
    .limit(1);

  if (!artist) {
    return NextResponse.json({ artist: null });
  }

  return NextResponse.json({ artist });
}
