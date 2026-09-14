import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  artistAvailabilityDateWindow,
  findOverlappingArtistBooking,
  findOverlappingArtistCalendarEntry,
  isArtistSlotWithinWorkingSchedule,
  projectArtistBusyRangesToDate,
  projectArtistWorkingScheduleToDate,
  type ArtistCalendarBusyEntry,
} from "../src/lib/booking/availability";
import {
  endTimeAfterHours,
  listBookableStartHours,
  maximumDurationHours,
  resolveDailyWorkingWindows,
} from "../src/lib/booking/daily-time-windows";

const row = (
  input: Partial<ArtistCalendarBusyEntry>,
): ArtistCalendarBusyEntry => ({
  eventDate: "2026-09-20",
  status: "blocked",
  bookingId: null,
  startTime: null,
  endTime: null,
  ...input,
});

test("checks every partial-day calendar row, not only the first result", () => {
  const result = findOverlappingArtistCalendarEntry(
    [
      row({ startTime: "08:00", endTime: "10:00" }),
      row({ startTime: "16:00", endTime: "19:00" }),
    ],
    { eventDate: "2026-09-20", startTime: "17:00", endTime: "18:00" },
  );

  assert.equal(result?.startTime, "16:00");
});

test("manual blocked and booking-projection rows both occupy artist time", () => {
  const manualBlock = row({
    status: "blocked",
    startTime: "12:00",
    endTime: "14:00",
  });
  const aiOrManualBookingProjection = row({
    status: "booked",
    bookingId: 712,
    startTime: "18:00",
    endTime: "22:00",
  });

  assert.equal(
    findOverlappingArtistCalendarEntry([manualBlock], {
      startTime: "13:00",
      endTime: "13:30",
      eventDate: "2026-09-20",
    })?.status,
    "blocked",
  );
  assert.equal(
    findOverlappingArtistCalendarEntry([aiOrManualBookingProjection], {
      startTime: "19:00",
      endTime: "20:00",
      eventDate: "2026-09-20",
    })?.status,
    "booked",
  );
  assert.equal(
    findOverlappingArtistCalendarEntry(
      [row({ status: "available" }), row({ status: "tentative" })],
      { eventDate: "2026-09-20", startTime: "19:00", endTime: "20:00" },
    ),
    undefined,
  );
});

test("self projection is excluded while another overlapping booking remains busy", () => {
  const entries = [
    row({
      status: "booked",
      bookingId: 100,
      startTime: "17:00",
      endTime: "20:00",
    }),
    row({
      status: "booked",
      bookingId: 101,
      startTime: "18:00",
      endTime: "21:00",
    }),
  ];

  assert.equal(
    findOverlappingArtistCalendarEntry(entries, {
      startTime: "18:30",
      endTime: "19:30",
      eventDate: "2026-09-20",
      excludeBookingId: 100,
    })?.bookingId,
    101,
  );
  assert.equal(
    findOverlappingArtistCalendarEntry([entries[0]], {
      startTime: "18:30",
      endTime: "19:30",
      eventDate: "2026-09-20",
      excludeBookingId: 100,
    }),
    undefined,
  );
  assert.equal(
    findOverlappingArtistCalendarEntry(
      [row({ status: "blocked", bookingId: null })],
      {
        startTime: "18:30",
        endTime: "19:30",
        eventDate: "2026-09-20",
        excludeBookingId: 100,
      },
    )?.status,
    "blocked",
  );
});

test("overnight calendar projections conflict across dates in both creation orders", () => {
  const first = row({
    status: "booked",
    eventDate: "2026-09-20",
    startTime: "23:00",
    endTime: "02:00",
  });
  const second = row({
    status: "booked",
    eventDate: "2026-09-21",
    startTime: "01:00",
    endTime: "03:00",
  });
  assert.equal(
    findOverlappingArtistCalendarEntry([first], {
      eventDate: second.eventDate,
      startTime: second.startTime,
      endTime: second.endTime,
    })?.status,
    "booked",
  );
  assert.equal(
    findOverlappingArtistCalendarEntry([second], {
      eventDate: first.eventDate,
      startTime: first.startTime,
      endTime: first.endTime,
    })?.status,
    "booked",
  );
});

test("booking rows conflict across midnight in both creation orders", () => {
  const first = {
    id: 1,
    eventDate: "2026-09-20",
    startTime: "23:00",
    endTime: "02:00",
  };
  const second = {
    id: 2,
    eventDate: "2026-09-21",
    startTime: "01:00",
    endTime: "03:00",
  };
  assert.equal(
    findOverlappingArtistBooking([first], { ...second, bufferMinutes: 15 })?.id,
    1,
  );
  assert.equal(
    findOverlappingArtistBooking([second], { ...first, bufferMinutes: 15 })?.id,
    2,
  );
});

test("turnaround buffer crossing midnight is order-independent", () => {
  const beforeMidnight = {
    id: 1,
    eventDate: "2026-09-20",
    startTime: "22:00",
    endTime: "23:50",
  };
  const afterMidnight = {
    id: 2,
    eventDate: "2026-09-21",
    startTime: "00:00",
    endTime: "01:00",
  };
  assert.equal(
    findOverlappingArtistBooking([beforeMidnight], {
      ...afterMidnight,
      bufferMinutes: 15,
    })?.id,
    1,
  );
  assert.equal(
    findOverlappingArtistBooking([afterMidnight], {
      ...beforeMidnight,
      bufferMinutes: 15,
    })?.id,
    2,
  );
});

