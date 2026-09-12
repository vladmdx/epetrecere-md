// F-S1 / M12 / ADR 0028 — Stats for the venue dashboard home. Returns the stat
// object for the signed-in user's venue (resolved via the membership chain), or
// `{ stats: null }` when they administer none. Anonymous → 401.

import { NextResponse } from "next/server";
import { getVenueStats } from "@/lib/db/queries/venue-stats";
import { getCurrentAppUser, getPrimaryAccessibleVenueId } from "@/lib/venue-access";

export async function GET() {
  const appUser = await getCurrentAppUser();
  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const venueId = await getPrimaryAccessibleVenueId(appUser.id);
  if (!venueId) {
    return NextResponse.json({ stats: null });
  }

  const stats = await getVenueStats(venueId);
  return NextResponse.json({ stats });
}
