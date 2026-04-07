import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reviews } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  const allReviews = await db
    .select()
    .from(reviews)
    .orderBy(desc(reviews.createdAt))
    .limit(100);

  return NextResponse.json(allReviews);
}
