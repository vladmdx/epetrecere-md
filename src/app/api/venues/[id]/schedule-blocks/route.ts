import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { venueScheduleBlocks } from "@/lib/db/schema";
import { requireVenueCapability } from "@/lib/venue-access";
import { jsonAccess, jsonError } from "@/lib/http/json";
import { jsonIfMultiHallDisabled } from "@/lib/partner/multi-hall-gate";
import { createVenueScheduleBlock, deleteVenueScheduleBlocks } from "@/lib/booking/venue-schedule-write";
import {
  isValidCalendarDate,
  isValidCalendarTime,
  isValidIanaTimeZone,
} from "@/lib/booking/calendar-input-validation";
import { canonicalVenueIntervalStrict } from "@/lib/booking/zoned-interval";
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

const realDate = z.string().refine(isValidCalendarDate, {
  message: "Date must be a real YYYY-MM-DD calendar date",
});
const wallClock = z.string().refine(isValidCalendarTime, {
  message: "Time must use HH:mm",
});
const ianaTimeZone = z.string().refine(isValidIanaTimeZone, {
  message: "Timezone must be a valid IANA identifier",
});

const createSchema = z.object({
  hallId: z.number().int().positive().nullable().optional(),
  eventDate: realDate.optional(),
  dates: z
    .array(realDate)
    .min(1)
    .max(62)
    .refine((dates) => new Set(dates).size === dates.length, {
      message: "Duplicate dates are not allowed",
    })
    .optional(),
  status: z.enum(["available", "blocked", "tentative"]).optional(),
  startTime: wallClock.optional().nullable(),
  endTime: wallClock.optional().nullable(),
  startsAt: z.string().datetime({ offset: true }).optional(),
  endsAt: z.string().datetime({ offset: true }).optional(),
  timezone: ianaTimeZone.optional(),
  kind: z.enum(["maintenance", "sanitary_day", "private_event", "manual", "external_calendar"]).default("manual"),
  reason: z.string().max(500).optional().nullable(),
  wholeVenue: z.boolean().optional(),
}).superRefine((input, ctx) => {
  const usesBulkWrite = input.dates !== undefined || input.status !== undefined;
  const hasTimedFields =
    input.startTime != null
    || input.endTime != null
    || input.startsAt != null
    || input.endsAt != null;

  if (input.dates !== undefined && input.eventDate !== undefined) {
    ctx.addIssue({
      code: "custom",
      message: "Use either dates or eventDate, not both",
      path: ["dates"],
    });
  }
  if (usesBulkWrite && input.dates === undefined && input.eventDate === undefined) {
    ctx.addIssue({
      code: "custom",
      message: "At least one calendar date is required",
      path: ["dates"],
    });
  }
  if (usesBulkWrite && hasTimedFields) {
    ctx.addIssue({
      code: "custom",
      message: "Timed interval fields cannot be combined with a bulk day write",
      path: ["startTime"],
    });
    return;
  }

  if (!usesBulkWrite) {
    try {
      canonicalVenueIntervalStrict({
        eventDate: input.eventDate,
        startTime: input.startTime,
        endTime: input.endTime,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        timezone: input.timezone,
      });
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "Invalid interval",
        path: ["eventDate"],
      });
    }
  }
});

export async function POST(req: Request, ctx: Ctx) {
  const venueId = Number((await ctx.params).id);
  const access = await requireVenueCapability(venueId, "manage_calendar");
  if (!access.ok) return jsonAccess(access);
  const blocked = jsonIfMultiHallDisabled();
  if (blocked) return blocked;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Validation failed", 400, { details: parsed.error.issues });
  if (parsed.data.status === "tentative") {
    return jsonError("TENTATIVE_NOT_SUPPORTED", 400, { code: "TENTATIVE_NOT_SUPPORTED" });
  }
  const dates = parsed.data.dates?.length
    ? parsed.data.dates
    : parsed.data.eventDate
      ? [parsed.data.eventDate]
      : [];
  if (parsed.data.dates !== undefined || parsed.data.status !== undefined) {
    const { applyVenueScheduleBlocksBulk } = await import("@/lib/booking/venue-schedule-write");
    const result = await applyVenueScheduleBlocksBulk({
      venueId,
      hallId: parsed.data.hallId,
      wholeVenue: parsed.data.wholeVenue,
      dates,
      action: parsed.data.status === "available" ? "clear" : "block",
      timezone: parsed.data.timezone,
      kind: parsed.data.kind,
      reason: parsed.data.reason,
      createdBy: access.user.id,
    });
    if (!result.ok) {
      return jsonError(result.error, result.status, { code: result.code });
    }
    return NextResponse.json({ ok: true, written: result.written });
  }
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
  const idRaw = url.searchParams.get("id");
  const id = idRaw == null ? undefined : Number(idRaw);
  const hallIdRaw = url.searchParams.get("hallId");
  const hallId = hallIdRaw ? Number(hallIdRaw) : undefined;
  const eventDate = url.searchParams.get("eventDate") ?? undefined;
  const timezone = url.searchParams.get("timezone") ?? undefined;
  if (
    (idRaw != null && (!Number.isSafeInteger(id) || id! < 1))
    || (hallIdRaw != null && (!Number.isSafeInteger(hallId) || hallId! < 1))
    || (eventDate != null && !isValidCalendarDate(eventDate))
    || (timezone != null && !isValidIanaTimeZone(timezone))
  ) {
    return jsonError("Validation failed", 400, { code: "VALIDATION" });
  }
  const result = await deleteVenueScheduleBlocks({
    venueId,
    actorUserId: access.user.id,
    id,
    eventDate,
    hallId: Number.isFinite(hallId) ? hallId : undefined,
    wholeVenue: url.searchParams.get("wholeVenue") === "1" || url.searchParams.get("wholeVenue") === "true",
    timezone,
  });
  if (!result.ok) return jsonError(result.error, result.status, { code: result.code });
  return NextResponse.json({ ok: true, deleted: result.deleted });
}
