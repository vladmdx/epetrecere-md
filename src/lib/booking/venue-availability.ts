/**
 * Single venue/hall availability source for catalog, booking, calendar, and blocks.
 * server-only.
 */
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  bookingRequests,
  partnerOrganizations,
  venueHallConflictGroupMembers,
  venueHallConflictGroups,
  venueHalls,
  venueHallSeatingOptions,
  venueScheduleBlocks,
  venues,
} from "@/lib/db/schema";
import { isMultiHallEnabled } from "@/lib/feature-flags";
import { DEFAULT_BUFFER_MINUTES } from "@/lib/moldova-cities";
import {
  canonicalVenueInterval,
  intervalsOverlapHalfOpen,
  localDatesIntersecting,
  weekdayMonStart,
  type CanonicalInterval,
} from "./zoned-interval";
import type { AvailabilityLockKeys } from "./advisory-locks";

const BLOCKING_STATUSES = ["pending", "accepted", "confirmed_by_client", "completed"] as const;

type AvailabilityExecutor = typeof db;
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export type AvailabilityMode = "public" | "owner" | "admin";

export type AvailabilityCode =
  | "OK"
  | "VENUE_INACTIVE"
  | "HALL_INACTIVE"
  | "HALL_NOT_IN_VENUE"
  | "HALL_REQUIRED"
  | "CAPACITY"
  | "OUTSIDE_HOURS"
  | "VENUE_BLOCK"
  | "HALL_BLOCK"
  | "BOOKING_CONFLICT"
  | "CONFLICT_GROUP"
  | "INVALID_INTERVAL";

export type VenueAvailabilityResult = {
  available: boolean;
  code: AvailabilityCode;
  message: string;
  hallId: number | null;
  interval: CanonicalInterval | null;
  lockKeys?: AvailabilityLockKeys;
  conflictBookingId?: number;
};

const PUBLIC_UNAVAILABLE = "Intervalul nu este disponibil.";

export async function resolveHallForVenueBooking(opts: {
  venueId: number;
  hallId?: number | null;
  executor?: AvailabilityExecutor;
}): Promise<{ ok: true; hallId: number | null; code?: undefined } | { ok: false; code: AvailabilityCode; message: string }> {
  const executor = opts.executor ?? db;
  if (!isMultiHallEnabled()) {
    return { ok: true, hallId: opts.hallId ?? null };
  }
  if (opts.hallId != null) {
    const [hall] = await executor
      .select({ id: venueHalls.id, venueId: venueHalls.venueId })
      .from(venueHalls)
      .where(eq(venueHalls.id, opts.hallId))
      .limit(1);
    if (!hall || hall.venueId !== opts.venueId) {
      return { ok: false, code: "HALL_NOT_IN_VENUE", message: "Sala nu aparține localului." };
    }
    return { ok: true, hallId: hall.id };
  }
  const active = await executor
    .select({ id: venueHalls.id })
    .from(venueHalls)
    .where(and(eq(venueHalls.venueId, opts.venueId), eq(venueHalls.status, "active")));
  if (active.length === 1) return { ok: true, hallId: active[0].id };
  if (active.length === 0) {
    const any = await executor
      .select({ id: venueHalls.id })
      .from(venueHalls)
      .where(and(eq(venueHalls.venueId, opts.venueId), ne(venueHalls.status, "archived")));
    if (any.length === 1) return { ok: true, hallId: any[0].id };
    return { ok: false, code: "HALL_REQUIRED", message: "HALL_REQUIRED" };
  }
  return { ok: false, code: "HALL_REQUIRED", message: "HALL_REQUIRED" };
}

function hoursWindow(
  hours: Record<string, { open: string; close: string } | null> | null | undefined,
  date: string,
  timezone: string,
): { open: string; close: string } | null | "unset" {
  if (!hours) return "unset";
  const key = DAY_KEYS[weekdayMonStart(date, timezone)];
  const day = hours[key];
  if (day === undefined) return "unset";
  if (day === null) return null;
  return day;
}

