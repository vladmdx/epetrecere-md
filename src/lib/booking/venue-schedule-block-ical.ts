import { DEFAULT_VENUE_TZ, localDateInZone, zonedWallTimeToUtc } from "./zoned-interval";

export type VenueScheduleBlockIcal =
  | { allDay: false }
  | { allDay: true; startDate: string; endDateExclusive: string };

function resolvedIanaTimeZone(value: string): string | null {
  try {
    // `Intl.supportedValuesOf("timeZone")` is not a validation API: engines
    // may omit valid aliases such as UTC, Etc/UTC, or US/Eastern. Let the
    // formatter validate and canonicalize the exact value instead.
    return new Intl.DateTimeFormat("en-US", { timeZone: value })
      .resolvedOptions()
      .timeZone;
  } catch {
    return null;
  }
}

/** Venue IANA zone for iCal. Invalid or empty legacy values fall back safely. */
export function canonicalVenueIcalTimeZone(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return DEFAULT_VENUE_TZ;
  return resolvedIanaTimeZone(trimmed) ?? DEFAULT_VENUE_TZ;
}

/**
 * All-day iCal (VALUE=DATE) is allowed only when both bounds are exact local
 * midnight and the exclusive end is a later local calendar day.
 * Duration is irrelevant: 20h+ and multi-day partial intervals stay timed.
 */
export function classifyVenueScheduleBlockIcal(
  startsAt: Date,
  endsAt: Date,
  timeZone: string,
): VenueScheduleBlockIcal {
  const startDate = localDateInZone(startsAt, timeZone);
  const endDate = localDateInZone(endsAt, timeZone);
  const startMidnight = zonedWallTimeToUtc(startDate, "00:00", timeZone);
  const endMidnight = zonedWallTimeToUtc(endDate, "00:00", timeZone);
  if (
    startsAt.getTime() === startMidnight.getTime() &&
    endsAt.getTime() === endMidnight.getTime() &&
    endDate > startDate
  ) {
    return { allDay: true, startDate, endDateExclusive: endDate };
  }
  return { allDay: false };
}

export function icsDateValue(isoDate: string): string {
  return isoDate.replaceAll("-", "");
}
