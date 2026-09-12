// M12 / ADR 0028 — Returns the venue the signed-in user administers.
// Powers venue owner dashboard detection and the profile editor load.

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { venues, venueImages } from "@/lib/db/schema";
import { getCurrentAppUser, resolveSelectedVenue } from "@/lib/venue-access";
import { isMultiHallEnabled } from "@/lib/feature-flags";

export async function GET(req: Request) {
  const appUser = await getCurrentAppUser();
  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const multiHall = isMultiHallEnabled();

  // Explicit selection — never orderBy + limit(1) "first venue". An optional
  // ?venueId= lets a multi-venue account address a specific location; when
  // several are accessible and none is requested we return a typed
  // VENUE_REQUIRED result instead of silently guessing.
  const url = new URL(req.url);
  const requested = url.searchParams.get("venueId");
  const requestedId = requested != null ? Number(requested) : undefined;

  const selection = await resolveSelectedVenue(appUser.id, requestedId);
  if (!selection.ok) {
    if (selection.reason === "ambiguous") {
      return NextResponse.json({
        venue: null,
        code: "VENUE_REQUIRED",
        reason: "AMBIGUOUS",
        venueIds: selection.venueIds,
        multiHall,
      });
    }
    if (selection.reason === "forbidden") {
      return NextResponse.json({ error: "Forbidden", multiHall }, { status: 403 });
    }
    return NextResponse.json({ venue: null, multiHall }); // reason: "none"
  }

  const [venue] = await db
    .select()
    .from(venues)
    .where(eq(venues.id, selection.venueId))
    .limit(1);

  if (!venue) {
    return NextResponse.json({ venue: null, multiHall });
  }

  const images = await db
    .select()
    .from(venueImages)
    .where(eq(venueImages.venueId, venue.id));

  return NextResponse.json({ venue: { ...venue, images }, multiHall });
}
