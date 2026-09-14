/**
 * Authoritative venue schedule-block writes. Availability reads
 * venue_schedule_blocks; owner UI for multi-hall must write here, not
 * calendar_events.
 */
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { venueScheduleBlocks, venues } from "@/lib/db/schema";
import {
  acquireAvailabilityLocks,
  acquireLegalScopeLocks,
  type AvailabilityLockKeys,
} from "./advisory-locks";
import {
  canonicalVenueIntervalStrict,
  intervalsOverlapHalfOpen,
  VenueIntervalValidationError,
} from "./zoned-interval";
import {
  CalendarWriteValidationError,
  normalizeCalendarDates,
} from "./calendar-write";
import { evaluateVenueAvailability } from "./venue-availability";
import { VenueAvailabilityError } from "./venue-booking-write";
import {
  authorizeVenueCapabilityLocked,
  getLockedAppUserById,
} from "@/lib/venue-access";

type BlockKind = "maintenance" | "sanitary_day" | "private_event" | "manual" | "external_calendar";

type ScheduleWriteTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type VenueScheduleScope = {
  venueId: number;
  organizationId: number | null;
};

class VenueScheduleAuthorizationError extends Error {
  constructor(
    readonly status: 403 | 404 | 409,
    readonly code: "FORBIDDEN" | "VENUE_NOT_FOUND" | "VENUE_SCOPE_CHANGED",
  ) {
    super(code);
    this.name = "VenueScheduleAuthorizationError";
  }
}

async function loadVenueScheduleScope(
  venueId: number,
): Promise<VenueScheduleScope | null> {
  const [scope] = await db
    .select({ venueId: venues.id, organizationId: venues.organizationId })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  return scope ?? null;
}

/**
 * Legal authority always precedes availability. After those advisory locks,
 * freeze the live actor + venue and re-run the central capability resolver,
 * including the organization/membership row locks. A revoke, demotion,
 * suspension, deletion or reparent therefore commits either before this
 * decision (and is observed) or after the schedule transaction.
 */
async function authorizeVenueScheduleWrite(
  tx: ScheduleWriteTx,
  expected: VenueScheduleScope,
  actorUserId: string,
  lockKeys: AvailabilityLockKeys,
): Promise<void> {
  await acquireLegalScopeLocks(tx, {
    userIds: [actorUserId],
    organizationIds:
      expected.organizationId == null ? [] : [expected.organizationId],
  });
  await acquireAvailabilityLocks(tx, lockKeys);

  const actor = await getLockedAppUserById(
    actorUserId,
    tx as unknown as typeof db,
  );
  if (!actor) throw new VenueScheduleAuthorizationError(403, "FORBIDDEN");

  const [currentVenue] = await tx
    .select({ id: venues.id, organizationId: venues.organizationId })
    .from(venues)
    .where(eq(venues.id, expected.venueId))
    .for("update")
    .limit(1);
  if (!currentVenue) {
    throw new VenueScheduleAuthorizationError(404, "VENUE_NOT_FOUND");
  }
  if (currentVenue.organizationId !== expected.organizationId) {
    throw new VenueScheduleAuthorizationError(409, "VENUE_SCOPE_CHANGED");
  }

  const access = await authorizeVenueCapabilityLocked(
    actor,
    expected.venueId,
    "manage_calendar",
    tx as unknown as typeof db,
  );
  if (!access.ok) {
    throw new VenueScheduleAuthorizationError(
      access.status === 404 ? 404 : 403,
      access.status === 404 ? "VENUE_NOT_FOUND" : "FORBIDDEN",
    );
  }
}

function venueScheduleAuthorizationFailure(
  error: unknown,
): { ok: false; status: number; error: string; code: string } | null {
  if (!(error instanceof VenueScheduleAuthorizationError)) return null;
  return {
    ok: false,
    status: error.status,
    error: error.code,
    code: error.code,
  };
}

