// Artist reviews dashboard — parity with the venue recenzii page.
// Shares the VenueReviewsClient component (which is entity-agnostic via
// entityKind prop) so artist and venue dashboards render identical UX.

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { and, desc, eq, isNull, lte, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  users,
  artists,
  reviews,
  bookingRequests,
} from "@/lib/db/schema";
import { VenueReviewsClient } from "../sala/recenzii/client";

export const dynamic = "force-dynamic";

export default async function ArtistReviewsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in?redirect_url=/dashboard/recenzii");

  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) redirect("/");

  const [artist] = await db
    .select({
      id: artists.id,
      nameRo: artists.nameRo,
      slug: artists.slug,
    })
    .from(artists)
    .where(eq(artists.userId, appUser.id))
    .limit(1);

  // If the signed-in user doesn't have an artist profile, they might be a
  // venue owner — let them use that surface instead.
  if (!artist) redirect("/dashboard/sala/recenzii");

  const today = new Date().toISOString().slice(0, 10);

  const [artistReviews, reviewableBookings] = await Promise.all([
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
      .where(eq(reviews.artistId, artist.id))
      .orderBy(desc(reviews.createdAt)),

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
          eq(bookingRequests.artistId, artist.id),
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
      entityKind="artist"
      entityId={artist.id}
      entityName={artist.nameRo}
      entitySlug={artist.slug}
      reviews={artistReviews.map((r) => ({
        ...r,
        createdAt:
          r.createdAt instanceof Date
            ? r.createdAt.toISOString()
            : String(r.createdAt),
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
