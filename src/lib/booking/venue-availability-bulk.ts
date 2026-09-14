/**
 * Batch-read occupancy plus the same pure predicates as evaluateVenueAvailability.
 * Catalog-only. Does not acquire locks or write bookings/blocks.
 */
import { DEFAULT_BUFFER_MINUTES } from "@/lib/moldova-cities";
import {
  canonicalVenueInterval,
  canonicalVenueIntervalStrict,
  intervalsOverlapHalfOpen,
  weekdayMonStart,
  type CanonicalInterval,
} from "./zoned-interval";

const BLOCKING_STATUSES = ["pending", "accepted", "confirmed_by_client", "completed"] as const;
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export type BulkHall = {
  id: number;
  venueId: number;
  status: string;
  capacityMin: number | null;
  capacityMax: number | null;
  workingHours: Record<string, { open: string; close: string } | null> | null;
  bufferMinutes: number | null;
};

export type BulkSeating = {
  hallId: number;
  capacityMin: number | null;
  capacityMax: number | null;
  type?: string;
  labelRo?: string | null;
  labelRu?: string | null;
  labelEn?: string | null;
  notesRo?: string | null;
  notesRu?: string | null;
  notesEn?: string | null;
  sortOrder?: number;
};

export type BulkBlock = {
  venueId: number;
  hallId: number | null;
  startsAt: Date;
  endsAt: Date;
};

export type BulkBooking = {
  id: number;
  venueId: number;
  hallId: number | null;
  reservationScope: "hall" | "venue" | null;
  status: string;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  timezone: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
};

export type BulkConflictMember = {
  venueId: number;
  groupId: number;
  hallId: number;
};

export type BulkLegacyEvent = {
  venueId: number;
  hallId: number | null;
  date: string;
  status: string;
  source: string;
  startTime: string | null;
  endTime: string | null;
};

export type BulkVenue = {
  id: number;
  timezone: string | null;
  bufferMinutes: number | null;
  workingHours: Record<string, { open: string; close: string } | null> | null;
};

