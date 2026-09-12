import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { venueHallConflictGroupMembers, venueHallConflictGroups, venueHalls } from "@/lib/db/schema";
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
  const halls = await db.select({ id: venueHalls.id, venueId: venueHalls.venueId }).from(venueHalls);
  for (const hallId of parsed.data.hallIds) {
    const hall = halls.find((row) => row.id === hallId);
    if (!hall || hall.venueId !== venueId) return jsonError("Halls must belong to this venue", 400, { code: "SAME_VENUE_REQUIRED" });
  }
  let groupId = parsed.data.id;
  if (groupId) {
    const [existing] = await db.select().from(venueHallConflictGroups).where(eq(venueHallConflictGroups.id, groupId)).limit(1);
    if (!existing || existing.venueId !== venueId) return jsonError("Not found", 404);
    await db.update(venueHallConflictGroups).set({ name: parsed.data.name }).where(eq(venueHallConflictGroups.id, groupId));
    await db.delete(venueHallConflictGroupMembers).where(eq(venueHallConflictGroupMembers.groupId, groupId));
  } else {
    const [created] = await db.insert(venueHallConflictGroups).values({ venueId, name: parsed.data.name }).returning();
    groupId = created.id;
  }
  await db.insert(venueHallConflictGroupMembers).values(
    parsed.data.hallIds.map((hallId) => ({ groupId: groupId!, hallId, venueId })),
  );
  return NextResponse.json({ ok: true, id: groupId });
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
