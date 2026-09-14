/**
 * Convert venue-local wall times to UTC instants, including overnight and DST.
 */

import {
  isValidCalendarDate,
  isValidCalendarTime,
  isValidIanaTimeZone,
} from "./calendar-input-validation";

export const DEFAULT_VENUE_TZ = "Europe/Chisinau";

function tzOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const num = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const hour = num("hour") % 24;
  const asUtc = Date.UTC(num("year"), num("month") - 1, num("day"), hour, num("minute"), num("second"));
  return asUtc - utcMs;
}

/** Interpret a wall-clock date+time in `timeZone` as a UTC Date. */
export function zonedWallTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = (time || "00:00").split(":").map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const first = tzOffsetMs(utcGuess, timeZone);
  let instant = utcGuess - first;
  const second = tzOffsetMs(instant, timeZone);
  if (second !== first) instant = utcGuess - second;
  return new Date(instant);
}

function localDateTimeInZone(instant: Date, timeZone: string): {
  date: string;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    // Some ICU builds format midnight as 24:00. It is still the start of the
    // formatted calendar date for our purposes.
    hour: Number(value("hour")) % 24,
    minute: Number(value("minute")),
    second: Number(value("second")),
  };
}

/**
 * Earliest representable instant of a venue-local calendar date.
 *
 * Midnight is not guaranteed to exist: some IANA zones advance their clocks
 * at 00:00 (for example America/Santiago on 2026-09-06). In that case an
 * all-day interval begins at the first valid wall time on the intended local
 * date instead of silently landing on the preceding date.
 */
export function startOfLocalDayUtc(date: string, timeZone: string): Date {
  const midnightCandidate = zonedWallTimeToUtc(date, "00:00", timeZone);
  const midnightLocal = localDateTimeInZone(midnightCandidate, timeZone);
  if (
    midnightLocal.date === date &&
    midnightLocal.hour === 0 &&
    midnightLocal.minute === 0 &&
    midnightLocal.second === 0
  ) {
    return midnightCandidate;
  }

  // Noon is deliberately used only as an interior point of the intended
  // local date. From there, find the first instant whose formatted date is the
  // requested date. This handles a midnight DST gap without guessing its size.
  let inside = zonedWallTimeToUtc(date, "12:00", timeZone).getTime();
  if (localDateInZone(new Date(inside), timeZone) !== date) {
    const [year, month, day] = date.split("-").map(Number);
    const utcNoon = Date.UTC(year, month - 1, day, 12, 0, 0);
    let found: number | null = null;
    for (let hours = -36; hours <= 36; hours += 1) {
      const candidate = utcNoon + hours * 60 * 60 * 1000;
      if (localDateInZone(new Date(candidate), timeZone) === date) {
        found = candidate;
        break;
      }
    }
    if (found == null) {
      throw new RangeError(`Local calendar date ${date} does not exist in ${timeZone}`);
    }
    inside = found;
  }

  let outside = inside - 6 * 60 * 60 * 1000;
  for (let attempts = 0; attempts < 8 && localDateInZone(new Date(outside), timeZone) === date; attempts += 1) {
    inside = outside;
    outside -= 6 * 60 * 60 * 1000;
  }
  if (localDateInZone(new Date(outside), timeZone) === date) {
    throw new RangeError(`Could not resolve the start of ${date} in ${timeZone}`);
  }

  // `outside` is before the date and `inside` is within it. Locate the exact
  // millisecond boundary without assuming that the first wall time is 00:00.
  while (inside - outside > 1) {
    const middle = Math.floor((outside + inside) / 2);
    if (localDateInZone(new Date(middle), timeZone) === date) {
      inside = middle;
    } else {
      outside = middle;
    }
  }
  return new Date(inside);
}

