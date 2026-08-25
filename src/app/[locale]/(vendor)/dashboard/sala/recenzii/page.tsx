// Venue reviews dashboard — spec section 7.
//
// Shows: avg rating + total + unanswered stats, rating distribution bar chart,
// 12-month trend line, full review list with reply controls, AND a
// "Cere Recenzie" section listing past bookings that have no review yet.

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { and, desc, eq, isNull, lte, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  users,
  venues,
  reviews,
  bookingRequests,
} from "@/lib/db/schema";
import { VenueReviewsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function VenueReviewsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in?redirect_url=/dashboard/sala/recenzii");

  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) redirect("/");

  const [venue] = await db
    .select({
      id: venues.id,
      nameRo: venues.nameRo,
      slug: venues.slug,
    })
    .from(venues)
    .where(eq(venues.userId, appUser.id))
    .limit(1);
  if (!venue) redirect("/dashboard");

  const today = new Date().toISOString().slice(0, 10);

  const [venueReviews, reviewableBookings] = await Promise.all([
    db
      .select({
        id: reviews.id,
        authorName: reviews.authorName,
        rating: reviews.rating,
        text: reviews.text,
        eventType: reviews.eventType,
        reply: reviews.reply,
        replyAt: reviews.replyAt,
        isApproved: reviews.isApproved,
        createdAt: reviews.createdAt,
      })
      .from(reviews)
      .where(eq(reviews.venueId, venue.id))
      .orderBy(desc(reviews.createdAt)),

    // Past bookings (accepted/confirmed/completed) with no review yet
    db
      .select({
        id: bookingRequests.id,
        clientName: bookingRequests.clientName,
        clientEmail: bookingRequests.clientEmail,
        eventDate: bookingRequests.eventDate,
        eventType: bookingRequests.eventType,
        status: bookingRequests.status,
        reviewId: reviews.id,
      })
      .from(bookingRequests)
      .leftJoin(reviews, eq(reviews.bookingRequestId, bookingRequests.id))
      .where(
        and(
          eq(bookingRequests.venueId, venue.id),
          lte(bookingRequests.eventDate, today),
          inArray(bookingRequests.status, [
            "accepted",
            "confirmed_by_client",
            "completed",
          ]),
          isNull(reviews.id),
        ),
      )
      .orderBy(desc(bookingRequests.eventDate))
      .limit(30),
  ]);

  return (
    <VenueReviewsClient
      entityKind="sala"
      entityId={venue.id}
      entityName={venue.nameRo}
      entitySlug={venue.slug}
      reviews={venueReviews.map((r) => ({
        ...r,
        createdAt:
          r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
        replyAt: r.replyAt
          ? r.replyAt instanceof Date
            ? r.replyAt.toISOString()
            : String(r.replyAt)
          : null,
      }))}
      reviewableBookings={reviewableBookings.map((b) => ({
        id: b.id,
        clientName: b.clientName,
        clientEmail: b.clientEmail,
        eventDate: b.eventDate,
        eventType: b.eventType,
        status: b.status,
      }))}
    />
  );
}