test("availability reads and locks the deterministic adjacent-date window", async () => {
  assert.deepEqual(artistAvailabilityDateWindow("2026-09-20"), [
    "2026-09-19",
    "2026-09-20",
    "2026-09-21",
  ]);

  const locks = await readFile(
    new URL("../src/lib/booking/advisory-locks.ts", import.meta.url),
    "utf8",
  );
  const artistLock = locks.indexOf("AVAIL_LOCK_ARTIST}, ${artistId}");
  const dayLoop = locks.indexOf(
    "artistAvailabilityLockDates(eventDate)",
    artistLock,
  );
  assert.ok(artistLock >= 0 && dayLoop > artistLock);
});

test("availability query selects all blocked and booked calendar rows", async () => {
  const source = await readFile(
    new URL("../src/lib/booking/availability.ts", import.meta.url),
    "utf8",
  );
  const queryStart = source.indexOf("const busyCalendarEntries = await q");
  const queryEnd = source.indexOf(
    "const busyCalendarEntry = findOverlappingArtistCalendarEntry",
    queryStart,
  );
  assert.ok(queryStart >= 0 && queryEnd > queryStart);
  const query = source.slice(queryStart, queryEnd);

  assert.match(
    query,
    /inArray\(calendarEvents\.status, \["blocked", "booked"\]\)/,
  );
  assert.match(query, /bookingId: calendarEvents\.bookingId/);
  assert.match(query, /artistAvailabilityDateWindow\(eventDate\)/);
  assert.doesNotMatch(query, /\.limit\(/);

  const bookingQueryStart = source.indexOf("const bookings = await q");
  const bookingQueryEnd = source.indexOf(
    "const overlappingBooking = findOverlappingArtistBooking",
    bookingQueryStart,
  );
  assert.ok(bookingQueryStart >= 0 && bookingQueryEnd > bookingQueryStart);
  assert.match(
    source.slice(bookingQueryStart, bookingQueryEnd),
    /artistAvailabilityDateWindow\(eventDate\)/,
  );
});

test("Monday 18:00-04:00 covers both an overnight Monday request and early Tuesday", () => {
  const schedule = [{
    dayOfWeek: 0,
    startTime: "18:00",
    endTime: "04:00",
    isWorking: true,
  }];
  assert.equal(isArtistSlotWithinWorkingSchedule(schedule, {
    eventDate: "2026-09-21",
    startTime: "23:00",
    endTime: "02:00",
  }).allowed, true);
  assert.equal(isArtistSlotWithinWorkingSchedule(schedule, {
    eventDate: "2026-09-22",
    startTime: "01:00",
    endTime: "03:00",
  }).allowed, true);
  assert.equal(isArtistSlotWithinWorkingSchedule(schedule, {
    eventDate: "2026-09-22",
    startTime: "03:30",
    endTime: "04:30",
  }).allowed, false);
});

test("working schedule projects yesterday's spill and today's overnight shift", () => {
  const projection = projectArtistWorkingScheduleToDate([
    { dayOfWeek: 0, startTime: "18:00", endTime: "04:00", isWorking: true },
    { dayOfWeek: 1, startTime: "18:00", endTime: "04:00", isWorking: true },
  ], "2026-09-22");
  assert.equal(projection.configured, true);
  assert.deepEqual(projection.ranges, [
    { start: "00:00", end: "04:00" },
    { start: "18:00", end: "04:00" },
  ]);

  const windows = resolveDailyWorkingWindows({
    workingRanges: projection.ranges,
  });
  assert.deepEqual(listBookableStartHours(windows), [
    0, 1, 2, 3, 18, 19, 20, 21, 22, 23,
  ]);
  assert.equal(maximumDurationHours("23:00", windows), 5);
  assert.equal(endTimeAfterHours("23:00", 3), "02:00");
  assert.equal(endTimeAfterHours("23:00", 1), "00:00");
});

test("public busy ranges spill across midnight and deduplicate projections", () => {
  const duplicated = [
    { eventDate: "2026-09-21", startTime: "23:00", endTime: "02:00" },
    { eventDate: "2026-09-21", startTime: "23:00", endTime: "02:00" },
  ];
  assert.deepEqual(
    projectArtistBusyRangesToDate(duplicated, "2026-09-21"),
    {
      bookedRanges: [{ start: "23:00", end: "00:00" }],
      wholeDayBlocked: false,
    },
  );
  assert.deepEqual(
    projectArtistBusyRangesToDate(duplicated, "2026-09-22"),
    {
      bookedRanges: [{ start: "00:00", end: "02:00" }],
      wholeDayBlocked: false,
    },
  );
});

test("public availability source reads adjacent dates and returns canonical ranges", async () => {
  const source = await readFile(
    new URL("../src/app/api/artist-availability/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /artistAvailabilityDateWindow\(date\)/);
  assert.match(source, /projectArtistBusyRangesToDate/);
  assert.match(source, /projectArtistWorkingScheduleToDate/);
  assert.match(source, /workingRanges/);
});
