import { redactContact } from "@/lib/privacy/contact-redaction";
// Venue bookings queries — the venue's view of incoming requests.
// Uses the unified booking_requests table with venueId set.

import { db } from "@/lib/db";
import { bookingRequests, users, eventPlans, artists } from "@/lib/db/schema";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";

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
  eventPlanId: number | null;
  clientUserId: string | null;
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
  eventType: string | null;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  guestCount: number | null;
  agreedPrice: number | null;
  message: string | null;
  status: string;
  clientConfirmedAt: Date | null;
  source: string | null;
  artistReply: string | null;
  createdAt: Date;
  updatedAt: Date;
  planTitle: string | null;
  userEmail: string | null;
  /** Other vendors (artists) confirmed for the same event plan. */
  linkedArtists: Array<{
    id: number;
    name: string;
    slug: string;
    status: string;
  }>;
  /** How many accepted/confirmed venue bookings exist on the same date (incl. self). */
  sameDayBookingsCount: number;
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
      eventPlanId: bookingRequests.eventPlanId,
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
      clientConfirmedAt: bookingRequests.clientConfirmedAt,
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

  // Fetch linked artists for bookings that are tied to an event plan
  const planIds = Array.from(
    new Set(rows.map((r) => r.eventPlanId).filter((x): x is number => x !== null)),
  );

  const linkedMap = new Map<number, VenueBooking["linkedArtists"]>();
  if (planIds.length > 0) {
    const linkedRows = await db
      .select({
        eventPlanId: bookingRequests.eventPlanId,
        artistId: artists.id,
        artistName: artists.nameRo,
        artistSlug: artists.slug,
        status: bookingRequests.status,
      })
      .from(bookingRequests)
      .innerJoin(artists, eq(bookingRequests.artistId, artists.id))
      .where(
        and(
          inArray(bookingRequests.eventPlanId, planIds),
          isNotNull(bookingRequests.artistId),
          inArray(bookingRequests.status, [
            "accepted",
            "confirmed_by_client",
            "completed",
          ]),
        ),
      );
    for (const row of linkedRows) {
      if (!row.eventPlanId) continue;
      const list = linkedMap.get(row.eventPlanId) ?? [];
      list.push({
        id: row.artistId,
        name: row.artistName,
        slug: row.artistSlug,
        status: row.status,
      });
      linkedMap.set(row.eventPlanId, list);
    }
  }

  // Count accepted bookings per date (for same-day conflict warnings).
  const sameDateCounts = new Map<string, number>();
  const acceptedSameDayRows = await db
    .select({
      eventDate: bookingRequests.eventDate,
    })
    .from(bookingRequests)
    .where(
      and(
        eq(bookingRequests.venueId, venueId),
        inArray(bookingRequests.status, ["accepted", "confirmed_by_client"]),
      ),
    );
  // Manual aggregation (simple + avoids SQL complexity)
  for (const row of acceptedSameDayRows) {
    sameDateCounts.set(
      row.eventDate,
      (sameDateCounts.get(row.eventDate) ?? 0) + 1,
    );
  }

  const contactSharedStatuses = new Set(["confirmed_by_client", "completed"]);

  return rows.map((r) => {
    const canSeeContact = contactSharedStatuses.has(r.status);
    return {
      ...r,
      message: !canSeeContact && r.message ? redactContact(r.message) : r.message,
      artistReply: !canSeeContact && r.artistReply ? redactContact(r.artistReply) : r.artistReply,
      clientPhone: canSeeContact ? r.clientPhone : null,
      clientEmail: canSeeContact ? r.clientEmail : null,
      userEmail: canSeeContact ? r.userEmail : null,
      linkedArtists: r.eventPlanId ? linkedMap.get(r.eventPlanId) ?? [] : [],
      sameDayBookingsCount: sameDateCounts.get(r.eventDate) ?? 0,
    };
  });
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
