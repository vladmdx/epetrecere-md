import { db } from "@/lib/db";
import { calendarEvents } from "@/lib/db/schema";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import type { EntityType, CalendarStatus } from "@/types";
import {
  normalizeCalendarDates,
  replaceManagedCalendarEvents,
  type ManagedCalendarReplacementOptions,
  type ManagedCalendarSource,
} from "@/lib/booking/calendar-write";

export async function getCalendarEvents(
  entityType: EntityType,
  entityId: number,
  month: string, // "2026-08"
) {
  const [year, mon] = month.split("-").map(Number);
  const startDate = `${year}-${String(mon).padStart(2, "0")}-01`;
  const endDate = `${year}-${String(mon).padStart(2, "0")}-${new Date(year, mon, 0).getDate()}`;

  return db
    .select({
      date: calendarEvents.date,
      status: calendarEvents.status,
      note: calendarEvents.note,
      eventType: calendarEvents.eventType,
      startTime: calendarEvents.startTime,
      endTime: calendarEvents.endTime,
    })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.entityType, entityType),
        eq(calendarEvents.entityId, entityId),
        gte(calendarEvents.date, startDate),
        lte(calendarEvents.date, endDate),
      ),
    );
}

export async function setCalendarEvent(
  entityType: EntityType,
  entityId: number,
  date: string,
  status: CalendarStatus,
  source: ManagedCalendarSource = "manual",
  note?: string,
  eventType?: string | null,
) {
  return bulkSetCalendarEvents(
    entityType,
    entityId,
    [date],
    status,
    source,
    note,
    eventType,
  );
}

export async function bulkSetCalendarEvents(
  entityType: EntityType,
  entityId: number,
  dates: string[],
  status: CalendarStatus,
  source: ManagedCalendarSource = "manual",
  note?: string | null,
  eventType?: string | null,
  options: ManagedCalendarReplacementOptions = {},
) {
  const normalizedDates = normalizeCalendarDates(dates, {
    maxDates: 366,
    rejectDuplicates: true,
  });
  return replaceManagedCalendarEvents({
    entities: [{ entityType, entityId }],
    dates: normalizedDates,
    source,
    // Available means absence of this managed-source projection. Booking and
    // hall-scoped rows remain untouched by the replacement helper.
    rows:
      status === "available"
        ? []
        : normalizedDates.map((date) => ({
            entityType,
            entityId,
            date,
            status,
            source,
            note: note ?? null,
            eventType: eventType ?? null,
          })),
  }, options);
}

/** Get entity IDs that are booked/blocked on a given date (unavailable) */
export async function getBookedEntityIds(
  entityType: EntityType,
  date: string,
): Promise<number[]> {
  const bookedIds = await db
    .select({ entityId: calendarEvents.entityId })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.entityType, entityType),
        eq(calendarEvents.date, date),
        inArray(calendarEvents.status, ["booked", "blocked"]),
      ),
    );

  return bookedIds.map((r) => r.entityId);
}
