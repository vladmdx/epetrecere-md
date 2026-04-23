// Venue bookings queries — the venue's view of incoming requests.
// Uses the unified booking_requests table with venueId set.

import { db } from "@/lib/db";
import { bookingRequests, users, eventPlans } from "@/lib/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";

export type VenueBookingTab = "noi" | "acceptate" | "finalizate" | "anulate";

type BookingStatus =
  | "pending"
  | "accepted"
  | "confirmed_by_client"
  | "rejected"
  | "cancelled"
  | "completed";

const TAB_STATUSES: Record<VenueBookingTab, BookingStatus[]> = {
  noi: ["pending"],
  acceptate: ["accepted", "confirmed_by_client"],
  finalizate: ["completed"],
  anulate: ["rejected", "cancelled"],
};

export type VenueBooking = {
  id: number;
  venueId: number | null;
  clientUserId: string | null;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  eventType: string | null;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  guestCount: number | null;
  agreedPrice: number | null;
  message: string | null;
  status: string;
  source: string | null;
  artistReply: string | null;
  createdAt: Date;
  updatedAt: Date;
  planTitle: string | null;
  userEmail: string | null;
};

export async function getVenueBookings(
  venueId: number,
  tab: VenueBookingTab,
): Promise<VenueBooking[]> {
  const statuses = TAB_STATUSES[tab] || TAB_STATUSES.noi;
  const rows = await db
    .select({
      id: bookingRequests.id,
      venueId: bookingRequests.venueId,
      clientUserId: bookingRequests.clientUserId,
      clientName: bookingRequests.clientName,
      clientPhone: bookingRequests.clientPhone,
      clientEmail: bookingRequests.clientEmail,
      eventType: bookingRequests.eventType,
      eventDate: bookingRequests.eventDate,
      startTime: bookingRequests.startTime,
      endTime: bookingRequests.endTime,
      guestCount: bookingRequests.guestCount,
      agreedPrice: bookingRequests.agreedPrice,
      message: bookingRequests.message,
      status: bookingRequests.status,
      source: bookingRequests.source,
      artistReply: bookingRequests.artistReply,
      createdAt: bookingRequests.createdAt,
      updatedAt: bookingRequests.updatedAt,
      planTitle: eventPlans.title,
      userEmail: users.email,
    })
    .from(bookingRequests)
    .leftJoin(eventPlans, eq(bookingRequests.eventPlanId, eventPlans.id))
    .leftJoin(users, eq(bookingRequests.clientUserId, users.id))
    .where(
      and(
        eq(bookingRequests.venueId, venueId),
        inArray(bookingRequests.status, statuses),
      ),
    )
    .orderBy(desc(bookingRequests.createdAt));

  return rows;
}

/** Counts per tab so we can show badges. */
export async function getVenueBookingCounts(
  venueId: number,
): Promise<Record<VenueBookingTab, number>> {
  const allBookings = await db
    .select({
      status: bookingRequests.status,
    })
    .from(bookingRequests)
    .where(eq(bookingRequests.venueId, venueId));

  const counts: Record<VenueBookingTab, number> = {
    noi: 0,
    acceptate: 0,
    finalizate: 0,
    anulate: 0,
  };

  for (const row of allBookings) {
    for (const [tab, statuses] of Object.entries(TAB_STATUSES) as [
      VenueBookingTab,
      BookingStatus[],
    ][]) {
      if ((statuses as readonly string[]).includes(row.status)) {
        counts[tab] += 1;
      }
    }
  }

  return counts;
}
