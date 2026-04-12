// F-S1 / M12 — Stats for the venue dashboard home, the venue-side
// counterpart of /api/me/artist/stats. Returns the 5-field stat object
// from getVenueStats for the signed-in user's venue, or `{ stats: null }`
// if they don't own one. Anonymous → 401.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, venues } from "@/lib/db/schema";
import { getVenueStats } from "@/lib/db/queries/venue-stats";

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

  const [venue] = await db
    .select({ id: venues.id })
    .from(venues)
    .where(eq(venues.userId, appUser.id))
    .limit(1);

  if (!venue) {
    return NextResponse.json({ stats: null });
  }

  const stats = await getVenueStats(venue.id);
  return NextResponse.json({ stats });
}
