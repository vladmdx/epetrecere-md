import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { calendarEvents, venueScheduleBlocks } from "@/lib/db/schema";
import { localDatesIntersecting } from "@/lib/booking/zoned-interval";

export type MergedCalendarEvent = {
  date: string;
  status: string;
  eventType: string | null;
  note: string | null;
  source: string | null;
  hallId: number | null;
  bookingId: number | null;
  startTime: string | null;
  endTime: string | null;
};

/** Owner calendar: keep bookings, manual events and non-booking blocks as separate rows. */
export async function getMergedVenueCalendar(opts: {
  venueId: number;
  monthStartIso: string;
  monthEndIso: string;
  hallId?: number | null;
}): Promise<MergedCalendarEvent[]> {
  const rows = await db
    .select({
      date: calendarEvents.date,
      status: calendarEvents.status,
      eventType: calendarEvents.eventType,
      note: calendarEvents.note,
      source: calendarEvents.source,
      hallId: calendarEvents.hallId,
      bookingId: calendarEvents.bookingId,
      startTime: calendarEvents.startTime,
      endTime: calendarEvents.endTime,
    })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.entityType, "venue"),
        eq(calendarEvents.entityId, opts.venueId),
        gte(calendarEvents.date, opts.monthStartIso),
        lte(calendarEvents.date, opts.monthEndIso),
      ),
    );

  const blocks = await db
    .select()
    .from(venueScheduleBlocks)
    .where(eq(venueScheduleBlocks.venueId, opts.venueId));

  const fromEvents: MergedCalendarEvent[] = rows
    .filter((row) => opts.hallId == null || row.hallId == null || row.hallId === opts.hallId)
    .map((row) => ({
      date: row.date,
      status: row.status,
      eventType: row.eventType,
      note: row.note,
      source: row.source,
      hallId: row.hallId ?? null,
      bookingId: row.bookingId ?? null,
      startTime: row.startTime ?? null,
      endTime: row.endTime ?? null,
    }));

  const fromBlocks: MergedCalendarEvent[] = [];
  for (const block of blocks) {
    if (opts.hallId != null && block.hallId != null && block.hallId !== opts.hallId) continue;
    const dates = localDatesIntersecting({
      startsAt: block.startsAt,
      endsAt: block.endsAt,
      timezone: "Europe/Chisinau",
      eventDate: block.startsAt.toISOString().slice(0, 10),
      startTime: null,
      endTime: null,
    });
    for (const date of dates) {
      if (date < opts.monthStartIso || date > opts.monthEndIso) continue;
      fromBlocks.push({
        date,
        status: "blocked",
        eventType: null,
        note: block.reason,
        source: "block",
        hallId: block.hallId ?? null,
        bookingId: null,
        startTime: null,
        endTime: null,
      });
    }
  }

  return [...fromEvents, ...fromBlocks];
}
