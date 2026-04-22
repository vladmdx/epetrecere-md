// Availability / time-slot conflict detection for artist bookings.
//
// Two bookings conflict if they are on the same date AND their time
// ranges overlap. A booking without startTime/endTime is treated as
// occupying the whole day.

import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookingRequests, calendarEvents } from "@/lib/db/schema";

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
}

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

/** Human-readable error message for a conflict. */
export function formatConflictMessage(result: AvailabilityResult): string {
  if (result.available) return "";
  if (result.dayBlocked) {
    return "Această zi este blocată de artist (vacanță).";
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
    return `Conflict: artistul are deja o rezervare ${statusLabel} în acest interval (${timeRange}) pentru ${clientName}.`;
  }
  return "Artistul nu este disponibil în acest interval.";
}
