import assert from "node:assert/strict";
import { test } from "node:test";
import { zonedWallTimeToUtc } from "../src/lib/booking/zoned-interval";
import {
  classifyVenueScheduleBlockIcal,
  icsDateValue,
} from "../src/lib/booking/venue-schedule-block-ical";
import { readFileSync } from "node:fs";

const TZ = "Europe/Chisinau";

function interval(startDate: string, startTime: string, endDate: string, endTime: string) {
  return {
    startsAt: zonedWallTimeToUtc(startDate, startTime, TZ),
    endsAt: zonedWallTimeToUtc(endDate, endTime, TZ),
  };
}

test("Europe/Chisinau: 2h block is timed", () => {
  const { startsAt, endsAt } = interval("2026-06-01", "18:00", "2026-06-01", "20:00");
  assert.deepEqual(classifyVenueScheduleBlockIcal(startsAt, endsAt, TZ), { allDay: false });
});

test("Europe/Chisinau: 20h with non-midnight start stays timed", () => {
  const { startsAt, endsAt } = interval("2026-06-01", "04:00", "2026-06-02", "00:00");
  assert.equal(endsAt.getTime() - startsAt.getTime(), 20 * 60 * 60 * 1000);
  assert.deepEqual(classifyVenueScheduleBlockIcal(startsAt, endsAt, TZ), { allDay: false });
});

test("Europe/Chisinau: partial multi-day interval stays timed", () => {
  const { startsAt, endsAt } = interval("2026-06-01", "22:00", "2026-06-03", "10:00");
  assert.deepEqual(classifyVenueScheduleBlockIcal(startsAt, endsAt, TZ), { allDay: false });
});

test("Europe/Chisinau: midnight-to-midnight is all-day with exclusive DTEND", () => {
  const { startsAt, endsAt } = interval("2026-06-01", "00:00", "2026-06-02", "00:00");
  assert.deepEqual(classifyVenueScheduleBlockIcal(startsAt, endsAt, TZ), {
    allDay: true,
    startDate: "2026-06-01",
    endDateExclusive: "2026-06-02",
  });
  assert.equal(icsDateValue("2026-06-02"), "20260602");
});

test("Europe/Chisinau: multi-day both bounds midnight is all-day", () => {
  const { startsAt, endsAt } = interval("2026-06-01", "00:00", "2026-06-04", "00:00");
  assert.deepEqual(classifyVenueScheduleBlockIcal(startsAt, endsAt, TZ), {
    allDay: true,
    startDate: "2026-06-01",
    endDateExclusive: "2026-06-04",
  });
});

test("Europe/Chisinau: DST spring-forward midnight-to-midnight is all-day by local time", () => {
  const { startsAt, endsAt } = interval("2026-03-29", "00:00", "2026-03-30", "00:00");
  assert.equal(endsAt.getTime() - startsAt.getTime(), 23 * 60 * 60 * 1000);
  assert.deepEqual(classifyVenueScheduleBlockIcal(startsAt, endsAt, TZ), {
    allDay: true,
    startDate: "2026-03-29",
    endDateExclusive: "2026-03-30",
  });
});

test("venue iCal route dropped the 20h duration heuristic", () => {
  const source = readFileSync("src/app/api/calendar/venue-ical/[venueId]/[token]/route.ts", "utf8");
  assert.doesNotMatch(source, /20 \* 60 \* 60/);
  assert.match(source, /classifyVenueScheduleBlockIcal/);
});
