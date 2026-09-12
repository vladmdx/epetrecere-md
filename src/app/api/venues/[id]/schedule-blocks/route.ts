import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { venueScheduleBlocks } from "@/lib/db/schema";
import { requireVenueCapability } from "@/lib/venue-access";
import { jsonAccess, jsonError } from "@/lib/http/json";
import { canonicalVenueInterval } from "@/lib/booking/zoned-interval";
import { evaluateVenueAvailability } from "@/lib/booking/venue-availability";
import { acquireAvailabilityLocks } from "@/lib/booking/advisory-locks";
import { VenueAvailabilityError } from "@/lib/booking/venue-booking-write";

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
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Validation failed", 400, { details: parsed.error.issues });
  const wholeVenue = parsed.data.wholeVenue || parsed.data.hallId == null;
  const interval = canonicalVenueInterval({
    eventDate: parsed.data.eventDate ?? (parsed.data.startsAt ? parsed.data.startsAt.slice(0, 10) : ""),
    startTime: parsed.data.startTime,
    endTime: parsed.data.endTime,
    timezone: parsed.data.timezone,
    startsAt: parsed.data.startsAt,
    endsAt: parsed.data.endsAt,
  });
  if (wholeVenue) {
    const check = await evaluateVenueAvailability({
      venueId,
      eventDate: interval.eventDate,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      startsAt: interval.startsAt,
      endsAt: interval.endsAt,
      reservationScope: "venue",
      mode: "owner",
    });
    if (!check.available && check.code === "BOOKING_CONFLICT") {
      return jsonError("AFFECTED_BOOKINGS", 409, {
        code: "AFFECTED_BOOKINGS",
        message: "Închiderea întregului local se suprapune cu rezervări existente. Confirmă explicit acțiunea după ce le anulezi sau le muți.",
      });
    }
  }
  try {
    const created = await db.transaction(async (tx) => {
      const executor = tx as unknown as typeof db;
      const locked = await evaluateVenueAvailability({
        venueId,
        hallId: wholeVenue ? undefined : parsed.data.hallId ?? undefined,
        eventDate: interval.eventDate,
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime,
        startsAt: interval.startsAt,
        endsAt: interval.endsAt,
        reservationScope: wholeVenue ? "venue" : "hall",
        mode: "owner",
        executor,
      });
      if (locked.lockKeys) await acquireAvailabilityLocks(tx, locked.lockKeys);
      const recheck = await evaluateVenueAvailability({
        venueId,
        hallId: wholeVenue ? undefined : parsed.data.hallId ?? undefined,
        eventDate: interval.eventDate,
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime,
        startsAt: interval.startsAt,
        endsAt: interval.endsAt,
        reservationScope: wholeVenue ? "venue" : "hall",
        mode: "owner",
        executor,
      });
      if (wholeVenue && !recheck.available && recheck.code === "BOOKING_CONFLICT") {
        throw new VenueAvailabilityError(recheck);
      }
      const [row] = await tx.insert(venueScheduleBlocks).values({
        venueId,
        hallId: wholeVenue ? null : parsed.data.hallId ?? null,
        startsAt: interval.startsAt,
        endsAt: interval.endsAt,
        kind: parsed.data.kind,
        reason: parsed.data.reason ?? null,
        source: "manual",
        createdBy: access.user.id,
      }).returning();
      return row;
    });
    return NextResponse.json({ block: created });
  } catch (error) {
    if (error instanceof VenueAvailabilityError && error.result.code === "BOOKING_CONFLICT") {
      return jsonError("AFFECTED_BOOKINGS", 409, {
        code: "AFFECTED_BOOKINGS",
        message: "Închiderea întregului local se suprapune cu rezervări existente. Confirmă explicit acțiunea după ce le anulezi sau le muți.",
      });
    }
    throw error;
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const venueId = Number((await ctx.params).id);
  const access = await requireVenueCapability(venueId, "manage_calendar");
  if (!access.ok) return jsonAccess(access);
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return jsonError("id required", 400);
  await db.delete(venueScheduleBlocks).where(and(eq(venueScheduleBlocks.id, id), eq(venueScheduleBlocks.venueId, venueId)));
  return NextResponse.json({ ok: true });
}
