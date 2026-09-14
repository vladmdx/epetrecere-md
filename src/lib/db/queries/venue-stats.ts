// Venue dashboard stats + activity feed helpers.
//
// The public venue flow, booking tabs and all quick actions share
// booking_requests. The retired bookings table has independent IDs and must
// not be mixed into this actionable dashboard.

import { db } from "@/lib/db";
import { bookingTextForViewer } from "@/lib/privacy/booking-text";
import { contactsAreShared } from "@/lib/privacy/booking-contact";
import {
  bookingRequests,
  bookings,
  leads,
  profileViews,
  venues,
  calendarEvents,
  notifications,
} from "@/lib/db/schema";
import { and, count, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { finalizedLegacyVenueBookingsInMonth, finalizedVenueBookingsInMonth, venueDashboardMonths } from "@/lib/vendors/dashboard-bookings";
import { notificationsForUser } from "@/lib/privacy/notification-view";

export type VenueLegacySummary = {
  totalBookings: number;
  pendingBookings: number;
  confirmedThisMonth: number;
  revenueThisMonth: number;
  revenueLastMonth: number;
};

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
  /** Separately reported legacy history. Not added to unified totals because
   * the schemas have no reliable cross-model identifier for deduplication. */
  legacy: VenueLegacySummary;
};

export async function getVenueStats(
  venueId: number,
  now = new Date(),
  options: { includeFinancials?: boolean } = {},
): Promise<VenueStats> {
  const includeFinancials = options.includeFinancials === true;
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const { monthStart, nextMonthStart, lastMonthStart, daysInMonth } = venueDashboardMonths(now);
  const currentMonthBookings = finalizedVenueBookingsInMonth(venueId, monthStart, nextMonthStart);
  const lastMonthBookings = finalizedVenueBookingsInMonth(venueId, lastMonthStart, monthStart);

  const [
    pendingRow,
    viewsRow,
    ratingRow,
    bookedRow,
    occupancyRow,
    legacyRow,
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(bookingRequests)
      .where(
        and(eq(bookingRequests.venueId, venueId), eq(bookingRequests.status, "pending")),
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
      .from(bookingRequests)
      .where(currentMonthBookings),
    // Occupancy: distinct busy days in current month from calendar_events
    db
      .select({ value: count(sql`DISTINCT ${calendarEvents.date}`) })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.entityType, "venue"),
          eq(calendarEvents.entityId, venueId),
          gte(calendarEvents.date, monthStart),
          lt(calendarEvents.date, nextMonthStart),
          inArray(calendarEvents.status, ["booked", "blocked"]),
        ),
      ),
    db
      .select({
        totalBookings: count(),
        pendingBookings: sql<number>`count(*) filter (where ${bookings.status} = 'pending')`,
        confirmedThisMonth: sql<number>`count(*) filter (where ${finalizedLegacyVenueBookingsInMonth(monthStart, nextMonthStart)})`,
      })
      .from(bookings)
      .where(eq(bookings.venueId, venueId)),
  ]);

  let revenueThisMonth = 0;
  let revenueLastMonth = 0;
  let legacyRevenueThisMonth = 0;
  let legacyRevenueLastMonth = 0;
  if (includeFinancials) {
    const [revenueRow, revenueLastRow, legacyRevenueRow] = await Promise.all([
      db
        .select({
          value: sql<number>`COALESCE(SUM(${bookingRequests.agreedPrice}), 0)`,
        })
        .from(bookingRequests)
        .where(currentMonthBookings),
      db
        .select({
          value: sql<number>`COALESCE(SUM(${bookingRequests.agreedPrice}), 0)`,
        })
        .from(bookingRequests)
        .where(lastMonthBookings),
      db
        .select({
          current: sql<number>`coalesce(sum(${bookings.priceAgreed}) filter (where ${finalizedLegacyVenueBookingsInMonth(monthStart, nextMonthStart)}), 0)`,
          previous: sql<number>`coalesce(sum(${bookings.priceAgreed}) filter (where ${finalizedLegacyVenueBookingsInMonth(lastMonthStart, monthStart)}), 0)`,
        })
        .from(bookings)
        .where(eq(bookings.venueId, venueId)),
    ]);
    revenueThisMonth = Number(revenueRow[0]?.value ?? 0);
    revenueLastMonth = Number(revenueLastRow[0]?.value ?? 0);
    legacyRevenueThisMonth = Number(legacyRevenueRow[0]?.current ?? 0);
    legacyRevenueLastMonth = Number(legacyRevenueRow[0]?.previous ?? 0);
  }

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
    revenueThisMonth,
    revenueLastMonth,
    legacy: {
      totalBookings: Number(legacyRow[0]?.totalBookings ?? 0),
      pendingBookings: Number(legacyRow[0]?.pendingBookings ?? 0),
      confirmedThisMonth: Number(legacyRow[0]?.confirmedThisMonth ?? 0),
      revenueThisMonth: legacyRevenueThisMonth,
      revenueLastMonth: legacyRevenueLastMonth,
    },
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

  return notificationsForUser(rows, userId);
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

/** Most recent unified requests (any status) for quick action on the home
 * page. IDs are the same ones accepted by /api/booking-requests/:id. */
export async function getVenueRecentBookings(
  venueId: number,
  limit = 5,
  options: { includeFinancials?: boolean } = {},
): Promise<VenueRecentBooking[]> {
  const rows = await db
    .select({
      id: bookingRequests.id,
      clientName: bookingRequests.clientName,
      eventType: bookingRequests.eventType,
      eventDate: bookingRequests.eventDate,
      guestCount: bookingRequests.guestCount,
      status: bookingRequests.status,
      priceAgreed: options.includeFinancials === true
        ? bookingRequests.agreedPrice
        : sql<number | null>`null`,
    })
    .from(bookingRequests)
    .where(eq(bookingRequests.venueId, venueId))
    .orderBy(desc(bookingRequests.createdAt), desc(bookingRequests.id))
    .limit(limit);

  return rows.map(row => ({ ...row,
    clientName: bookingTextForViewer(row.clientName, contactsAreShared(row.status)),
    eventType: bookingTextForViewer(row.eventType, contactsAreShared(row.status)),
    priceAgreed: options.includeFinancials === true ? row.priceAgreed : null,
  }));
}

/** Read-only historical rows, kept separate so legacy numeric IDs cannot be
 * mistaken for actionable booking_requests IDs with the same value. */
export async function getVenueLegacyRecentBookings(
  venueId: number,
  limit = 5,
  options: { includeFinancials?: boolean } = {},
): Promise<VenueRecentBooking[]> {
  const rows = await db
    .select({
      id: bookings.id,
      clientName: leads.name,
      eventType: bookings.eventType,
      eventDate: bookings.eventDate,
      guestCount: leads.guestCount,
      status: bookings.status,
      priceAgreed: options.includeFinancials === true
        ? bookings.priceAgreed
        : sql<number | null>`null`,
    })
    .from(bookings)
    .leftJoin(leads, eq(bookings.leadId, leads.id))
    .where(eq(bookings.venueId, venueId))
    .orderBy(desc(bookings.createdAt), desc(bookings.id))
    .limit(limit);
  return rows.map((row) => ({ ...row,
    clientName: bookingTextForViewer(row.clientName ?? "", ["confirmed", "completed"].includes(row.status)),
    eventType: bookingTextForViewer(row.eventType, ["confirmed", "completed"].includes(row.status)),
    priceAgreed: options.includeFinancials === true ? row.priceAgreed : null,
  }));
}
