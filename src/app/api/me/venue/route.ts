// M12 — Returns the venue owned by the currently signed-in user, or null.
// Powers the venue owner dashboard detection and profile editor load.

import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { venues, venueImages } from "@/lib/db/schema";
import { getCurrentAppUser, listAccessibleVenueIds } from "@/lib/venue-access";

export async function GET() {
  const appUser = await getCurrentAppUser();
  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ADR 0028 — venues reachable via org membership (legacy owner chain
  // included). Single-venue accounts keep returning their one venue.
  const venueIds = await listAccessibleVenueIds(appUser.id);
  if (venueIds.length === 0) {
    return NextResponse.json({ venue: null });
  }

  const [venue] = await db
    .select()
    .from(venues)
    .where(inArray(venues.id, venueIds))
    .orderBy(venues.id)
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
