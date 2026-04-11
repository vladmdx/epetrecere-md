import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import {
  bookingRequests,
  reviews,
  users,
  artists,
} from "@/lib/db/schema";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getLocalized } from "@/i18n";

// M4 — GET /api/reviews/reviewable-bookings
//
// Returns the signed-in user's bookings that are eligible for a review:
//   - status = confirmed_by_client
//   - event_date in the past
//   - no existing review attached
//
// Used by the cabinet to surface a "Lasă o recenzie" CTA next to each
// completed booking.

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [appUser] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const today = new Date().toISOString().slice(0, 10);

  // Left join reviews so we can exclude already-reviewed bookings.
  const rows = await db
    .select({
      booking: bookingRequests,
      artist: artists,
      reviewId: reviews.id,
    })
    .from(bookingRequests)
    .leftJoin(artists, eq(artists.id, bookingRequests.artistId))
    .leftJoin(reviews, eq(reviews.bookingRequestId, bookingRequests.id))
    .where(
      and(
        eq(bookingRequests.status, "confirmed_by_client"),
        lt(bookingRequests.eventDate, sql`${today}::date`),
        or(
          eq(bookingRequests.clientUserId, appUser.id),
          appUser.email
            ? eq(bookingRequests.clientEmail, appUser.email)
            : undefined,
        )!,
        isNull(reviews.id),
      ),
    );

  return NextResponse.json({
    bookings: rows.map(({ booking, artist }) => ({
      id: booking.id,
      eventDate: booking.eventDate,
      eventType: booking.eventType,
      artistId: booking.artistId,
      artistName: artist ? getLocalized(artist, "name", "ro") : null,
      artistSlug: artist?.slug ?? null,
    })),
  });
}
