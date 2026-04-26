// Availability / time-slot conflict detection for artist bookings.
//
// Two bookings conflict if they are on the same date AND their time
// ranges overlap. A booking without startTime/endTime is treated as
// occupying the whole day.

import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  bookingRequests,
  calendarEvents,
  workSchedule,
  venues,
} from "@/lib/db/schema";

/** Booking statuses that "hold" a time slot — can't be double-booked. */
const BLOCKING_STATUSES = [
  "pending",
  "accepted",
  "confirmed_by_client",
] as const;

/** Parse "HH:MM" to minutes since midnight. */
function toMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

/** Check if two time ranges [a1, a2] and [b1, b2] overlap. Null = whole day. */
function rangesOverlap(
  a1: number | null,
  a2: number | null,
  b1: number | null,
  b2: number | null,
): boolean {
  // If either range is whole-day, they conflict
  if (a1 === null || a2 === null || b1 === null || b2 === null) return true;
  return a1 < b2 && b1 < a2;
}

export interface ConflictInfo {
  bookingId: number;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  clientName: string;
  status: string;
}

export interface AvailabilityResult {
  available: boolean;
  conflict?: ConflictInfo;
  /** True if the day is blocked by the artist (vacation / manually blocked). */
  dayBlocked?: boolean;
  /** True if the requested time falls outside working hours. */
  outsideWorkingHours?: boolean;
  /** Working hours for the requested day (when outsideWorkingHours = true). */
  workingHours?: { start: string; end: string } | null;
}

/**
 * Get day-of-week index used by work_schedule (0=Mon … 6=Sun).
 * JS Date.getDay() returns 0=Sun … 6=Sat, so remap.
 */
function dayOfWeekMonStart(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  const js = d.getDay(); // 0=Sun..6=Sat
  return (js + 6) % 7; // 0=Mon..6=Sun
}

const VENUE_DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/**
 * Check whether an artist is available for the given date + time slot.
 *
 * Returns `available: true` if no conflicting booking exists and the day
 * is not blocked. Ignores bookings matching `excludeBookingId` — useful
 * when updating an existing booking.
 */
export async function checkArtistAvailability(opts: {
  artistId: number;
  eventDate: string;
  startTime?: string | null;
  endTime?: string | null;
  excludeBookingId?: number;
}): Promise<AvailabilityResult> {
  const { artistId, eventDate, excludeBookingId } = opts;
  const targetStart = toMinutes(opts.startTime);
  const targetEnd = toMinutes(opts.endTime);

  // 0. Check the artist's weekly working hours (if any are configured).
  // We only enforce this when the artist has at least one row in
  // work_schedule for the requested day-of-week — empty schedule means
  // "no working-hour restriction" (existing artists keep working).
  if (targetStart !== null && targetEnd !== null) {
    const dow = dayOfWeekMonStart(eventDate);
    const [scheduleRow] = await db
      .select({
        startTime: workSchedule.startTime,
        endTime: workSchedule.endTime,
        isWorking: workSchedule.isWorking,
      })
      .from(workSchedule)
      .where(
        and(
          eq(workSchedule.artistId, artistId),
          eq(workSchedule.dayOfWeek, dow),
        ),
      )
      .limit(1);

    if (scheduleRow) {
      if (!scheduleRow.isWorking) {
        return {
          available: false,
          outsideWorkingHours: true,
          workingHours: null,
        };
      }
      const wsStart = toMinutes(scheduleRow.startTime);
      const wsEnd = toMinutes(scheduleRow.endTime);
      // Treat 00:00 end as midnight (end of day)
      const wsEndAdjusted = wsEnd === 0 ? 24 * 60 : wsEnd;
      if (
        wsStart !== null &&
        wsEndAdjusted !== null &&
        (targetStart < wsStart || targetEnd > wsEndAdjusted)
      ) {
        return {
          available: false,
          outsideWorkingHours: true,
          workingHours: {
            start: scheduleRow.startTime,
            end: scheduleRow.endTime,
          },
        };
      }
    }
  }

  // 1. Check if the day is blocked on the calendar (vacation etc.)
  const [blockedEntry] = await db
    .select({
      status: calendarEvents.status,
      startTime: calendarEvents.startTime,
      endTime: calendarEvents.endTime,
    })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.entityType, "artist"),
        eq(calendarEvents.entityId, artistId),
        eq(calendarEvents.date, eventDate),
        eq(calendarEvents.status, "blocked"),
      ),
    )
    .limit(1);

  if (blockedEntry) {
    // If the block is time-bounded, check for overlap
    const blockStart = toMinutes(blockedEntry.startTime);
    const blockEnd = toMinutes(blockedEntry.endTime);
    if (rangesOverlap(targetStart, targetEnd, blockStart, blockEnd)) {
      return { available: false, dayBlocked: true };
    }
  }

  // 2. Find all active bookings for this artist on this date
  const bookings = await db
    .select({
      id: bookingRequests.id,
      eventDate: bookingRequests.eventDate,
      startTime: bookingRequests.startTime,
      endTime: bookingRequests.endTime,
      clientName: bookingRequests.clientName,
      status: bookingRequests.status,
    })
    .from(bookingRequests)
    .where(
      and(
        eq(bookingRequests.artistId, artistId),
        eq(bookingRequests.eventDate, eventDate),
        inArray(bookingRequests.status, [...BLOCKING_STATUSES]),
        excludeBookingId !== undefined
          ? ne(bookingRequests.id, excludeBookingId)
          : undefined,
      ),
    );

  // 3. Check each for overlap
  for (const b of bookings) {
    const bStart = toMinutes(b.startTime);
    const bEnd = toMinutes(b.endTime);
    if (rangesOverlap(targetStart, targetEnd, bStart, bEnd)) {
      return {
        available: false,
        conflict: {
          bookingId: b.id,
          eventDate: b.eventDate,
          startTime: b.startTime,
          endTime: b.endTime,
          clientName: b.clientName,
          status: b.status,
        },
      };
    }
  }

  return { available: true };
}

