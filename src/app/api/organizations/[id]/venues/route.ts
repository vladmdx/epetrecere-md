import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { venueHalls, venues } from "@/lib/db/schema";
import { getCurrentAppUser, requireOrganizationCapability } from "@/lib/venue-access";
import { jsonAccess, jsonError } from "@/lib/http/json";
import { saveVenueDraft } from "@/lib/partner/onboarding";
import { jsonIfMultiHallDisabled } from "@/lib/partner/multi-hall-gate";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const organizationId = Number((await ctx.params).id);
  const access = await requireOrganizationCapability(organizationId, "view_organization");
  if (!access.ok) return jsonAccess(access);
  const rows = await db.select().from(venues).where(eq(venues.organizationId, organizationId));
  return NextResponse.json({ venues: rows });
}

export async function POST(req: Request, ctx: Ctx) {
  const organizationId = Number((await ctx.params).id);
  const access = await requireOrganizationCapability(organizationId, "manage_venues");
  if (!access.ok) return jsonAccess(access);
  const blocked = jsonIfMultiHallDisabled();
  if (blocked) return blocked;
  const user = await getCurrentAppUser();
  if (!user) return jsonError("Unauthorized", 401);
  const body = await req.json().catch(() => null);
  const saved = await saveVenueDraft(user, { ...body, organizationId });
  if (!saved.ok) return jsonError(saved.error, saved.status ?? 400, saved);
  // Return authoritative Hall statuses after the venue transaction commits.
  // If the first attachment response was lost, an identical retry must still
  // tell the client that its pending legacy Hall was reopened to draft.
  const halls = await db
    .select({ id: venueHalls.id, status: venueHalls.status })
    .from(venueHalls)
    .where(eq(venueHalls.venueId, saved.venue.id));
  return NextResponse.json({
    venue: saved.venue,
    halls,
  });
}
