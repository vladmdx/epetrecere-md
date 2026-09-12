import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { venueHallConflictGroupMembers, venueHallConflictGroups } from "@/lib/db/schema";
import { requireVenueCapability } from "@/lib/venue-access";
import { jsonAccess, jsonError } from "@/lib/http/json";
import { jsonIfMultiHallDisabled } from "@/lib/partner/multi-hall-gate";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const venueId = Number((await ctx.params).id);
  const access = await requireVenueCapability(venueId, "manage_calendar");
  if (!access.ok) return jsonAccess(access);
  const groups = await db.select().from(venueHallConflictGroups).where(eq(venueHallConflictGroups.venueId, venueId));
  const members = groups.length
    ? await db.select().from(venueHallConflictGroupMembers).where(
        inArray(venueHallConflictGroupMembers.groupId, groups.map((group) => group.id)),
      )
    : [];
  return NextResponse.json({
    groups: groups.map((group) => ({
      ...group,
      hallIds: members.filter((member) => member.groupId === group.id).map((member) => member.hallId),
    })),
  });
}

const saveSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(2).max(120),
  hallIds: z.array(z.number().int().positive()).min(2),
});

export async function POST(req: Request, ctx: Ctx) {
  const venueId = Number((await ctx.params).id);
  const access = await requireVenueCapability(venueId, "manage_calendar");
  if (!access.ok) return jsonAccess(access);
  const blocked = jsonIfMultiHallDisabled();
  if (blocked) return blocked;
  const parsed = saveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Validation failed", 400, { details: parsed.error.issues });
  const { saveVenueConflictGroup } = await import("@/lib/booking/conflict-groups");
  const saved = await saveVenueConflictGroup({
    venueId,
    id: parsed.data.id,
    name: parsed.data.name,
    hallIds: parsed.data.hallIds,
  });
  if (!saved.ok) return jsonError(saved.error, saved.status, { code: saved.code });
  return NextResponse.json({ ok: true, id: saved.id });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const venueId = Number((await ctx.params).id);
  const access = await requireVenueCapability(venueId, "manage_calendar");
  if (!access.ok) return jsonAccess(access);
  const blocked = jsonIfMultiHallDisabled();
  if (blocked) return blocked;
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return jsonError("id required", 400);
  const [existing] = await db.select().from(venueHallConflictGroups).where(eq(venueHallConflictGroups.id, id)).limit(1);
  if (!existing || existing.venueId !== venueId) return jsonError("Not found", 404);
  await db.delete(venueHallConflictGroups).where(eq(venueHallConflictGroups.id, id));
  return NextResponse.json({ ok: true });
}
