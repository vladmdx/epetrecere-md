/**
 * Convert venue-local wall times to UTC instants, including overnight and DST.
 */

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
    const startsAt = zonedWallTimeToUtc(eventDate, "00:00", timezone);
    const endsAt = zonedWallTimeToUtc(addLocalDays(eventDate, 1), "00:00", timezone);
    return { startsAt, endsAt, timezone, eventDate, startTime: null, endTime: null };
  }
  const start = zonedWallTimeToUtc(eventDate, startTime || "00:00", timezone);
  let endDate = eventDate;
  let endClock = endTime || "00:00";
  if (!endTime) {
    endDate = addLocalDays(eventDate, 1);
    endClock = "00:00";
  } else if (endTime <= (startTime || "00:00")) {
    endDate = addLocalDays(eventDate, 1);
  }
  const endsAt = zonedWallTimeToUtc(endDate, endClock, timezone);
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
