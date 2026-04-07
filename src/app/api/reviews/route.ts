import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { reviews } from "@/lib/db/schema";
import { rateLimit } from "@/lib/rate-limit";

const reviewSchema = z.object({
  artistId: z.number().optional(),
  venueId: z.number().optional(),
  authorName: z.string().min(2),
  eventType: z.string().optional(),
  rating: z.number().min(1).max(5),
  text: z.string().min(10).max(1000),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const { success } = rateLimit(`review:${ip}`, 5, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Too many reviews" }, { status: 429 });
  }

  const body = await req.json();
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  }

  const [review] = await db.insert(reviews).values({
    ...parsed.data,
    isApproved: false, // Needs admin approval
  }).returning();

  return NextResponse.json(review, { status: 201 });
}
