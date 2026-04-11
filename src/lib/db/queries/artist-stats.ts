// F-A1 — Vendor dashboard stats.
//
// Before this fix `/dashboard` rendered four hardcoded zeros — a silent
// "nothing to see here" for artists who actually had bookings and profile
// views waiting for them. This helper is the single source of truth for
// the four stat cards on the home dashboard and can be reused by the API
// route that powers the owner's widget + by any future admin view.
//
// Stats returned:
//   - pendingRequests       booking_requests where status='pending'
//   - profileViews30d       profile_views in the last 30 days
//   - ratingAvg / ratingCount  the rollup stored on artists
//   - confirmedThisMonth    booking_requests flipped to confirmed_by_client
//                           since the start of the current calendar month
//                           (used as the "Venituri luna" proxy until we
//                            actually persist agreed price per request).

import { db } from "@/lib/db";
import { artists, bookingRequests, profileViews } from "@/lib/db/schema";
import { and, count, eq, gte } from "drizzle-orm";

export type ArtistStats = {
  pendingRequests: number;
  profileViews30d: number;
  ratingAvg: number | null;
  ratingCount: number;
  confirmedThisMonth: number;
};

export async function getArtistStats(artistId: number): Promise<ArtistStats> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Run the four reads in parallel — they don't depend on each other and
  // the dashboard is the first paint an artist sees after login, so we
  // care about p95 latency here.
  const [pendingRow, viewsRow, ratingRow, confirmedRow] = await Promise.all([
    db
      .select({ value: count() })
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.artistId, artistId),
          eq(bookingRequests.status, "pending"),
        ),
      ),
    db
      .select({ value: count() })
      .from(profileViews)
      .where(
        and(
          eq(profileViews.artistId, artistId),
          gte(profileViews.createdAt, thirtyDaysAgo),
        ),
      ),
    db
      .select({
        ratingAvg: artists.ratingAvg,
        ratingCount: artists.ratingCount,
      })
      .from(artists)
      .where(eq(artists.id, artistId))
      .limit(1),
    db
      .select({ value: count() })
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.artistId, artistId),
          eq(bookingRequests.status, "confirmed_by_client"),
          gte(bookingRequests.updatedAt, monthStart),
        ),
      ),
  ]);

  return {
    pendingRequests: Number(pendingRow[0]?.value ?? 0),
    profileViews30d: Number(viewsRow[0]?.value ?? 0),
    ratingAvg: ratingRow[0]?.ratingAvg ?? null,
    ratingCount: Number(ratingRow[0]?.ratingCount ?? 0),
    confirmedThisMonth: Number(confirmedRow[0]?.value ?? 0),
  };
}
