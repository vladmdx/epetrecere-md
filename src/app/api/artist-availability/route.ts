// Public endpoint returning the booked time ranges for an artist on a given
// date. Used by booking UIs to hide/disable already-booked time slots.
//
// Response format:
//   { bookedRanges: [{ startTime: "14:00", endTime: "16:00" }, ...] }
//
// No client-identifying data is returned — just time ranges.

import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  bookingRequests,
  calendarEvents,
  workSchedule,
} from "@/lib/db/schema";
import {
  artistAvailabilityDateWindow,
  projectArtistBusyRangesToDate,
  projectArtistWorkingScheduleToDate,
} from "@/lib/booking/availability";
import { isValidCalendarDate } from "@/lib/booking/calendar-input-validation";

const BLOCKING_STATUSES = [
  "pending",
  "accepted",
  "confirmed_by_client",
] as const;

export async function GET(req: NextRequest) {
  const artistIdRaw = req.nextUrl.searchParams.get("artist_id");
  const date = req.nextUrl.searchParams.get("date");

  if (!artistIdRaw || !date) {
    return NextResponse.json(
      { error: "artist_id and date required" },
      { status: 400 },
    );
  }

  const artistId = Number(artistIdRaw);
  if (!Number.isFinite(artistId)) {
    return NextResponse.json({ error: "Invalid artist_id" }, { status: 400 });
  }

  if (!isValidCalendarDate(date)) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  // Fetch booking time ranges (no client names)
  const bookings = await db
    .select({
      eventDate: bookingRequests.eventDate,
      startTime: bookingRequests.startTime,
      endTime: bookingRequests.endTime,
    })
    .from(bookingRequests)
    .where(
      and(
        eq(bookingRequests.artistId, artistId),
        inArray(bookingRequests.eventDate, artistAvailabilityDateWindow(date)),
        inArray(bookingRequests.status, [...BLOCKING_STATUSES]),
      ),
    );

  // Include manually blocked calendar events (vacations)
  const blocks = await db
    .select({
      eventDate: calendarEvents.date,
      startTime: calendarEvents.startTime,
      endTime: calendarEvents.endTime,
    })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.entityType, "artist"),
        eq(calendarEvents.entityId, artistId),
        inArray(calendarEvents.date, artistAvailabilityDateWindow(date)),
        inArray(calendarEvents.status, ["blocked", "booked"]),
      ),
    );

  const busyProjection = projectArtistBusyRangesToDate(
    [...bookings, ...blocks],
    date,
  );
  const bookedRanges = busyProjection.bookedRanges.map((range) => ({
    startTime: range.start,
    endTime: range.end,
  }));
  const wholeDayBlocked = busyProjection.wholeDayBlocked;

  // Working hours for this date's day-of-week (Mon=0..Sun=6 to match work_schedule)
  const dateWindow = artistAvailabilityDateWindow(date);
  const previousDate = dateWindow[0]!;
  const dow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const previousDow = (new Date(`${previousDate}T00:00:00Z`).getUTCDay() + 6) % 7;
  const scheduleRows = await db
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
  const scheduleProjection = projectArtistWorkingScheduleToDate(
    scheduleRows,
    date,
  );
  const scheduleRow = scheduleRows.find((row) => row.dayOfWeek === dow);

  const workingHours = scheduleRow
    ? scheduleRow.isWorking
      ? { start: scheduleRow.startTime, end: scheduleRow.endTime }
      : null // explicit day off
    : undefined; // no schedule configured — no restriction

  const workingRanges = scheduleProjection.configured
    ? scheduleProjection.ranges
    : undefined;

  return NextResponse.json({
    bookedRanges,
    wholeDayBlocked,
    workingHours,
    workingRanges,
  });
}
