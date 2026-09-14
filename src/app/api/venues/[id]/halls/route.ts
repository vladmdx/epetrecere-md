import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { venueHalls, venueMenuSets } from "@/lib/db/schema";
import { getCurrentAppUser, requireVenueCapability } from "@/lib/venue-access";
import { jsonAccess, jsonError } from "@/lib/http/json";
import { createHallDraft } from "@/lib/partner/hall-writes";
import { jsonIfMultiHallDisabled } from "@/lib/partner/multi-hall-gate";

type VenueCtx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: VenueCtx) {
  const venueId = Number((await ctx.params).id);
  const access = await requireVenueCapability(venueId, "view_private");
  if (!access.ok) return jsonAccess(access);
  const [halls, menuSets] = await Promise.all([
    db.select().from(venueHalls)
      .where(eq(venueHalls.venueId, venueId))
      .orderBy(asc(venueHalls.sortOrder), asc(venueHalls.id)),
    db.select({
      id: venueMenuSets.id,
      nameRo: venueMenuSets.nameRo,
      nameRu: venueMenuSets.nameRu,
      nameEn: venueMenuSets.nameEn,
      isDefault: venueMenuSets.isDefault,
    }).from(venueMenuSets)
      .where(eq(venueMenuSets.venueId, venueId))
      .orderBy(asc(venueMenuSets.sortOrder), asc(venueMenuSets.id)),
  ]);
  return NextResponse.json({ halls, menuSets });
}

export async function POST(req: Request, ctx: VenueCtx) {
  const venueId = Number((await ctx.params).id);
  const blocked = jsonIfMultiHallDisabled();
  if (blocked) return blocked;
  const actor = await getCurrentAppUser();
  if (!actor) return jsonError("Unauthorized", 401, { code: "UNAUTHORIZED" });
  const body = await req.json().catch(() => null);
  const saved = await createHallDraft(actor.id, { ...(body ?? {}), venueId });
  if (!saved.ok) return jsonError(saved.error, saved.status ?? 400, saved);
  return NextResponse.json({ hall: saved.hall, replayed: saved.replayed === true });
}
