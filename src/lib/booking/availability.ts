// Availability / time-slot conflict detection for artist bookings.
//
// Artist intervals are anchored to their event date. An end time at or before
// the start time is on the next calendar day (23:00-02:00 is overnight). A
// booking without a complete time range occupies its entire start date.

import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookingTextForViewer } from "@/lib/privacy/booking-text";
import {
  artists,
  bookingRequests,
  calendarEvents,
  workSchedule,
} from "@/lib/db/schema";

import { DEFAULT_BUFFER_MINUTES } from "@/lib/moldova-cities";

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

/**
 * Parse end-time. Same as `toMinutes` but maps "00:00" → 1440 (next-day
 * midnight) so a booking that ends at midnight is treated as ending at
 * the close of the day, not at the start. Also rolls forward when the
 * end <= start (e.g. 23:00–02:00 means 23:00 → 02:00 next day).
 */
function toEndMinutes(
  endTime: string | null | undefined,
  startMinutes: number | null,
): number | null {
  const raw = toMinutes(endTime);
  if (raw === null) return null;
  // Bare "00:00" without a startTime context → treat as next-day midnight
  if (raw === 0) return 24 * 60;
  if (startMinutes !== null && raw <= startMinutes) return raw + 24 * 60;
  return raw;
}

const MINUTES_PER_DAY = 24 * 60;

function isoDateDayNumber(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Invalid ISO date: ${date}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const canonical = new Date(timestamp).toISOString().slice(0, 10);
  if (canonical !== date) throw new Error(`Invalid ISO date: ${date}`);
  return Math.floor(timestamp / 86_400_000);
}

