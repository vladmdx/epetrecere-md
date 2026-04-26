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

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  // Fetch booking time ranges (no client names)
  const bookings = await db
    .select({
      startTime: bookingRequests.startTime,
      endTime: bookingRequests.endTime,
    })
    .from(bookingRequests)
    .where(
      and(
        eq(bookingRequests.artistId, artistId),
        eq(bookingRequests.eventDate, date),
        inArray(bookingRequests.status, [...BLOCKING_STATUSES]),
      ),
    );

  // Include manually blocked calendar events (vacations)
  const blocks = await db
    .select({
      startTime: calendarEvents.startTime,
      endTime: calendarEvents.endTime,
    })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.entityType, "artist"),
        eq(calendarEvents.entityId, artistId),
        eq(calendarEvents.date, date),
        eq(calendarEvents.status, "blocked"),
      ),
    );

  const bookedRanges = [...bookings, ...blocks]
    .filter((b) => b.startTime && b.endTime)
    .map((b) => ({ startTime: b.startTime!, endTime: b.endTime! }));

  // If there's any whole-day booking/block, signal it
  const wholeDayBlocked = [...bookings, ...blocks].some(
    (b) => !b.startTime || !b.endTime,
  );

  // Working hours for this date's day-of-week (Mon=0..Sun=6 to match work_schedule)
  const d = new Date(date + "T00:00:00");
  const dow = (d.getDay() + 6) % 7;
  const [scheduleRow] = await db
    .select({
      startTime: workSchedule.startTime,
      endTime: workSchedule.endTime,
      isWorking: workSchedule.isWorking,
    })
    .from(workSchedule)
    .where(
      and(eq(workSchedule.artistId, artistId), eq(workSchedule.dayOfWeek, dow)),
    )
    .limit(1);

  const workingHours = scheduleRow
    ? scheduleRow.isWorking
      ? { start: scheduleRow.startTime, end: scheduleRow.endTime }
      : null // explicit day off
    : undefined; // no schedule configured — no restriction

  return NextResponse.json({ bookedRanges, wholeDayBlocked, workingHours });
}
