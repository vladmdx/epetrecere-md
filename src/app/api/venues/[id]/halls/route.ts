import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { venueHalls } from "@/lib/db/schema";
import { requireVenueCapability } from "@/lib/venue-access";
import { jsonAccess, jsonError } from "@/lib/http/json";
import { saveHallDraft } from "@/lib/partner/onboarding";
import { jsonIfMultiHallDisabled } from "@/lib/partner/multi-hall-gate";

type VenueCtx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: VenueCtx) {
  const venueId = Number((await ctx.params).id);
  const access = await requireVenueCapability(venueId, "view_private");
  if (!access.ok) return jsonAccess(access);
  const halls = await db.select().from(venueHalls).where(eq(venueHalls.venueId, venueId)).orderBy(asc(venueHalls.sortOrder), asc(venueHalls.id));
  return NextResponse.json({ halls });
}

export async function POST(req: Request, ctx: VenueCtx) {
  const venueId = Number((await ctx.params).id);
  const access = await requireVenueCapability(venueId, "manage_halls");
  if (!access.ok) return jsonAccess(access);
  const blocked = jsonIfMultiHallDisabled();
  if (blocked) return blocked;
  const body = await req.json().catch(() => null);
  const saved = await saveHallDraft({ ...body, venueId });
  if (!saved.ok) return jsonError(saved.error, saved.status ?? 400, saved);
  return NextResponse.json({ hall: saved.hall });
}
