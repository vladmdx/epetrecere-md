import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isValidCalendarDate,
  isValidCalendarTime,
  isValidIanaTimeZone,
} from "../src/lib/booking/calendar-input-validation";
import {
  canonicalVenueIntervalStrict,
  VenueIntervalValidationError,
} from "../src/lib/booking/zoned-interval";

test("shared primitives require real dates, HH:mm clocks and IANA zones", () => {
  assert.equal(isValidCalendarDate("2028-02-29"), true);
  assert.equal(isValidCalendarDate("2027-02-29"), false);
  assert.equal(isValidCalendarTime("23:59"), true);
  assert.equal(isValidCalendarTime("24:00"), false);
  assert.equal(isValidCalendarTime("9:30"), false);
  assert.equal(isValidIanaTimeZone("Europe/Chisinau"), true);
  assert.equal(isValidIanaTimeZone("Mars/Olympus"), false);
  assert.equal(isValidIanaTimeZone(" Europe/Chisinau"), false);
});

test("strict venue intervals reject malformed values before any write", () => {
  for (const input of [
    { eventDate: "2027-02-29", timezone: "Europe/Chisinau" },
    { eventDate: "2027-02-28", startTime: "25:00", timezone: "Europe/Chisinau" },
    { eventDate: "2027-02-28", timezone: "Mars/Olympus" },
  ]) {
    assert.throws(
      () => canonicalVenueIntervalStrict(input),
      VenueIntervalValidationError,
    );
  }
});

test("strict venue intervals require paired ordered ISO instants", () => {
  assert.throws(
    () => canonicalVenueIntervalStrict({
      startsAt: "2026-10-01T15:00:00Z",
      timezone: "Europe/Chisinau",
    }),
    /provided together/,
  );
  assert.throws(
    () => canonicalVenueIntervalStrict({
      startsAt: "2026-10-01T16:00:00Z",
      endsAt: "2026-10-01T15:00:00Z",
      timezone: "Europe/Chisinau",
    }),
    /after startsAt/,
  );
  assert.throws(
    () => canonicalVenueIntervalStrict({
      startsAt: "2026-10-01T15:00:00",
      endsAt: "2026-10-01T16:00:00",
      timezone: "Europe/Chisinau",
    }),
    /with an offset/,
  );

  const interval = canonicalVenueIntervalStrict({
    eventDate: "2026-10-01",
    startsAt: "2026-10-01T15:00:00Z",
    endsAt: "2026-10-01T20:00:00Z",
    startTime: "18:00",
    endTime: "23:00",
    timezone: "Europe/Chisinau",
  });
  assert.ok(interval.endsAt.getTime() > interval.startsAt.getTime());
});

test("strict venue intervals reject nonexistent DST wall times", () => {
  assert.throws(
    () => canonicalVenueIntervalStrict({
      eventDate: "2026-03-29",
      startTime: "03:30",
      endTime: "05:00",
      timezone: "Europe/Chisinau",
    }),
    /does not exist/,
  );

  const valid = canonicalVenueIntervalStrict({
    eventDate: "2026-03-29",
    startTime: "01:30",
    endTime: "04:30",
    timezone: "Europe/Chisinau",
  });
  assert.ok(valid.endsAt.getTime() > valid.startsAt.getTime());
});

test("calendar and schedule routes use the shared validators and map invalid writes to 400", () => {
  const calendarRoute = readFileSync(
    new URL("../src/app/api/calendar/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(calendarRoute, /isValidCalendarMonth/);
  assert.match(calendarRoute, /entity_id: z\.coerce\.number\(\)\.int\(\)\.positive\(\)/);

  const scheduleRoute = readFileSync(
    new URL("../src/app/api/venues/[id]/schedule-blocks/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(scheduleRoute, /isValidCalendarDate/);
  assert.match(scheduleRoute, /isValidCalendarTime/);
  assert.match(scheduleRoute, /isValidIanaTimeZone/);
  assert.match(scheduleRoute, /canonicalVenueIntervalStrict/);
  assert.match(scheduleRoute, /jsonError\(result\.error, result\.status/);

  const writer = readFileSync(
    new URL("../src/lib/booking/venue-schedule-write.ts", import.meta.url),
    "utf8",
  );
  assert.match(writer, /canonicalVenueIntervalStrict/);
  assert.match(writer, /status: 400, error: "INVALID_INTERVAL"/);
});