/**
 * Check whether a venue is available for the given date + time slot.
 * Validates against the venue's working_hours JSONB and existing bookings.
 */
export async function checkVenueAvailability(opts: {
  venueId: number;
  eventDate: string;
  startTime?: string | null;
  endTime?: string | null;
  excludeBookingId?: number;
}): Promise<AvailabilityResult> {
  const { venueId, eventDate, excludeBookingId } = opts;
  const targetStart = toMinutes(opts.startTime);
  const targetEnd = toMinutes(opts.endTime);

  // 0. Check venue working hours
  if (targetStart !== null && targetEnd !== null) {
    const [venue] = await db
      .select({ workingHours: venues.workingHours })
      .from(venues)
      .where(eq(venues.id, venueId))
      .limit(1);

    if (venue?.workingHours) {
      const dow = dayOfWeekMonStart(eventDate);
      const dayKey = VENUE_DAY_KEYS[dow];
      const day = venue.workingHours[dayKey];
      if (day === null) {
        return {
          available: false,
          outsideWorkingHours: true,
          workingHours: null,
        };
      }
      if (day) {
        const wsStart = toMinutes(day.open);
        const wsEnd = toMinutes(day.close);
        const wsEndAdjusted = wsEnd === 0 ? 24 * 60 : wsEnd;
        if (
          wsStart !== null &&
          wsEndAdjusted !== null &&
          (targetStart < wsStart || targetEnd > wsEndAdjusted)
        ) {
          return {
            available: false,
            outsideWorkingHours: true,
            workingHours: { start: day.open, end: day.close },
          };
        }
      }
    }
  }

  // 1. Existing booking conflicts on the venue
  const bookings = await db
    .select({
      id: bookingRequests.id,
      eventDate: bookingRequests.eventDate,
      startTime: bookingRequests.startTime,
      endTime: bookingRequests.endTime,
      clientName: bookingRequests.clientName,
      status: bookingRequests.status,
    })
    .from(bookingRequests)
    .where(
      and(
        eq(bookingRequests.venueId, venueId),
        eq(bookingRequests.eventDate, eventDate),
        inArray(bookingRequests.status, [...BLOCKING_STATUSES]),
        excludeBookingId !== undefined
          ? ne(bookingRequests.id, excludeBookingId)
          : undefined,
      ),
    );

  for (const b of bookings) {
    const bStart = toMinutes(b.startTime);
    const bEnd = toMinutes(b.endTime);
    if (rangesOverlap(targetStart, targetEnd, bStart, bEnd)) {
      return {
        available: false,
        conflict: {
          bookingId: b.id,
          eventDate: b.eventDate,
          startTime: b.startTime,
          endTime: b.endTime,
          clientName: b.clientName,
          status: b.status,
        },
      };
    }
  }

  return { available: true };
}

/** Human-readable error message for a conflict. */
export function formatConflictMessage(result: AvailabilityResult): string {
  if (result.available) return "";
  if (result.outsideWorkingHours) {
    if (result.workingHours) {
      return `Intervalul cerut este în afara orelor de lucru (${result.workingHours.start}–${result.workingHours.end}). Te rugăm să alegi un alt interval.`;
    }
    return "În această zi nu se acceptă rezervări (zi liberă conform programului).";
  }
  if (result.dayBlocked) {
    return "Această zi este blocată (vacanță).";
  }
  if (result.conflict) {
    const { startTime, endTime, clientName, status } = result.conflict;
    const timeRange =
      startTime && endTime ? `${startTime}–${endTime}` : "toată ziua";
    const statusLabel =
      status === "pending"
        ? "în așteptare"
        : status === "accepted"
          ? "acceptată"
          : status === "confirmed_by_client"
            ? "confirmată"
            : status;
    return `Conflict: există deja o rezervare ${statusLabel} în acest interval (${timeRange}) pentru ${clientName}.`;
  }
  return "Acest interval nu este disponibil.";
}
