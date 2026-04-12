// F-S1 / M12 — Venue dashboard stats.
//
// Mirrors `artist-stats.ts` for venue owners. The vendor dashboard home
// now resolves the signed-in user's entity (artist OR venue) and picks
// the matching stats helper, so venue owners no longer see a row of
// dashes on first login.
//
// Venues don't flow through `booking_requests` (that table is artist-
// only). Venue bookings live in the legacy `bookings` table which also
// backs the admin CRM view. We summarize:
//   - pendingBookings      bookings.venue_id with status='pending'
//   - profileViews30d      profile_views in the last 30 days
//   - ratingAvg/Count      the rollup stored on venues
//   - bookingsThisMonth    bookings confirmed or completed since the
//                          start of the current calendar month — this
//                          is the closest we have to "Venituri luna"
//                          until agreed price is always persisted.

import { db } from "@/lib/db";
import { bookings, profileViews, venues } from "@/lib/db/schema";
import { and, count, eq, gte, inArray } from "drizzle-orm";

export type VenueStats = {
  pendingBookings: number;
  profileViews30d: number;
  ratingAvg: number | null;
  ratingCount: number;
  bookingsThisMonth: number;
};

export async function getVenueStats(venueId: number): Promise<VenueStats> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [pendingRow, viewsRow, ratingRow, bookedRow] = await Promise.all([
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
  ]);

  return {
    pendingBookings: Number(pendingRow[0]?.value ?? 0),
    profileViews30d: Number(viewsRow[0]?.value ?? 0),
    ratingAvg: ratingRow[0]?.ratingAvg ?? null,
    ratingCount: Number(ratingRow[0]?.ratingCount ?? 0),
    bookingsThisMonth: Number(bookedRow[0]?.value ?? 0),
  };
}
