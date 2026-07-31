import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reviews } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";

// Public reads expose approved reviews only.
export async function GET(req: NextRequest) {
  const artistId = req.nextUrl.searchParams.get("artist_id");
  const venueId = req.nextUrl.searchParams.get("venue_id");

  if (!artistId && !venueId) {
    return NextResponse.json(
      { error: "artist_id or venue_id required" },
      { status: 400 },
    );
  }

  const conditions = [eq(reviews.isApproved, true)];
  if (artistId) conditions.push(eq(reviews.artistId, Number(artistId)));
  if (venueId) conditions.push(eq(reviews.venueId, Number(venueId)));

  const result = await db
    .select({
      id: reviews.id,
      authorName: reviews.authorName,
      rating: reviews.rating,
      text: reviews.text,
      eventType: reviews.eventType,
      reply: reviews.reply,
      photos: reviews.photos,
      createdAt: reviews.createdAt,
    })
    .from(reviews)
    .where(and(...conditions))
    .orderBy(desc(reviews.createdAt))
    .limit(50);

  return NextResponse.json(result);
}

// Unlinked public reviews are intentionally disabled. Reviews are created by
// POST /api/reviews/from-booking, which verifies ownership, confirmation,
// event date and duplicate submissions before storing anything.
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Recenziile se trimit din cabinet, după o rezervare confirmată și finalizată.",
    },
    { status: 410 },
  );
}