export async function evaluateVenueAvailability(opts: {
  venueId: number;
  hallId?: number | null;
  guestCount?: number | null;
  eventDate: string;
  startTime?: string | null;
  endTime?: string | null;
  timezone?: string | null;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  excludeBookingId?: number;
  reservationScope?: "hall" | "venue";
  mode?: AvailabilityMode;
  executor?: AvailabilityExecutor;
}): Promise<VenueAvailabilityResult> {
  const q = opts.executor ?? db;
  const mode = opts.mode ?? "public";
  const redact = mode === "public";
  const [venue] = await q
    .select()
    .from(venues)
    .where(eq(venues.id, opts.venueId))
    .limit(1);
  if (!venue) {
    return { available: false, code: "VENUE_INACTIVE", message: PUBLIC_UNAVAILABLE, hallId: null, interval: null };
  }
  let organizationStatus: string | null = null;
  if (venue.organizationId != null) {
    const [org] = await q
      .select({ status: partnerOrganizations.status })
      .from(partnerOrganizations)
      .where(eq(partnerOrganizations.id, venue.organizationId))
      .limit(1);
    organizationStatus = org?.status ?? null;
  }
  if (mode === "public" && (!venue.isActive || (organizationStatus && organizationStatus !== "active"))) {
    return { available: false, code: "VENUE_INACTIVE", message: PUBLIC_UNAVAILABLE, hallId: null, interval: null };
  }

  const resolved = await resolveHallForVenueBooking({
    venueId: opts.venueId,
    hallId: opts.hallId,
    executor: q,
  });
  if (!resolved.ok) {
    return {
      available: false,
      code: resolved.code,
      message: redact && resolved.code === "HALL_REQUIRED" ? PUBLIC_UNAVAILABLE : resolved.message,
      hallId: null,
      interval: null,
    };
  }

  let hall: typeof venueHalls.$inferSelect | null = null;
  if (resolved.hallId != null) {
    const [row] = await q.select().from(venueHalls).where(eq(venueHalls.id, resolved.hallId)).limit(1);
    hall = row ?? null;
    if (!hall || hall.venueId !== venue.id) {
      return { available: false, code: "HALL_NOT_IN_VENUE", message: PUBLIC_UNAVAILABLE, hallId: null, interval: null };
    }
    if (mode === "public" && hall.status !== "active") {
      return { available: false, code: "HALL_INACTIVE", message: PUBLIC_UNAVAILABLE, hallId: hall.id, interval: null };
    }
    if (hall.status === "archived") {
      return { available: false, code: "HALL_INACTIVE", message: PUBLIC_UNAVAILABLE, hallId: hall.id, interval: null };
    }
  }

  const timezone = opts.timezone || venue.timezone || "Europe/Chisinau";
  let interval: CanonicalInterval;
  try {
    interval = canonicalVenueInterval({
      eventDate: opts.eventDate,
      startTime: opts.startTime,
      endTime: opts.endTime,
      timezone,
      startsAt: opts.startsAt,
      endsAt: opts.endsAt,
    });
  } catch {
    return { available: false, code: "INVALID_INTERVAL", message: PUBLIC_UNAVAILABLE, hallId: resolved.hallId, interval: null };
  }
  if (!(interval.endsAt.getTime() > interval.startsAt.getTime())) {
    return { available: false, code: "INVALID_INTERVAL", message: PUBLIC_UNAVAILABLE, hallId: resolved.hallId, interval: null };
  }

  if (opts.guestCount != null && hall) {
    const seating = await q
      .select()
      .from(venueHallSeatingOptions)
      .where(eq(venueHallSeatingOptions.hallId, hall.id));
    const hallOk =
      (hall.capacityMin == null || opts.guestCount >= hall.capacityMin) &&
      (hall.capacityMax == null || opts.guestCount <= hall.capacityMax);
    const seatingOk =
      seating.length > 0 &&
      seating.some((option) => {
        const min = option.capacityMin ?? 0;
        const max = option.capacityMax ?? Number.POSITIVE_INFINITY;
        return opts.guestCount! >= min && opts.guestCount! <= max;
      });
    if (seating.length > 0 ? !seatingOk : !hallOk) {
      return {
        available: false,
        code: "CAPACITY",
        message: redact ? PUBLIC_UNAVAILABLE : "Numărul de invitați nu încape în această sală.",
        hallId: hall.id,
        interval,
      };
    }
  }

  const hours = (hall?.workingHours as typeof venue.workingHours | null) ?? venue.workingHours;
  if (opts.startTime && opts.endTime && hours) {
    const window = hoursWindow(hours, interval.eventDate, timezone);
    if (window === null) {
      return {
        available: false,
        code: "OUTSIDE_HOURS",
        message: redact ? PUBLIC_UNAVAILABLE : "În această zi nu se acceptă rezervări.",
        hallId: resolved.hallId,
        interval,
      };
    }
    if (window !== "unset") {
      const open = canonicalVenueInterval({
        eventDate: interval.eventDate,
        startTime: window.open,
        endTime: window.close,
        timezone,
      });
      if (interval.startsAt < open.startsAt || interval.endsAt > open.endsAt) {
        return {
          available: false,
          code: "OUTSIDE_HOURS",
          message: redact
            ? PUBLIC_UNAVAILABLE
            : `Intervalul cerut este în afara orelor de lucru (${window.open}–${window.close}).`,
          hallId: resolved.hallId,
          interval,
        };
      }
    }
  }

  const localDates = localDatesIntersecting(interval);
  const bufferMinutes = hall?.bufferMinutes ?? venue.bufferMinutes ?? DEFAULT_BUFFER_MINUTES;
  const bufferedEnd = new Date(interval.endsAt.getTime() + bufferMinutes * 60_000);

  const conflictMembers = resolved.hallId
    ? await q
        .select({
          groupId: venueHallConflictGroupMembers.groupId,
          hallId: venueHallConflictGroupMembers.hallId,
        })
        .from(venueHallConflictGroupMembers)
        .innerJoin(
          venueHallConflictGroups,
          eq(venueHallConflictGroups.id, venueHallConflictGroupMembers.groupId),
        )
        .where(eq(venueHallConflictGroups.venueId, venue.id))
    : [];
  const groupIds = [...new Set(
    conflictMembers.filter((row) => row.hallId === resolved.hallId).map((row) => row.groupId),
  )];
  const incompatibleHallIds = [...new Set(
    conflictMembers.filter((row) => groupIds.includes(row.groupId) && row.hallId !== resolved.hallId).map((row) => row.hallId),
  )];

  const lockKeys: AvailabilityLockKeys = {
    venueId: venue.id,
    hallIds: [resolved.hallId ?? 0, ...incompatibleHallIds].filter((id) => id > 0),
    localDates,
    conflictGroupIds: groupIds,
  };

  const blocks = await q
    .select()
    .from(venueScheduleBlocks)
    .where(eq(venueScheduleBlocks.venueId, venue.id));
  for (const block of blocks) {
    if (!intervalsOverlapHalfOpen(interval.startsAt, bufferedEnd, block.startsAt, block.endsAt)) continue;
    if (block.hallId == null) {
      return {
        available: false,
        code: "VENUE_BLOCK",
        message: PUBLIC_UNAVAILABLE,
        hallId: resolved.hallId,
        interval,
        lockKeys,
      };
    }
    if (resolved.hallId != null && block.hallId === resolved.hallId) {
      return {
        available: false,
        code: "HALL_BLOCK",
        message: PUBLIC_UNAVAILABLE,
        hallId: resolved.hallId,
        interval,
        lockKeys,
      };
    }
    if (incompatibleHallIds.includes(block.hallId)) {
      return {
        available: false,
        code: "CONFLICT_GROUP",
        message: PUBLIC_UNAVAILABLE,
        hallId: resolved.hallId,
        interval,
        lockKeys,
      };
    }
  }

  const bookings = await q
    .select()
    .from(bookingRequests)
    .where(
      and(
        eq(bookingRequests.venueId, venue.id),
        inArray(bookingRequests.status, [...BLOCKING_STATUSES]),
        opts.excludeBookingId != null ? ne(bookingRequests.id, opts.excludeBookingId) : undefined,
      ),
    );

  for (const booking of bookings) {
    const other = canonicalVenueInterval({
      eventDate: booking.eventDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      timezone: booking.timezone || timezone,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
    });
    const otherEnd = new Date(other.endsAt.getTime() + bufferMinutes * 60_000);
    if (!intervalsOverlapHalfOpen(interval.startsAt, bufferedEnd, other.startsAt, otherEnd)) continue;

    const wholeVenue = booking.reservationScope === "venue" || opts.reservationScope === "venue";
    const sameHall = resolved.hallId != null && booking.hallId === resolved.hallId;
    const otherIncompatible = booking.hallId != null && incompatibleHallIds.includes(booking.hallId);
    const legacyVenueWide = booking.hallId == null && resolved.hallId == null;

    if (wholeVenue || sameHall || legacyVenueWide) {
      return {
        available: false,
        code: "BOOKING_CONFLICT",
        message: redact
          ? PUBLIC_UNAVAILABLE
          : `Conflict: există deja o rezervare în acest interval${booking.hallId ? "" : ""}.`,
        hallId: resolved.hallId,
        interval,
        lockKeys,
        conflictBookingId: booking.id,
      };
    }
    if (otherIncompatible) {
      return {
        available: false,
        code: "CONFLICT_GROUP",
        message: PUBLIC_UNAVAILABLE,
        hallId: resolved.hallId,
        interval,
        lockKeys,
        conflictBookingId: booking.id,
      };
    }
  }

  return {
    available: true,
    code: "OK",
    message: "",
    hallId: resolved.hallId,
    interval,
    lockKeys,
  };
}

export function availabilityHttpStatus(result: VenueAvailabilityResult): number {
  if (result.available) return 200;
  if (result.code === "HALL_REQUIRED") return 409;
  if (result.code === "HALL_NOT_IN_VENUE") return 400;
  return 409;
}