function isUsableAvailabilityHallStatus(status: string): boolean {
  return status === "active" || status === "pending";
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

export function hallCapacityFits(
  hall: BulkHall,
  seating: readonly BulkSeating[],
  guestCount: number | null | undefined,
): boolean {
  if (guestCount == null) return true;
  const hallOk =
    (hall.capacityMin == null || guestCount >= hall.capacityMin)
    && (hall.capacityMax == null || guestCount <= hall.capacityMax);
  if (seating.length === 0) return hallOk;
  return seating.some((option) => {
    const min = option.capacityMin ?? 0;
    const max = option.capacityMax ?? Number.POSITIVE_INFINITY;
    return guestCount >= min && guestCount <= max;
  });
}

export function parseCatalogInterval(opts: {
  eventDate: string;
  startTime: string;
  endTime: string;
  timezone: string | null | undefined;
}): CanonicalInterval | null {
  try {
    const interval = canonicalVenueIntervalStrict({
      eventDate: opts.eventDate,
      startTime: opts.startTime,
      endTime: opts.endTime,
      timezone: opts.timezone,
    });
    if (!(interval.endsAt.getTime() > interval.startsAt.getTime())) return null;
    return interval;
  } catch {
    return null;
  }
}

export function hallOccupancyAvailable(opts: {
  venue: BulkVenue;
  hall: BulkHall;
  halls: readonly BulkHall[];
  guestCount?: number | null;
  interval: CanonicalInterval;
  startTime: string;
  endTime: string;
  seating: readonly BulkSeating[];
  blocks: readonly BulkBlock[];
  bookings: readonly BulkBooking[];
  conflictMembers: readonly BulkConflictMember[];
  legacyEvents: readonly BulkLegacyEvent[];
}): boolean {
  if (opts.hall.status !== "active") return false;
  if (!hallCapacityFits(opts.hall, opts.seating, opts.guestCount)) return false;

  const timezone = opts.interval.timezone;
  const hours = opts.hall.workingHours ?? opts.venue.workingHours;
  if (opts.startTime && opts.endTime && hours) {
    const window = hoursWindow(hours, opts.interval.eventDate, timezone);
    if (window === null) return false;
    if (window !== "unset") {
      const open = canonicalVenueInterval({
        eventDate: opts.interval.eventDate,
        startTime: window.open,
        endTime: window.close,
        timezone,
      });
      if (opts.interval.startsAt < open.startsAt || opts.interval.endsAt > open.endsAt) {
        return false;
      }
    }
  }

  const venueBufferMinutes = opts.venue.bufferMinutes ?? DEFAULT_BUFFER_MINUTES;
  const requestBufferMinutes = opts.hall.bufferMinutes ?? venueBufferMinutes;
  const bufferedEnd = new Date(opts.interval.endsAt.getTime() + requestBufferMinutes * 60_000);
  const resolvedHallId = opts.hall.id;

  const venueHalls = opts.halls.filter((row) => row.venueId === opts.venue.id);
  const hallBufferMinutes = new Map(
    venueHalls.map((row) => [row.id, row.bufferMinutes ?? venueBufferMinutes]),
  );
  const archivedHallIds = new Set(
    venueHalls.filter((row) => row.status === "archived").map((row) => row.id),
  );
  const unusableHallIds = new Set(
    venueHalls.filter((row) => !isUsableAvailabilityHallStatus(row.status)).map((row) => row.id),
  );
  const venueMembers = opts.conflictMembers.filter((row) => row.venueId === opts.venue.id);
  const groupIds = [...new Set(
    venueMembers.filter((row) => row.hallId === resolvedHallId).map((row) => row.groupId),
  )];
  const incompatibleHallIds = [...new Set(
    venueMembers
      .filter((row) => groupIds.includes(row.groupId) && row.hallId !== resolvedHallId)
      .map((row) => row.hallId)
      .filter((hallId) => !archivedHallIds.has(hallId)),
  )];
  const conflictingUsableHallIds = incompatibleHallIds.filter((hallId) => !unusableHallIds.has(hallId));

  for (const block of opts.blocks) {
    if (block.venueId !== opts.venue.id) continue;
    if (!intervalsOverlapHalfOpen(opts.interval.startsAt, bufferedEnd, block.startsAt, block.endsAt)) continue;
    if (block.hallId == null) return false;
    if (unusableHallIds.has(block.hallId) && block.hallId !== resolvedHallId) continue;
    if (block.hallId === resolvedHallId) return false;
    if (conflictingUsableHallIds.includes(block.hallId)) return false;
  }

  for (const event of opts.legacyEvents) {
    if (event.venueId !== opts.venue.id) continue;
    if (event.source === "booking") continue;
    if (event.status !== "blocked" && event.status !== "booked") continue;
    const other = canonicalVenueInterval({
      eventDate: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
      timezone,
    });
    if (!intervalsOverlapHalfOpen(opts.interval.startsAt, bufferedEnd, other.startsAt, other.endsAt)) continue;
    if (event.hallId == null) return false;
    if (unusableHallIds.has(event.hallId) && event.hallId !== resolvedHallId) continue;
    if (event.hallId === resolvedHallId) return false;
    if (conflictingUsableHallIds.includes(event.hallId)) return false;
  }

  for (const booking of opts.bookings) {
    if (booking.venueId !== opts.venue.id) continue;
    if (!BLOCKING_STATUSES.includes(booking.status as (typeof BLOCKING_STATUSES)[number])) continue;
    const other = canonicalVenueInterval({
      eventDate: booking.eventDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      timezone: booking.timezone || timezone,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
    });
    const existingBufferMinutes =
      booking.reservationScope === "venue" || booking.hallId == null
        ? venueBufferMinutes
        : hallBufferMinutes.get(booking.hallId) ?? venueBufferMinutes;
    const otherEnd = new Date(other.endsAt.getTime() + existingBufferMinutes * 60_000);
    if (!intervalsOverlapHalfOpen(opts.interval.startsAt, bufferedEnd, other.startsAt, otherEnd)) continue;
    if (booking.reservationScope === "venue") return false;
    if (booking.hallId != null && unusableHallIds.has(booking.hallId) && booking.hallId !== resolvedHallId) {
      continue;
    }
    if (booking.hallId === resolvedHallId) return false;
    if (booking.hallId == null) return false;
    if (booking.hallId != null && conflictingUsableHallIds.includes(booking.hallId)) return false;
  }

  return true;
}
