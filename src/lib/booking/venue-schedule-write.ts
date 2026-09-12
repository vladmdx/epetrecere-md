/**
 * Authoritative venue schedule-block writes. Availability reads
 * venue_schedule_blocks; owner UI for multi-hall must write here, not
 * calendar_events.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { venueScheduleBlocks } from "@/lib/db/schema";
import { acquireAvailabilityLocks } from "./advisory-locks";
import { canonicalVenueInterval, intervalsOverlapHalfOpen } from "./zoned-interval";
import { evaluateVenueAvailability } from "./venue-availability";
import { VenueAvailabilityError } from "./venue-booking-write";

type BlockKind = "maintenance" | "sanitary_day" | "private_event" | "manual" | "external_calendar";

export async function createVenueScheduleBlock(input: {
  venueId: number;
  hallId?: number | null;
  wholeVenue?: boolean;
  eventDate?: string;
  startTime?: string | null;
  endTime?: string | null;
  startsAt?: string;
  endsAt?: string;
  timezone?: string;
  kind?: BlockKind;
  reason?: string | null;
  createdBy: string;
}): Promise<
  | { ok: true; block: typeof venueScheduleBlocks.$inferSelect }
  | { ok: false; status: number; error: string; code: string }
> {
  if (input.wholeVenue !== true && input.hallId == null) {
    return {
      ok: false,
      status: 400,
      error: "HALL_OR_WHOLE_VENUE_REQUIRED",
      code: "HALL_OR_WHOLE_VENUE_REQUIRED",
    };
  }
  const wholeVenue = input.wholeVenue === true;
  const hallId = wholeVenue ? null : input.hallId ?? null;
  const eventDate = input.eventDate ?? (input.startsAt ? input.startsAt.slice(0, 10) : "");
  let interval;
  try {
    interval = canonicalVenueInterval({
      eventDate,
      startTime: input.startTime,
      endTime: input.endTime,
      timezone: input.timezone,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    });
  } catch {
    return { ok: false, status: 400, error: "INVALID_INTERVAL", code: "INVALID_INTERVAL" };
  }

  try {
    const created = await db.transaction(async (tx) => {
      const executor = tx as unknown as typeof db;
      const availabilityInput = {
        venueId: input.venueId,
        hallId: wholeVenue ? undefined : hallId ?? undefined,
        eventDate: interval.eventDate,
        startTime: input.startTime,
        endTime: input.endTime,
        startsAt: interval.startsAt,
        endsAt: interval.endsAt,
        timezone: input.timezone,
        reservationScope: wholeVenue ? ("venue" as const) : ("hall" as const),
        mode: "owner" as const,
        ignoreWorkingHours: true,
        executor,
      };
      const first = await evaluateVenueAvailability(availabilityInput);
      if (!first.available || !first.lockKeys) {
        throw new VenueAvailabilityError(first);
      }
      await acquireAvailabilityLocks(tx, first.lockKeys);
      const recheck = await evaluateVenueAvailability(availabilityInput);
      if (!recheck.available) {
        throw new VenueAvailabilityError(recheck);
      }
      const [row] = await tx
        .insert(venueScheduleBlocks)
        .values({
          venueId: input.venueId,
          hallId,
          startsAt: interval.startsAt,
          endsAt: interval.endsAt,
          kind: input.kind ?? "manual",
          reason: input.reason ?? null,
          source: "manual",
          createdBy: input.createdBy,
        })
        .returning();
      return row;
    });
    return { ok: true, block: created };
  } catch (error) {
    if (error instanceof VenueAvailabilityError) {
      return {
        ok: false,
        status: 409,
        error: "AFFECTED_BOOKINGS",
        code: "AFFECTED_BOOKINGS",
      };
    }
    throw error;
  }
}

export async function applyVenueScheduleBlocksBulk(input: {
  venueId: number;
  hallId?: number | null;
  wholeVenue?: boolean;
  dates: string[];
  action: "block" | "clear";
  timezone?: string;
  kind?: BlockKind;
  reason?: string | null;
  createdBy: string;
}): Promise<
  | { ok: true; written: number }
  | { ok: false; status: number; error: string; code: string }
> {
  const dates = [...new Set(input.dates)].sort();
  if (!dates.length) return { ok: false, status: 400, error: "dates required", code: "VALIDATION" };
  if (input.action !== "block" && input.action !== "clear") {
    return { ok: false, status: 400, error: "invalid_action", code: "TENTATIVE_NOT_SUPPORTED" };
  }
  if (input.wholeVenue !== true && input.hallId == null) {
    return {
      ok: false,
      status: 400,
      error: "HALL_OR_WHOLE_VENUE_REQUIRED",
      code: "HALL_OR_WHOLE_VENUE_REQUIRED",
    };
  }
  try {
    const written = await db.transaction(async (tx) => {
      const executor = tx as unknown as typeof db;
      const wholeVenue = input.wholeVenue === true;
      const hallId = wholeVenue ? null : input.hallId ?? null;
      const firstDate = dates[0]!;
      const firstInterval = canonicalVenueInterval({ eventDate: firstDate, timezone: input.timezone });
      const availabilityInput = {
        venueId: input.venueId,
        hallId: wholeVenue ? undefined : hallId ?? undefined,
        eventDate: firstInterval.eventDate,
        timezone: input.timezone,
        reservationScope: wholeVenue ? ("venue" as const) : ("hall" as const),
        mode: "owner" as const,
        ignoreWorkingHours: true,
        executor,
      };
      const lockProbe = await evaluateVenueAvailability({ ...availabilityInput, eventDate: dates[0]! });
      await acquireAvailabilityLocks(tx, {
        venueId: input.venueId,
        hallIds: wholeVenue ? [] : hallId ? [hallId] : [],
        localDates: dates,
        conflictGroupIds: lockProbe.lockKeys?.conflictGroupIds ?? [],
      });
      if (input.action === "block") {
        for (const date of dates) {
          const recheck = await evaluateVenueAvailability({ ...availabilityInput, eventDate: date });
          if (!recheck.available) throw new VenueAvailabilityError(recheck);
        }
        let count = 0;
        for (const date of dates) {
          const interval = canonicalVenueInterval({ eventDate: date, timezone: input.timezone });
          await tx.insert(venueScheduleBlocks).values({
            venueId: input.venueId,
            hallId,
            startsAt: interval.startsAt,
            endsAt: interval.endsAt,
            kind: input.kind ?? "manual",
            reason: input.reason ?? null,
            source: "manual",
            createdBy: input.createdBy,
          });
          count += 1;
        }
        return count;
      }
      let deleted = 0;
      const rows = await tx.select().from(venueScheduleBlocks).where(eq(venueScheduleBlocks.venueId, input.venueId));
      const ids = rows
        .filter((block) => {
          const matchHall = wholeVenue ? block.hallId == null : block.hallId === hallId;
          if (!matchHall) return false;
          return dates.some((date) => {
            const interval = canonicalVenueInterval({ eventDate: date, timezone: input.timezone });
            return intervalsOverlapHalfOpen(interval.startsAt, interval.endsAt, block.startsAt, block.endsAt);
          });
        })
        .map((block) => block.id);
      if (ids.length) {
        await tx.delete(venueScheduleBlocks).where(inArray(venueScheduleBlocks.id, ids));
        deleted = ids.length;
      }
      return deleted;
    });
    return { ok: true, written };
  } catch (error) {
    if (error instanceof VenueAvailabilityError) {
      return { ok: false, status: 409, error: "AFFECTED_BOOKINGS", code: "AFFECTED_BOOKINGS" };
    }
    throw error;
  }
}

export async function deleteVenueScheduleBlocks(input: {
  venueId: number;
  id?: number;
  eventDate?: string;
  hallId?: number | null;
  wholeVenue?: boolean;
  timezone?: string;
}): Promise<{ ok: true; deleted: number } | { ok: false; status: number; error: string; code: string }> {
  if (input.id) {
    const removed = await db
      .delete(venueScheduleBlocks)
      .where(and(eq(venueScheduleBlocks.id, input.id), eq(venueScheduleBlocks.venueId, input.venueId)))
      .returning({ id: venueScheduleBlocks.id });
    return { ok: true, deleted: removed.length };
  }
  if (!input.eventDate) {
    return { ok: false, status: 400, error: "id or eventDate required", code: "VALIDATION" };
  }
  if (input.wholeVenue !== true && input.hallId == null) {
    return {
      ok: false,
      status: 400,
      error: "HALL_OR_WHOLE_VENUE_REQUIRED",
      code: "HALL_OR_WHOLE_VENUE_REQUIRED",
    };
  }
  const wholeVenue = input.wholeVenue === true;
  const interval = canonicalVenueInterval({
    eventDate: input.eventDate,
    timezone: input.timezone,
  });
  const rows = await db
    .select()
    .from(venueScheduleBlocks)
    .where(eq(venueScheduleBlocks.venueId, input.venueId));
  const ids = rows
    .filter((block) => {
      if (!intervalsOverlapHalfOpen(interval.startsAt, interval.endsAt, block.startsAt, block.endsAt)) {
        return false;
      }
      if (wholeVenue) return block.hallId == null;
      return block.hallId === input.hallId;
    })
    .map((block) => block.id);
  if (!ids.length) return { ok: true, deleted: 0 };
  await db.delete(venueScheduleBlocks).where(inArray(venueScheduleBlocks.id, ids));
  return { ok: true, deleted: ids.length };
}
