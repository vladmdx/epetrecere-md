import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { venueScheduleBlocks } from "@/lib/db/schema";
import { requireVenueCapability } from "@/lib/venue-access";
import { jsonAccess, jsonError } from "@/lib/http/json";
import { jsonIfMultiHallDisabled } from "@/lib/partner/multi-hall-gate";
import { createVenueScheduleBlock, deleteVenueScheduleBlocks } from "@/lib/booking/venue-schedule-write";
import { z } from "zod/v4";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const venueId = Number((await ctx.params).id);
  const access = await requireVenueCapability(venueId, "manage_calendar");
  if (!access.ok) return jsonAccess(access);
  const hallId = Number(new URL(req.url).searchParams.get("hallId") ?? "") || null;
  const rows = await db.select().from(venueScheduleBlocks).where(eq(venueScheduleBlocks.venueId, venueId));
  return NextResponse.json({
    blocks: hallId ? rows.filter((row) => row.hallId == null || row.hallId === hallId) : rows,
  });
}

const createSchema = z.object({
  hallId: z.number().int().positive().nullable().optional(),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  timezone: z.string().optional(),
  kind: z.enum(["maintenance", "sanitary_day", "private_event", "manual", "external_calendar"]).default("manual"),
  reason: z.string().max(500).optional().nullable(),
  wholeVenue: z.boolean().optional(),
});

export async function POST(req: Request, ctx: Ctx) {
  const venueId = Number((await ctx.params).id);
  const access = await requireVenueCapability(venueId, "manage_calendar");
  if (!access.ok) return jsonAccess(access);
  const blocked = jsonIfMultiHallDisabled();
  if (blocked) return blocked;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Validation failed", 400, { details: parsed.error.issues });
  const created = await createVenueScheduleBlock({
    venueId,
    hallId: parsed.data.hallId,
    wholeVenue: parsed.data.wholeVenue,
    eventDate: parsed.data.eventDate,
    startTime: parsed.data.startTime,
    endTime: parsed.data.endTime,
    startsAt: parsed.data.startsAt,
    endsAt: parsed.data.endsAt,
    timezone: parsed.data.timezone,
    kind: parsed.data.kind,
    reason: parsed.data.reason,
    createdBy: access.user.id,
  });
  if (!created.ok) {
    return jsonError(created.error, created.status, {
      code: created.code,
      message:
        created.code === "AFFECTED_BOOKINGS"
          ? "Blocarea se suprapune cu rezervări existente. Confirmă explicit acțiunea după ce le anulezi sau le muți."
          : created.error,
    });
  }
  return NextResponse.json({ block: created.block });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const venueId = Number((await ctx.params).id);
  const access = await requireVenueCapability(venueId, "manage_calendar");
  if (!access.ok) return jsonAccess(access);
  const blocked = jsonIfMultiHallDisabled();
  if (blocked) return blocked;
  const url = new URL(req.url);
  const id = Number(url.searchParams.get("id") ?? "") || undefined;
  const hallIdRaw = url.searchParams.get("hallId");
  const hallId = hallIdRaw ? Number(hallIdRaw) : undefined;
  const result = await deleteVenueScheduleBlocks({
    venueId,
    id,
    eventDate: url.searchParams.get("eventDate") ?? undefined,
    hallId: Number.isFinite(hallId) ? hallId : undefined,
    wholeVenue: url.searchParams.get("wholeVenue") === "1" || url.searchParams.get("wholeVenue") === "true",
    timezone: url.searchParams.get("timezone") ?? undefined,
  });
  if (!result.ok) return jsonError(result.error, result.status, { code: result.code });
  return NextResponse.json({ ok: true, deleted: result.deleted });
}
