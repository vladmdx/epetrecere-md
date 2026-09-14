// F-S1 / M12 / ADR 0028 — Stats for the venue dashboard home. Returns the stat
// object for the signed-in user's venue (resolved via the membership chain), or
// `{ stats: null }` when they administer none. Anonymous → 401.

import { NextResponse } from "next/server";
import { getVenueStats } from "@/lib/db/queries/venue-stats";
import {
  authorizeVenueCapability,
  getCurrentAppUser,
  resolveSelectedVenue,
} from "@/lib/venue-access";

export async function GET(req: Request) {
  const appUser = await getCurrentAppUser();
  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // CP3 #2 — explicit selection, no implicit "first venue".
  const requested = new URL(req.url).searchParams.get("venueId");
  const selection = await resolveSelectedVenue(
    appUser.id,
    requested != null ? Number(requested) : undefined,
  );
  if (!selection.ok) {
    if (selection.reason === "ambiguous") {
      return NextResponse.json({ stats: null, code: "VENUE_REQUIRED", venueIds: selection.venueIds });
    }
    if (selection.reason === "forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ stats: null });
  }

  const financialAccess = await authorizeVenueCapability(
    appUser,
    selection.venueId,
    "manage_financials",
  );
  const canManageFinancials = financialAccess.ok;
  const stats = await getVenueStats(selection.venueId, new Date(), {
    includeFinancials: canManageFinancials,
  });
  return NextResponse.json({ stats, canManageFinancials }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
