import { localDateInZone, zonedWallTimeToUtc } from "./zoned-interval";

export type VenueScheduleBlockIcal =
  | { allDay: false }
  | { allDay: true; startDate: string; endDateExclusive: string };

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
