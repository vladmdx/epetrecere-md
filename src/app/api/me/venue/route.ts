// M12 — Returns the venue owned by the currently signed-in user, or null.
// Powers the venue owner dashboard detection and profile editor load.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { venues, users, venueImages } from "@/lib/db/schema";

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
    return NextResponse.json({ venue: null });
  }

  const [venue] = await db
    .select()
    .from(venues)
    .where(eq(venues.userId, appUser.id))
    .limit(1);

  if (!venue) {
    return NextResponse.json({ venue: null });
  }

  const images = await db
    .select()
    .from(venueImages)
    .where(eq(venueImages.venueId, venue.id));

  return NextResponse.json({ venue: { ...venue, images } });
}