function clearableManualScheduleBlock() {
  return or(
    eq(venueScheduleBlocks.source, "manual"),
    and(
      eq(venueScheduleBlocks.source, "backfill_0028:calendar_events"),
      eq(venueScheduleBlocks.kind, "manual"),
    ),
  );
}

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
  let interval;
  try {
    interval = canonicalVenueIntervalStrict({
      eventDate: input.eventDate,
      startTime: input.startTime,
      endTime: input.endTime,
      timezone: input.timezone,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    });
  } catch {
    return { ok: false, status: 400, error: "INVALID_INTERVAL", code: "INVALID_INTERVAL" };
  }

  const scope = await loadVenueScheduleScope(input.venueId);
  if (!scope) {
    return { ok: false, status: 404, error: "VENUE_NOT_FOUND", code: "VENUE_NOT_FOUND" };
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
        timezone: interval.timezone,
        reservationScope: wholeVenue ? ("venue" as const) : ("hall" as const),
        mode: "owner" as const,
        ignoreWorkingHours: true,
        executor,
      };
      const first = await evaluateVenueAvailability(availabilityInput);
      if (!first.available || !first.lockKeys) {
        throw new VenueAvailabilityError(first);
      }
      await authorizeVenueScheduleWrite(
        tx,
        scope,
        input.createdBy,
        first.lockKeys,
      );
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
    const authorization = venueScheduleAuthorizationFailure(error);
    if (authorization) return authorization;
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
  let dates: string[];
  try {
    dates = normalizeCalendarDates(input.dates, {
      maxDates: 62,
      rejectDuplicates: true,
    });
    canonicalVenueIntervalStrict({
      eventDate: dates[0],
      timezone: input.timezone,
    });
  } catch (error) {
    if (
      error instanceof CalendarWriteValidationError
      || error instanceof VenueIntervalValidationError
    ) {
      return { ok: false, status: 400, error: "INVALID_INTERVAL", code: "INVALID_INTERVAL" };
    }
    throw error;
  }
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
  const scope = await loadVenueScheduleScope(input.venueId);
  if (!scope) {
    return { ok: false, status: 404, error: "VENUE_NOT_FOUND", code: "VENUE_NOT_FOUND" };
  }
  try {
    const written = await db.transaction(async (tx) => {
      const executor = tx as unknown as typeof db;
      const wholeVenue = input.wholeVenue === true;
      const hallId = wholeVenue ? null : input.hallId ?? null;
      const firstDate = dates[0]!;
      const firstInterval = canonicalVenueIntervalStrict({ eventDate: firstDate, timezone: input.timezone });
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
      await authorizeVenueScheduleWrite(tx, scope, input.createdBy, {
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
          const interval = canonicalVenueIntervalStrict({ eventDate: date, timezone: input.timezone });
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
      const rows = await tx
        .select()
        .from(venueScheduleBlocks)
        .where(and(
          eq(venueScheduleBlocks.venueId, input.venueId),
          clearableManualScheduleBlock(),
        ))
        .for("update");
      const ids = rows
        .filter((block) => {
          const matchHall = wholeVenue ? block.hallId == null : block.hallId === hallId;
          if (!matchHall) return false;
          return dates.some((date) => {
            const interval = canonicalVenueIntervalStrict({ eventDate: date, timezone: input.timezone });
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
    const authorization = venueScheduleAuthorizationFailure(error);
    if (authorization) return authorization;
    if (error instanceof VenueAvailabilityError) {
      return { ok: false, status: 409, error: "AFFECTED_BOOKINGS", code: "AFFECTED_BOOKINGS" };
    }
    if (
      error instanceof CalendarWriteValidationError
      || error instanceof VenueIntervalValidationError
    ) {
      return { ok: false, status: 400, error: "INVALID_INTERVAL", code: "INVALID_INTERVAL" };
    }
    throw error;
  }
}

export async function deleteVenueScheduleBlocks(input: {
  venueId: number;
  actorUserId: string;
  id?: number;
  eventDate?: string;
  hallId?: number | null;
  wholeVenue?: boolean;
  timezone?: string;
}): Promise<{ ok: true; deleted: number } | { ok: false; status: number; error: string; code: string }> {
  if (input.id != null && (!Number.isSafeInteger(input.id) || input.id < 1)) {
    return { ok: false, status: 400, error: "VALIDATION", code: "VALIDATION" };
  }
  if (!input.eventDate) {
    if (input.id == null) {
      return { ok: false, status: 400, error: "id or eventDate required", code: "VALIDATION" };
    }
  }
  if (input.id == null && input.wholeVenue !== true && input.hallId == null) {
    return {
      ok: false,
      status: 400,
      error: "HALL_OR_WHOLE_VENUE_REQUIRED",
      code: "HALL_OR_WHOLE_VENUE_REQUIRED",
    };
  }
  const wholeVenue = input.wholeVenue === true;
  let interval: ReturnType<typeof canonicalVenueIntervalStrict> | null = null;
  if (input.eventDate) {
    try {
      interval = canonicalVenueIntervalStrict({
        eventDate: input.eventDate,
        timezone: input.timezone,
      });
    } catch (error) {
      if (error instanceof VenueIntervalValidationError) {
        return { ok: false, status: 400, error: "INVALID_INTERVAL", code: "INVALID_INTERVAL" };
      }
      throw error;
    }
  }

  const scope = await loadVenueScheduleScope(input.venueId);
  if (!scope) {
    return { ok: false, status: 404, error: "VENUE_NOT_FOUND", code: "VENUE_NOT_FOUND" };
  }

  try {
    const deleted = await db.transaction(async (tx) => {
      await authorizeVenueScheduleWrite(tx, scope, input.actorUserId, {
        venueId: input.venueId,
        hallIds:
          input.id == null && !wholeVenue && input.hallId != null
            ? [input.hallId]
            : [],
        localDates: interval ? [interval.eventDate] : [],
        conflictGroupIds: [],
      });

      if (input.id != null) {
        const removed = await tx
          .delete(venueScheduleBlocks)
          .where(and(
            eq(venueScheduleBlocks.id, input.id),
            eq(venueScheduleBlocks.venueId, input.venueId),
            clearableManualScheduleBlock(),
          ))
          .returning({ id: venueScheduleBlocks.id });
        return removed.length;
      }

      const rows = await tx
        .select()
        .from(venueScheduleBlocks)
        .where(and(
          eq(venueScheduleBlocks.venueId, input.venueId),
          clearableManualScheduleBlock(),
        ))
        .for("update");
      const ids = rows
        .filter((block) => {
          if (
            !interval
            || !intervalsOverlapHalfOpen(
              interval.startsAt,
              interval.endsAt,
              block.startsAt,
              block.endsAt,
            )
          ) {
            return false;
          }
          if (wholeVenue) return block.hallId == null;
          return block.hallId === input.hallId;
        })
        .map((block) => block.id);
      if (!ids.length) return 0;
      const removed = await tx
        .delete(venueScheduleBlocks)
        .where(inArray(venueScheduleBlocks.id, ids))
        .returning({ id: venueScheduleBlocks.id });
      return removed.length;
    });
    return { ok: true, deleted };
  } catch (error) {
    const authorization = venueScheduleAuthorizationFailure(error);
    if (authorization) return authorization;
    throw error;
  }
}
