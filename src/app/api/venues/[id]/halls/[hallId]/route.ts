import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  venueHalls,
  venueHallMenuSets,
  venueHallSeatingOptions,
  venueImages,
  venueMenuSets,
} from "@/lib/db/schema";
import { getCurrentAppUser, requireHallAccess } from "@/lib/venue-access";
import { jsonAccess, jsonError } from "@/lib/http/json";
import { archiveHall } from "@/lib/partner/onboarding";
import { patchHallDraft } from "@/lib/partner/hall-writes";
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
  const [seating, images, menuLinks, menuSets] = await Promise.all([
    db.select().from(venueHallSeatingOptions)
      .where(eq(venueHallSeatingOptions.hallId, hallId))
      .orderBy(asc(venueHallSeatingOptions.sortOrder), asc(venueHallSeatingOptions.id)),
    db.select().from(venueImages)
      .where(eq(venueImages.hallId, hallId))
      .orderBy(asc(venueImages.sortOrder), asc(venueImages.id)),
    db.select({ menuSetId: venueHallMenuSets.menuSetId })
      .from(venueHallMenuSets)
      .where(eq(venueHallMenuSets.hallId, hallId))
      .orderBy(asc(venueHallMenuSets.menuSetId)),
    db.select({
      id: venueMenuSets.id,
      nameRo: venueMenuSets.nameRo,
      nameRu: venueMenuSets.nameRu,
      nameEn: venueMenuSets.nameEn,
      isDefault: venueMenuSets.isDefault,
    }).from(venueMenuSets)
      .where(eq(venueMenuSets.venueId, access.venueId))
      .orderBy(asc(venueMenuSets.sortOrder), asc(venueMenuSets.id)),
  ]);
  return NextResponse.json({
    hall,
    seating,
    images,
    menuSetIds: menuLinks.map((link) => link.menuSetId),
    inheritMenu: menuLinks.length === 0,
    menuSets,
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id, hallId: hallIdRaw } = await ctx.params;
  const venueId = Number(id);
  const hallId = Number(hallIdRaw);
  const blocked = jsonIfMultiHallDisabled();
  if (blocked) return blocked;
  const actor = await getCurrentAppUser();
  if (!actor) return jsonError("Unauthorized", 401, { code: "UNAUTHORIZED" });
  const body = await req.json().catch(() => null);
  const saved = await patchHallDraft(actor.id, venueId, hallId, body);
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
  const result = await archiveHall(access.user.id, hallId);
  if (!result.ok) return jsonError(result.error ?? "Not found", result.status ?? 404, { code: result.code });
  return NextResponse.json({ ok: true, archived: true });
}
