import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { venueHalls, venueHallSeatingOptions, venueImages } from "@/lib/db/schema";
import { requireHallAccess } from "@/lib/venue-access";
import { jsonAccess, jsonError } from "@/lib/http/json";
import { archiveHall, saveHallDraft } from "@/lib/partner/onboarding";
import { jsonIfMultiHallDisabled } from "@/lib/partner/multi-hall-gate";

type Ctx = { params: Promise<{ id: string; hallId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
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

export async function PATCH(req: Request, ctx: Ctx) {
  const { id, hallId: hallIdRaw } = await ctx.params;
  const hallId = Number(hallIdRaw);
  const access = await requireHallAccess(hallId, "admin");
  if (!access.ok) return jsonAccess(access);
  const blocked = jsonIfMultiHallDisabled();
  if (blocked) return blocked;
  if (access.venueId !== Number(id)) return jsonError("Forbidden", 403);
  const body = await req.json().catch(() => null);
  const saved = await saveHallDraft({ ...body, venueId: access.venueId, hallId });
  if (!saved.ok) return jsonError(saved.error, saved.status ?? 400, saved);
  return NextResponse.json({ hall: saved.hall });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, hallId: hallIdRaw } = await ctx.params;
  const hallId = Number(hallIdRaw);
  const access = await requireHallAccess(hallId, "admin");
  if (!access.ok) return jsonAccess(access);
  const blocked = jsonIfMultiHallDisabled();
  if (blocked) return blocked;
  if (access.venueId !== Number(id)) return jsonError("Forbidden", 403);
  const result = await archiveHall(hallId);
  if (!result.ok) return jsonError(result.error ?? "Not found", result.status ?? 404, { code: result.code });
  return NextResponse.json({ ok: true, archived: true });
}
