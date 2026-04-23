// Venue dashboard stats + activity feed helpers.
//
// Venues don't yet flow through `booking_requests` (artist-only) — they
// use the legacy `bookings` table. When we migrate venues to
// booking_requests (Phase 2), swap the source here.

import { db } from "@/lib/db";
import {
  bookings,
  profileViews,
  venues,
  calendarEvents,
  notifications,
  leads,
} from "@/lib/db/schema";
import { and, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

export type VenueStats = {
  pendingBookings: number;
  profileViews30d: number;
  ratingAvg: number | null;
  ratingCount: number;
  bookingsThisMonth: number;
  /** Percent of days in the current month that are booked or blocked. */
  occupancyRate: number;
  occupancyBusyDays: number;
  occupancyTotalDays: number;
  /** Sum of agreed prices for confirmed/completed bookings this month (EUR). */
  revenueThisMonth: number;
  /** Change vs last month for revenue (absolute EUR). */
  revenueLastMonth: number;
};

export async function getVenueStats(venueId: number): Promise<VenueStats> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0); // last day of month
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  const monthStartIso = monthStart.toISOString().split("T")[0];
  const monthEndIso = monthEnd.toISOString().split("T")[0];

  const daysInMonth = monthEnd.getDate();

  const [
    pendingRow,
    viewsRow,
    ratingRow,
    bookedRow,
    occupancyRow,
    revenueRow,
    revenueLastRow,
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(bookings)
      .where(
        and(eq(bookings.venueId, venueId), eq(bookings.status, "pending")),
      ),
    db
      .select({ value: count() })
      .from(profileViews)
      .where(
        and(
          eq(profileViews.venueId, venueId),
          gte(profileViews.createdAt, thirtyDaysAgo),
        ),
      ),
    db
      .select({
        ratingAvg: venues.ratingAvg,
        ratingCount: venues.ratingCount,
      })
      .from(venues)
      .where(eq(venues.id, venueId))
      .limit(1),
    db
      .select({ value: count() })
      .from(bookings)
      .where(
        and(
          eq(bookings.venueId, venueId),
          inArray(bookings.status, ["confirmed", "completed"]),
          gte(bookings.updatedAt, monthStart),
        ),
      ),
    // Occupancy: distinct busy days in current month from calendar_events
    db
      .select({ value: count(sql`DISTINCT ${calendarEvents.date}`) })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.entityType, "venue"),
          eq(calendarEvents.entityId, venueId),
          gte(calendarEvents.date, monthStartIso),
          lte(calendarEvents.date, monthEndIso),
          inArray(calendarEvents.status, ["booked", "blocked"]),
        ),
      ),
    // Revenue this month: sum of agreed prices for confirmed/completed
    db
      .select({
        value: sql<number>`COALESCE(SUM(${bookings.priceAgreed}), 0)`,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.venueId, venueId),
          inArray(bookings.status, ["confirmed", "completed"]),
          gte(bookings.updatedAt, monthStart),
        ),
      ),
    // Revenue last month
    db
      .select({
        value: sql<number>`COALESCE(SUM(${bookings.priceAgreed}), 0)`,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.venueId, venueId),
          inArray(bookings.status, ["confirmed", "completed"]),
          gte(bookings.updatedAt, lastMonthStart),
          lte(bookings.updatedAt, lastMonthEnd),
        ),
      ),
  ]);

  const occupancyBusyDays = Number(occupancyRow[0]?.value ?? 0);
  const occupancyRate =
    daysInMonth > 0 ? Math.round((occupancyBusyDays / daysInMonth) * 100) : 0;

  return {
    pendingBookings: Number(pendingRow[0]?.value ?? 0),
    profileViews30d: Number(viewsRow[0]?.value ?? 0),
    ratingAvg: ratingRow[0]?.ratingAvg ?? null,
    ratingCount: Number(ratingRow[0]?.ratingCount ?? 0),
    bookingsThisMonth: Number(bookedRow[0]?.value ?? 0),
    occupancyRate,
    occupancyBusyDays,
    occupancyTotalDays: daysInMonth,
    revenueThisMonth: Number(revenueRow[0]?.value ?? 0),
    revenueLastMonth: Number(revenueLastRow[0]?.value ?? 0),
  };
}

export type VenueActivityItem = {
  id: number;
  type: string;
  title: string;
  message: string | null;
  actionUrl: string | null;
  createdAt: Date;
  isRead: boolean;
};

/** Recent activity feed for the venue — mapped from notifications dispatched
 *  to the venue owner's user account. */
export async function getVenueActivity(
  userId: string,
  limit = 10,
): Promise<VenueActivityItem[]> {
  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      message: notifications.message,
      actionUrl: notifications.actionUrl,
      createdAt: notifications.createdAt,
      isRead: notifications.isRead,
    })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  return rows;
}

export type VenueRecentBooking = {
  id: number;
  clientName: string;
  eventType: string | null;
  eventDate: string | null;
  guestCount: number | null;
  status: string;
  priceAgreed: number | null;
};

/** Most recent bookings (any status) for quick action on the home page.
 *  Client info comes from the linked lead row. */
export async function getVenueRecentBookings(
  venueId: number,
  limit = 5,
): Promise<VenueRecentBooking[]> {
  const rows = await db
    .select({
      id: bookings.id,
      clientName: leads.name,
      eventType: bookings.eventType,
      eventDate: bookings.eventDate,
      guestCount: leads.guestCount,
      status: bookings.status,
      priceAgreed: bookings.priceAgreed,
    })
    .from(bookings)
    .leftJoin(leads, eq(bookings.leadId, leads.id))
    .where(eq(bookings.venueId, venueId))
    .orderBy(desc(bookings.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    clientName: r.clientName ?? "Client necunoscut",
  }));
}
