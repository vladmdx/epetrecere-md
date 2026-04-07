import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { venues, venueImages, reviews } from "@/lib/db/schema";
import { eq, and, asc, desc } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const venueId = Number(id);
  if (isNaN(venueId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const result = await db.select().from(venues).where(eq(venues.id, venueId)).limit(1);
  const venue = result[0];
  if (!venue) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [images, venueReviews] = await Promise.all([
    db.select().from(venueImages).where(eq(venueImages.venueId, venueId)).orderBy(asc(venueImages.sortOrder)),
    db.select().from(reviews).where(and(eq(reviews.venueId, venueId), eq(reviews.isApproved, true))).orderBy(desc(reviews.createdAt)).limit(20),
  ]);

  return NextResponse.json({ ...venue, images, reviews: venueReviews });
}
