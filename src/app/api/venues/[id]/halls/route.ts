import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { venueHalls, venueHallSeatingOptions, venueImages } from "@/lib/db/schema";
import { requireHallAccess, requireVenueCapability } from "@/lib/venue-access";
import { jsonAccess, jsonError } from "@/lib/http/json";
import { archiveHall, saveHallDraft } from "@/lib/partner/onboarding";

type VenueCtx = { params: Promise<{ id: string }> };
type HallCtx = { params: Promise<{ id: string; hallId: string }> };

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
  const body = await req.json().catch(() => null);
  const saved = await saveHallDraft({ ...body, venueId });
  if (!saved.ok) return jsonError(saved.error, saved.status ?? 400, saved);
  return NextResponse.json({ hall: saved.hall });
}

export async function hallGET(_req: Request, ctx: HallCtx) {
  const { id, hallId: hallIdRaw } = await ctx.params;
  const hallId = Number(hallIdRaw);
  const access = await requireHallAccess(hallId, "staff");
  if (!access.ok) return jsonAccess(access);
  if (access.venueId !== Number(id)) return jsonError("Forbidden", 403);
  const [hall] = await db.select().from(venueHalls).where(eq(venueHalls.id, hallId)).limit(1);
  if (!hall) return jsonError("Not found", 404);
  const seating = await db.select().from(venueHallSeatingOptions).where(eq(venueHallSeatingOptions.hallId, hallId));
  const images = await db.select().from(venueImages).where(eq(venueImages.hallId, hallId));
  return NextResponse.json({ hall, seating, images });
}

export async function hallPATCH(req: Request, ctx: HallCtx) {
  const { id, hallId: hallIdRaw } = await ctx.params;
  const hallId = Number(hallIdRaw);
  const access = await requireHallAccess(hallId, "admin");
  if (!access.ok) return jsonAccess(access);
  if (access.venueId !== Number(id)) return jsonError("Forbidden", 403);
  const body = await req.json().catch(() => null);
  const saved = await saveHallDraft({ ...body, venueId: access.venueId, hallId });
  if (!saved.ok) return jsonError(saved.error, saved.status ?? 400, saved);
  return NextResponse.json({ hall: saved.hall });
}

export async function hallDELETE(_req: Request, ctx: HallCtx) {
  const { id, hallId: hallIdRaw } = await ctx.params;
  const hallId = Number(hallIdRaw);
  const access = await requireHallAccess(hallId, "admin");
  if (!access.ok) return jsonAccess(access);
  if (access.venueId !== Number(id)) return jsonError("Forbidden", 403);
  const result = await archiveHall(hallId);
  if (!result.ok) return jsonError(result.error ?? "Not found", result.status ?? 404);
  return NextResponse.json({ ok: true, archived: true });
}
