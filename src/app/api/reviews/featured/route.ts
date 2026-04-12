import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reviews } from "@/lib/db/schema";
import { eq, and, gte, desc } from "drizzle-orm";

// GET — return top-rated approved reviews for homepage testimonials
export async function GET() {
  const result = await db
    .select({
      id: reviews.id,
      authorName: reviews.authorName,
      rating: reviews.rating,
      text: reviews.text,
      eventType: reviews.eventType,
    })
    .from(reviews)
    .where(and(eq(reviews.isApproved, true), gte(reviews.rating, 4)))
    .orderBy(desc(reviews.rating), desc(reviews.createdAt))
    .limit(8);

  return NextResponse.json(result);
}
