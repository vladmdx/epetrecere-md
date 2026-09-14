import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CalendarWriteValidationError,
  calendarDateRange,
  isValidCalendarDate,
  isValidCalendarMonth,
  normalizeCalendarDates,
  replaceManagedCalendarEvents,
  type ManagedCalendarRow,
} from "../src/lib/booking/calendar-write";

test("calendar date validation rejects impossible dates and timestamps", () => {
  assert.equal(isValidCalendarDate("2028-02-29"), true);
  assert.equal(isValidCalendarDate("2027-02-29"), false);
  assert.equal(isValidCalendarDate("2027-04-31"), false);
  assert.equal(isValidCalendarDate("2027-01-01T00:00:00Z"), false);
  assert.equal(isValidCalendarDate("1899-12-31"), false);
});

test("calendar month validation rejects impossible and non-canonical months", () => {
  assert.equal(isValidCalendarMonth("2028-02"), true);
  assert.equal(isValidCalendarMonth("2028-00"), false);
  assert.equal(isValidCalendarMonth("2028-13"), false);
  assert.equal(isValidCalendarMonth("2028-2"), false);
  assert.equal(isValidCalendarMonth("1899-12"), false);
});

test("calendar date lists are sorted and duplicate input is rejected", () => {
  assert.deepEqual(
    normalizeCalendarDates(["2027-03-02", "2027-03-01"]),
    ["2027-03-01", "2027-03-02"],
  );
  assert.throws(
    () => normalizeCalendarDates(["2027-03-01", "2027-03-01"]),
    (error) =>
      error instanceof CalendarWriteValidationError
      && /Duplicate calendar date/.test(error.message),
  );
  assert.throws(
    () => normalizeCalendarDates(["2027-03-01", "2027-03-02"], { maxDates: 1 }),
    /exceeds the 1-day limit/,
  );
});

test("calendar ranges are inclusive, UTC-stable, and bounded", () => {
  assert.deepEqual(calendarDateRange("2028-02-28", "2028-03-01"), [
    "2028-02-28",
    "2028-02-29",
    "2028-03-01",
  ]);
  assert.throws(
    () => calendarDateRange("2028-03-02", "2028-03-01"),
    /start must not be after/,
  );
  assert.throws(
    () => calendarDateRange("2028-01-01", "2028-01-03", { maxDates: 2 }),
    /exceeds the 2-day limit/,
  );
});

test("replacement rejects rows outside its locked entity/date set before DB access", async () => {
  await assert.rejects(
    replaceManagedCalendarEvents({
      entities: [{ entityType: "artist", entityId: 1 }],
      dates: ["2028-04-01"],
      source: "manual",
      rows: [
        {
          entityType: "artist",
          entityId: 2,
          date: "2028-04-01",
          status: "blocked",
          source: "manual",
        },
      ],
    }),
    /unlocked calendar entity/,
  );

  const hallScoped = {
    entityType: "venue",
    entityId: 3,
    date: "2028-04-01",
    status: "blocked",
    source: "manual",
    hallId: 9,
  } as unknown as ManagedCalendarRow;
  await assert.rejects(
    replaceManagedCalendarEvents({
      entities: [{ entityType: "venue", entityId: 3 }],
      dates: ["2028-04-01"],
      source: "manual",
      rows: [hallScoped],
    }),
    /whole-entity rows/,
  );
});

test("replacement rejects duplicate entity/day rows before DB access", async () => {
  const row: ManagedCalendarRow = {
    entityType: "venue",
    entityId: 3,
    date: "2028-04-01",
    status: "blocked",
    source: "google_sync",
  };
  await assert.rejects(
    replaceManagedCalendarEvents({
      entities: [{ entityType: "venue", entityId: 3 }],
      dates: ["2028-04-01"],
      source: "google_sync",
      rows: [row, row],
      deleteScope: "all",
    }),
    /Duplicate replacement row/,
  );
});