function shiftIsoDate(date: string, offsetDays: number): string {
  const dayNumber = isoDateDayNumber(date) + offsetDays;
  return new Date(dayNumber * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Rows starting the previous day can run into `eventDate`; rows starting on
 * `eventDate` can run into the next day. Artist buffers are capped well below
 * one day, so this three-day window is complete for an interval starting here.
 */
export function artistAvailabilityDateWindow(eventDate: string): string[] {
  return [shiftIsoDate(eventDate, -1), eventDate, shiftIsoDate(eventDate, 1)];
}

export type ArtistDailyTimeRange = Readonly<{
  start: string;
  end: string;
}>;

export type ArtistWorkScheduleEntry = Readonly<{
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isWorking: boolean;
}>;

function formatDayMinute(value: number): string {
  const normalized = ((value % MINUTES_PER_DAY) + MINUTES_PER_DAY)
    % MINUTES_PER_DAY;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(
    normalized % 60,
  ).padStart(2, "0")}`;
}

/** Project dated busy intervals onto one selected day. Overnight rows from
 * the previous date spill into 00:00+, while rows starting on the selected
 * date are clipped at next-day midnight. Identical booking/calendar
 * projections are deduplicated and no identifying fields are returned. */
export function projectArtistBusyRangesToDate(
  entries: readonly {
    eventDate: string;
    startTime: string | null;
    endTime: string | null;
  }[],
  selectedDate: string,
): { bookedRanges: ArtistDailyTimeRange[]; wholeDayBlocked: boolean } {
  const dayStart = isoDateDayNumber(selectedDate) * MINUTES_PER_DAY;
  const dayEnd = dayStart + MINUTES_PER_DAY;
  const ranges = new Map<string, ArtistDailyTimeRange>();
  let wholeDayBlocked = false;
  for (const entry of entries) {
    const interval = anchoredArtistInterval(
      entry.eventDate,
      entry.startTime,
      entry.endTime,
    );
    const start = Math.max(interval.start, dayStart);
    const end = Math.min(interval.end, dayEnd);
    if (start >= end) continue;
    if (start === dayStart && end === dayEnd) {
      wholeDayBlocked = true;
      continue;
    }
    const projected = {
      start: formatDayMinute(start - dayStart),
      // 00:00 is the canonical next-midnight representation accepted by the
      // booking validator; never serialize the invalid value 24:00.
      end: formatDayMinute(end - dayStart),
    };
    ranges.set(`${projected.start}-${projected.end}`, projected);
  }
  return {
    bookedRanges: [...ranges.values()].sort((left, right) =>
      left.start.localeCompare(right.start) || left.end.localeCompare(right.end)),
    wholeDayBlocked,
  };
}

function monStartDayOfWeek(date: string): number {
  const value = (isoDateDayNumber(date) + 3) % 7;
  return value < 0 ? value + 7 : value;
}

type ArtistWorkingScheduleProjection = Readonly<{
  configured: boolean;
  intervals: AnchoredArtistInterval[];
  ranges: ArtistDailyTimeRange[];
}>;

/** Build the effective working intervals touching a selected date. A shift
 * such as Monday 18:00–04:00 contributes Monday 18:00–00:00 and Tuesday
 * 00:00–04:00. A current-day row (including an explicit day off) keeps the
 * historical rule that a configured day is restrictive; an unrelated
 * previous-day daytime row does not. */
export function projectArtistWorkingScheduleToDate(
  entries: readonly ArtistWorkScheduleEntry[],
  selectedDate: string,
): ArtistWorkingScheduleProjection {
  const selectedDay = isoDateDayNumber(selectedDate);
  const selectedDow = monStartDayOfWeek(selectedDate);
  const previousDow = (selectedDow + 6) % 7;
  const currentRows = entries.filter((row) => row.dayOfWeek === selectedDow);
  const previousOvernightRows = entries.filter((row) => {
    if (row.dayOfWeek !== previousDow || !row.isWorking) return false;
    const start = toMinutes(row.startTime);
    const end = toMinutes(row.endTime);
    return start !== null && end !== null && end <= start;
  });
  const configured = currentRows.length > 0 || previousOvernightRows.length > 0;
  const intervals: AnchoredArtistInterval[] = [];
  for (const row of [...previousOvernightRows, ...currentRows]) {
    if (!row.isWorking) continue;
    const startMinute = toMinutes(row.startTime);
    const endMinute = toMinutes(row.endTime);
    if (startMinute === null || endMinute === null) continue;
    const startsPreviousDay = row.dayOfWeek === previousDow
      && !currentRows.includes(row);
    const base = (selectedDay + (startsPreviousDay ? -1 : 0))
      * MINUTES_PER_DAY;
    intervals.push({
      start: base + startMinute,
      end: base + endMinute + (endMinute <= startMinute ? MINUTES_PER_DAY : 0),
    });
  }

  const dayStart = selectedDay * MINUTES_PER_DAY;
  const dayEnd = dayStart + MINUTES_PER_DAY;
  const ranges = new Map<string, ArtistDailyTimeRange>();
  for (const interval of intervals) {
    const start = Math.max(interval.start, dayStart);
    const end = Math.min(interval.end, dayEnd);
    if (start >= end) continue;
    // Preserve the current day's overnight end (18:00–04:00) so booking UIs
    // can offer a duration crossing midnight. A spill that started yesterday
    // is clipped to today's 00:00–04:00 start window.
    const displayedEnd = interval.start >= dayStart
      ? interval.end - dayStart
      : end - dayStart;
    const range = {
      start: formatDayMinute(start - dayStart),
      end: formatDayMinute(displayedEnd),
    };
    ranges.set(`${range.start}-${range.end}`, range);
  }
  return {
    configured,
    intervals,
    ranges: [...ranges.values()].sort((left, right) =>
      left.start.localeCompare(right.start) || left.end.localeCompare(right.end)),
  };
}

export function isArtistSlotWithinWorkingSchedule(
  entries: readonly ArtistWorkScheduleEntry[],
  input: { eventDate: string; startTime: string; endTime: string },
): { allowed: boolean; configured: boolean; ranges: ArtistDailyTimeRange[] } {
  const projection = projectArtistWorkingScheduleToDate(entries, input.eventDate);
  if (!projection.configured) {
    return { allowed: true, configured: false, ranges: [] };
  }
  const target = anchoredArtistInterval(
    input.eventDate,
    input.startTime,
    input.endTime,
  );
  return {
    allowed: projection.intervals.some(
      (interval) => target.start >= interval.start && target.end <= interval.end,
    ),
    configured: true,
    ranges: projection.ranges,
  };
}

type AnchoredArtistInterval = Readonly<{ start: number; end: number }>;

function anchoredArtistInterval(
  eventDate: string,
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): AnchoredArtistInterval {
  const base = isoDateDayNumber(eventDate) * MINUTES_PER_DAY;
  const start = toMinutes(startTime);
  const end = toEndMinutes(endTime, start);
  if (start === null || end === null) {
    return { start: base, end: base + MINUTES_PER_DAY };
  }
  return { start: base + start, end: base + end };
}

function anchoredRangesOverlap(
  left: AnchoredArtistInterval,
  right: AnchoredArtistInterval,
  leftTrailingBuffer = 0,
  rightTrailingBuffer = 0,
): boolean {
  return (
    left.start < right.end + rightTrailingBuffer
    && right.start < left.end + leftTrailingBuffer
  );
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
  /** True if a booked calendar row occupies the requested interval. */
  calendarBusy?: boolean;
  /** True if the requested time falls outside working hours. */
  outsideWorkingHours?: boolean;
  /** Working hours for the requested day (when outsideWorkingHours = true). */
  workingHours?: { start: string; end: string } | null;
}

export interface ArtistCalendarBusyEntry {
  eventDate: string;
  status: "available" | "booked" | "tentative" | "blocked";
  bookingId: number | null;
  startTime: string | null;
  endTime: string | null;
}

/**
 * Find the first busy calendar row that overlaps a requested artist slot.
 *
 * Keep this pure so the overlap and self-exclusion rules can be tested without
 * a database. Calendar rows are projections/overrides, not just vacations:
 * both `blocked` and `booked` occupy time. An excluded booking projection must
 * not conflict with the booking currently being accepted or confirmed.
 */
export function findOverlappingArtistCalendarEntry(
  entries: readonly ArtistCalendarBusyEntry[],
  opts: {
    eventDate: string;
    startTime?: string | null;
    endTime?: string | null;
    excludeBookingId?: number;
    bufferMinutes?: number;
  },
): ArtistCalendarBusyEntry | undefined {
  const target = anchoredArtistInterval(
    opts.eventDate,
    opts.startTime,
    opts.endTime,
  );
  const bufferMinutes = Math.max(0, opts.bufferMinutes ?? 0);

  return entries.find((entry) => {
    if (entry.status !== "blocked" && entry.status !== "booked") {
      return false;
    }
    if (
      opts.excludeBookingId !== undefined
      && entry.bookingId === opts.excludeBookingId
    ) {
      return false;
    }
    const entryInterval = anchoredArtistInterval(
      entry.eventDate,
      entry.startTime,
      entry.endTime,
    );
    // Booking projections represent another gig and therefore need the same
    // symmetric turnaround buffer as booking rows. A manual block is exact.
    const bookingBuffer = entry.status === "booked" ? bufferMinutes : 0;
    return anchoredRangesOverlap(
      target,
      entryInterval,
      bookingBuffer,
      bookingBuffer,
    );
  });
}

export interface ArtistBookingBusyEntry {
  id: number;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
}

/** Pure booking-row counterpart used by the DB path and regression tests. */
export function findOverlappingArtistBooking<T extends ArtistBookingBusyEntry>(
  entries: readonly T[],
  opts: {
    eventDate: string;
    startTime?: string | null;
    endTime?: string | null;
    bufferMinutes?: number;
  },
): T | undefined {
  const target = anchoredArtistInterval(
    opts.eventDate,
    opts.startTime,
    opts.endTime,
  );
  const bufferMinutes = Math.max(0, opts.bufferMinutes ?? 0);
  return entries.find((entry) =>
    anchoredRangesOverlap(
      target,
      anchoredArtistInterval(
        entry.eventDate,
        entry.startTime,
        entry.endTime,
      ),
      bufferMinutes,
      bufferMinutes,
    ));
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
  /**
   * Accept/confirm already hold a pending/accepted row. Other pending
   * requests must not deadlock the artist out of choosing one overlapping
   * offer; accepted/confirmed rows still block.
   */
  ignorePendingBookings?: boolean;
  executor?: typeof db;
}): Promise<AvailabilityResult> {
  const { artistId, eventDate, excludeBookingId } = opts;
  const blockingStatuses = opts.ignorePendingBookings
    ? (["accepted", "confirmed_by_client"] as const)
    : BLOCKING_STATUSES;
  const q = opts.executor ?? db;
  const targetStart = toMinutes(opts.startTime);
  const targetEnd = toEndMinutes(opts.endTime, targetStart);

  // Pull the artist's turnaround buffer. It is applied to the trailing edge
  // of both compared gigs so the decision is independent of creation order.
  const [artistRow] = await q
    .select({ bufferMinutes: artists.bufferMinutes })
    .from(artists)
    .where(eq(artists.id, artistId))
    .limit(1);
  const artistBufferMinutes = artistRow?.bufferMinutes ?? DEFAULT_BUFFER_MINUTES;

  // 0. Check the artist's weekly working hours (if any are configured).
  // We only enforce this when the artist has at least one row in
  // work_schedule for the requested day-of-week — empty schedule means
  // "no working-hour restriction" (existing artists keep working).
  if (targetStart !== null && targetEnd !== null) {
    const dow = monStartDayOfWeek(eventDate);
    const previousDow = (dow + 6) % 7;
    const scheduleRows = await q
      .select({
        dayOfWeek: workSchedule.dayOfWeek,
        startTime: workSchedule.startTime,
        endTime: workSchedule.endTime,
        isWorking: workSchedule.isWorking,
      })
      .from(workSchedule)
      .where(
        and(
          eq(workSchedule.artistId, artistId),
          inArray(workSchedule.dayOfWeek, [previousDow, dow]),
        ),
      );
    const scheduleDecision = isArtistSlotWithinWorkingSchedule(scheduleRows, {
      eventDate,
      startTime: opts.startTime!,
      endTime: opts.endTime!,
    });
    if (!scheduleDecision.allowed) {
      return {
        available: false,
        outsideWorkingHours: true,
        workingHours: scheduleDecision.ranges[0] ?? null,
      };
    }
  }

  // 1. Calendar overrides and booking projections are both authoritative.
  // Read every row because the first one returned by PostgreSQL might be a
  // non-overlapping partial-day entry while a later row does overlap.
  const busyCalendarEntries = await q
    .select({
      eventDate: calendarEvents.date,
      status: calendarEvents.status,
      bookingId: calendarEvents.bookingId,
      startTime: calendarEvents.startTime,
      endTime: calendarEvents.endTime,
    })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.entityType, "artist"),
        eq(calendarEvents.entityId, artistId),
        inArray(calendarEvents.date, artistAvailabilityDateWindow(eventDate)),
        inArray(calendarEvents.status, ["blocked", "booked"]),
      ),
    );

  const busyCalendarEntry = findOverlappingArtistCalendarEntry(
    busyCalendarEntries,
    {
      eventDate,
      startTime: opts.startTime,
      endTime: opts.endTime,
      excludeBookingId,
      bufferMinutes: artistBufferMinutes,
    },
  );
  if (busyCalendarEntry?.status === "blocked") {
    return { available: false, dayBlocked: true };
  }
  if (busyCalendarEntry?.status === "booked") {
    return { available: false, calendarBusy: true };
  }

  // 2. Find active bookings whose anchored intervals can reach this request.
  const bookings = await q
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
        inArray(
          bookingRequests.eventDate,
          artistAvailabilityDateWindow(eventDate),
        ),
        inArray(bookingRequests.status, [...blockingStatuses]),
        excludeBookingId !== undefined
          ? ne(bookingRequests.id, excludeBookingId)
          : undefined,
      ),
    );

  // 3. Buffer both intervals' trailing edges. This is order-independent: if
  // A then B is rejected for an insufficient turnaround, B then A is too.
  const overlappingBooking = findOverlappingArtistBooking(bookings, {
    eventDate,
    startTime: opts.startTime,
    endTime: opts.endTime,
    bufferMinutes: artistBufferMinutes,
  });
  if (overlappingBooking) {
    return {
      available: false,
      conflict: {
        bookingId: overlappingBooking.id,
        eventDate: overlappingBooking.eventDate,
        startTime: overlappingBooking.startTime,
        endTime: overlappingBooking.endTime,
        clientName: bookingTextForViewer(overlappingBooking.clientName, false),
        status: overlappingBooking.status,
      },
    };
  }

  return { available: true };
}

/**
 * Check whether a venue is available for the given date + time slot.
 * Delegates to the hall-aware service (phase 4 single source of truth).
 */
export async function checkVenueAvailability(opts: {
  venueId: number;
  hallId?: number | null;
  guestCount?: number | null;
  eventDate: string;
  startTime?: string | null;
  endTime?: string | null;
  excludeBookingId?: number;
}): Promise<AvailabilityResult> {
  const { evaluateVenueAvailability } = await import("./venue-availability");
  const result = await evaluateVenueAvailability({
    ...opts,
    mode: "owner",
  });
  if (result.available) return { available: true };
  if (result.code === "OUTSIDE_HOURS") {
    return { available: false, outsideWorkingHours: true };
  }
  if (result.code === "VENUE_BLOCK" || result.code === "HALL_BLOCK") {
    return { available: false, dayBlocked: true };
  }
  return {
    available: false,
    conflict: result.conflictBookingId
      ? {
          bookingId: result.conflictBookingId,
          eventDate: opts.eventDate,
          startTime: opts.startTime ?? null,
          endTime: opts.endTime ?? null,
          clientName: "client",
          status: "pending",
        }
      : undefined,
  };
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
  if (result.calendarBusy) {
    return "Acest interval este deja rezervat în calendar.";
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
