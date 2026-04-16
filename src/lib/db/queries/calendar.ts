import { db } from "@/lib/db";
import { calendarEvents } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, not, inArray } from "drizzle-orm";
import type { EntityType, CalendarStatus } from "@/types";

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
  source: "manual" | "google_sync" | "booking" = "manual",
  note?: string,
  eventType?: string | null,
) {
  // Upsert: delete existing + insert new
  await db
    .delete(calendarEvents)
    .where(
      and(
        eq(calendarEvents.entityType, entityType),
        eq(calendarEvents.entityId, entityId),
        eq(calendarEvents.date, date),
      ),
    );

  if (status !== "available") {
    // Only insert non-available statuses (available = no record)
    return;
  }

  await db.insert(calendarEvents).values({
    entityType,
    entityId,
    date,
    status,
    source,
    note,
    eventType: eventType ?? null,
  });
}

export async function bulkSetCalendarEvents(
  entityType: EntityType,
  entityId: number,
  dates: string[],
  status: CalendarStatus,
  source: "manual" | "google_sync" | "booking" = "manual",
  note?: string | null,
  eventType?: string | null,
) {
  if (!dates.length) return;

  // Delete existing entries for these dates
  await db
    .delete(calendarEvents)
    .where(
      and(
        eq(calendarEvents.entityType, entityType),
        eq(calendarEvents.entityId, entityId),
        inArray(calendarEvents.date, dates),
      ),
    );

  // Insert new entries
  await db.insert(calendarEvents).values(
    dates.map((date) => ({
      entityType,
      entityId,
      date,
      status,
      source,
      note: note ?? null,
      eventType: eventType ?? null,
    })),
  );
}

/** Get entity IDs that are NOT booked/blocked on a given date */
export async function getAvailableEntityIds(
  entityType: EntityType,
  date: string,
): Promise<number[]> {
  // Return IDs that have NO booked/blocked record on this date
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