export function addLocalDays(date: string, days: number): string {
  const utc = zonedWallTimeToUtc(date, "12:00", "UTC");
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export function localDateInZone(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const num = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${num("year")}-${num("month")}-${num("day")}`;
}

export type CanonicalInterval = {
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
};

export class VenueIntervalValidationError extends RangeError {
  readonly code = "INVALID_INTERVAL";

  constructor(message: string) {
    super(message);
    this.name = "VenueIntervalValidationError";
  }
}

function parsedInstant(value: Date | string | null | undefined): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null;
  }
  if (
    typeof value !== "string"
    || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
  ) {
    return null;
  }
  const instant = new Date(value);
  return Number.isFinite(instant.getTime()) ? instant : null;
}

function wallClockInZone(instant: Date, timeZone: string): string {
  const local = localDateTimeInZone(instant, timeZone);
  return `${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`;
}

/**
 * Catalog and schedule writes share one DST policy:
 * - a spring-forward gap has no valid instant and is rejected;
 * - a fall-back fold has two valid instants; we always take the earlier one.
 */
export const VENUE_DST_FOLD_POLICY = "earlier" as const;

function wallTimeMatches(
  instant: Date,
  date: string,
  time: string,
  timeZone: string,
): boolean {
  const local = localDateTimeInZone(instant, timeZone);
  return (
    local.date === date
    && wallClockInZone(instant, timeZone) === time
    && local.second === 0
  );
}

function strictZonedWallTimeToUtc(
  date: string,
  time: string,
  timeZone: string,
): Date {
  const guessed = zonedWallTimeToUtc(date, time, timeZone);
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const matches: Date[] = [];

  // Do not assume a one-hour DST transition. IANA contains zones with
  // 30-minute folds (for example Australia/Lord_Howe) and historical larger
  // changes. Sampling offsets around the local date gives the exact candidate
  // instants without scanning every minute of the surrounding days.
  const offsets = new Set<number>();
  for (let hours = -72; hours <= 72; hours += 6) {
    offsets.add(tzOffsetMs(wallClockAsUtc + hours * 60 * 60 * 1000, timeZone));
  }
  offsets.add(tzOffsetMs(guessed.getTime(), timeZone));
  for (const offset of offsets) {
    const candidate = new Date(wallClockAsUtc - offset);
    if (!wallTimeMatches(candidate, date, time, timeZone)) continue;
    if (!matches.some((item) => item.getTime() === candidate.getTime())) {
      matches.push(candidate);
    }
  }
  if (matches.length === 0) {
    throw new VenueIntervalValidationError(
      `Local time ${date} ${time} does not exist in ${timeZone}.`,
    );
  }
  matches.sort((left, right) => left.getTime() - right.getTime());
  return matches[0]!;
}

/**
 * Strict schedule-write boundary around the legacy-compatible interval
 * converter. It rejects malformed input and nonexistent DST wall times rather
 * than allowing Date/Intl to normalize them into another day or hour.
 */
export function canonicalVenueIntervalStrict(opts: {
  eventDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  timezone?: string | null;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
}): CanonicalInterval {
  const timezone = opts.timezone ?? DEFAULT_VENUE_TZ;
  if (!isValidIanaTimeZone(timezone)) {
    throw new VenueIntervalValidationError("Timezone must be a valid IANA identifier.");
  }

  const hasStartsAt = opts.startsAt !== undefined && opts.startsAt !== null;
  const hasEndsAt = opts.endsAt !== undefined && opts.endsAt !== null;
  if (hasStartsAt !== hasEndsAt) {
    throw new VenueIntervalValidationError(
      "startsAt and endsAt must be provided together.",
    );
  }

  const hasStartTime = opts.startTime !== undefined && opts.startTime !== null;
  const hasEndTime = opts.endTime !== undefined && opts.endTime !== null;
  if (hasStartTime && !isValidCalendarTime(opts.startTime)) {
    throw new VenueIntervalValidationError("startTime must use HH:mm.");
  }
  if (hasEndTime && !isValidCalendarTime(opts.endTime)) {
    throw new VenueIntervalValidationError("endTime must use HH:mm.");
  }

  if (hasStartsAt && hasEndsAt) {
    const startsAt = parsedInstant(opts.startsAt);
    const endsAt = parsedInstant(opts.endsAt);
    if (!startsAt || !endsAt) {
      throw new VenueIntervalValidationError(
        "startsAt and endsAt must be valid ISO instants with an offset.",
      );
    }
    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new VenueIntervalValidationError("endsAt must be after startsAt.");
    }
    const startDate = localDateInZone(startsAt, timezone);
    if (opts.eventDate != null && opts.eventDate !== "") {
      if (!isValidCalendarDate(opts.eventDate) || opts.eventDate !== startDate) {
        throw new VenueIntervalValidationError(
          "eventDate must be the startsAt calendar date in the venue timezone.",
        );
      }
    }
    if (hasStartTime && wallClockInZone(startsAt, timezone) !== opts.startTime) {
      throw new VenueIntervalValidationError(
        "startTime must match startsAt in the venue timezone.",
      );
    }
    if (hasEndTime && wallClockInZone(endsAt, timezone) !== opts.endTime) {
      throw new VenueIntervalValidationError(
        "endTime must match endsAt in the venue timezone.",
      );
    }
    return {
      startsAt,
      endsAt,
      timezone,
      eventDate: startDate,
      startTime: opts.startTime ?? null,
      endTime: opts.endTime ?? null,
    };
  }

  if (!isValidCalendarDate(opts.eventDate)) {
    throw new VenueIntervalValidationError(
      "eventDate must be a real YYYY-MM-DD calendar date.",
    );
  }
  const eventDate = opts.eventDate;
  if (hasStartTime && hasEndTime) {
    const startsAt = strictZonedWallTimeToUtc(eventDate, opts.startTime!, timezone);
    const endDate =
      opts.endTime! <= opts.startTime!
        ? addLocalDays(eventDate, 1)
        : eventDate;
    const endsAt = strictZonedWallTimeToUtc(endDate, opts.endTime!, timezone);
    if (!(endsAt.getTime() > startsAt.getTime())) {
      throw new VenueIntervalValidationError("Interval end must be after its start.");
    }
    return {
      startsAt,
      endsAt,
      timezone,
      eventDate,
      startTime: opts.startTime ?? null,
      endTime: opts.endTime ?? null,
    };
  }

  if (hasStartTime) {
    strictZonedWallTimeToUtc(eventDate, opts.startTime!, timezone);
  }
  if (hasEndTime) {
    const endDate =
      opts.endTime! <= (opts.startTime ?? "00:00")
        ? addLocalDays(eventDate, 1)
        : eventDate;
    strictZonedWallTimeToUtc(endDate, opts.endTime!, timezone);
  }

  const interval = canonicalVenueInterval({
    eventDate,
    startTime: opts.startTime,
    endTime: opts.endTime,
    timezone,
  });
  if (!(interval.endsAt.getTime() > interval.startsAt.getTime())) {
    throw new VenueIntervalValidationError("Interval end must be after its start.");
  }
  return interval;
}

/**
 * Half-open [startsAt, endsAt). Full-day → next local midnight.
 * Overnight (end <= start, both times present) → end is the next local day.
 */
export function canonicalVenueInterval(opts: {
  eventDate: string;
  startTime?: string | null;
  endTime?: string | null;
  timezone?: string | null;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
}): CanonicalInterval {
  const timezone = opts.timezone?.trim() || DEFAULT_VENUE_TZ;
  if (opts.startsAt && opts.endsAt) {
    const startsAt = opts.startsAt instanceof Date ? opts.startsAt : new Date(opts.startsAt);
    const endsAt = opts.endsAt instanceof Date ? opts.endsAt : new Date(opts.endsAt);
    return {
      startsAt,
      endsAt,
      timezone,
      eventDate: opts.eventDate || localDateInZone(startsAt, timezone),
      startTime: opts.startTime ?? null,
      endTime: opts.endTime ?? null,
    };
  }
  const eventDate = opts.eventDate;
  const startTime = opts.startTime ?? null;
  const endTime = opts.endTime ?? null;
  if (!startTime && !endTime) {
    const startsAt = startOfLocalDayUtc(eventDate, timezone);
    const endsAt = startOfLocalDayUtc(addLocalDays(eventDate, 1), timezone);
    return { startsAt, endsAt, timezone, eventDate, startTime: null, endTime: null };
  }
  const startClock = startTime || "00:00";
  const start = startClock === "00:00"
    ? startOfLocalDayUtc(eventDate, timezone)
    : zonedWallTimeToUtc(eventDate, startClock, timezone);
  let endDate = eventDate;
  let endClock = endTime || "00:00";
  if (!endTime) {
    endDate = addLocalDays(eventDate, 1);
    endClock = "00:00";
  } else if (endTime <= (startTime || "00:00")) {
    endDate = addLocalDays(eventDate, 1);
  }
  const endsAt = endClock === "00:00"
    ? startOfLocalDayUtc(endDate, timezone)
    : zonedWallTimeToUtc(endDate, endClock, timezone);
  return { startsAt: start, endsAt, timezone, eventDate, startTime, endTime };
}

export function intervalsOverlapHalfOpen(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export function localDatesIntersecting(interval: CanonicalInterval): string[] {
  const dates: string[] = [];
  let cursor = localDateInZone(interval.startsAt, interval.timezone);
  const last = localDateInZone(new Date(interval.endsAt.getTime() - 1), interval.timezone);
  dates.push(cursor);
  while (cursor < last) {
    cursor = addLocalDays(cursor, 1);
    dates.push(cursor);
  }
  return dates;
}

export function weekdayMonStart(date: string, timeZone: string): number {
  const noon = zonedWallTimeToUtc(date, "12:00", timeZone);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(noon);
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday);
}
