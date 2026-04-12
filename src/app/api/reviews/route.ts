import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { reviews, artists, venues } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { rateLimit } from "@/lib/rate-limit";
import { dispatchNotification, dispatchToAdmins } from "@/lib/notifications/dispatch";

// GET — list reviews for an artist or venue (public, only approved; or all if owner)
export async function GET(req: NextRequest) {
  const artistId = req.nextUrl.searchParams.get("artist_id");
  const venueId = req.nextUrl.searchParams.get("venue_id");

  if (!artistId && !venueId) {
    return NextResponse.json({ error: "artist_id or venue_id required" }, { status: 400 });
  }

  const conditions = [eq(reviews.isApproved, true)];
  if (artistId) conditions.push(eq(reviews.artistId, Number(artistId)));
  if (venueId) conditions.push(eq(reviews.venueId, Number(venueId)));

  const { and, desc } = await import("drizzle-orm");
  const result = await db
    .select({
      id: reviews.id,
      authorName: reviews.authorName,
      rating: reviews.rating,
      text: reviews.text,
      eventType: reviews.eventType,
      reply: reviews.reply,
      createdAt: reviews.createdAt,
    })
    .from(reviews)
    .where(and(...conditions))
    .orderBy(desc(reviews.createdAt))
    .limit(50);

  return NextResponse.json(result);
}

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
  const { success } = await rateLimit(`review:${ip}`, 5, 60_000);
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

  // M5 — dispatch in-app notifications (non-blocking)
  void (async () => {
    try {
      await dispatchToAdmins({
        type: "admin_review_pending",
        title: "Recenzie nouă de aprobat",
        message: `${parsed.data.authorName} — ${parsed.data.rating}★`,
        actionUrl: "/admin/recenzii",
      });
      if (parsed.data.artistId) {
        const [artist] = await db
          .select({ userId: artists.userId })
          .from(artists)
          .where(eq(artists.id, parsed.data.artistId))
          .limit(1);
        if (artist?.userId) {
          await dispatchNotification({
            userId: artist.userId,
            type: "review_new",
            title: "Ai o recenzie nouă",
            message: `${parsed.data.rating}★ de la ${parsed.data.authorName}`,
            actionUrl: "/dashboard/recenzii",
          });
        }
      }
      if (parsed.data.venueId) {
        const [venue] = await db
          .select({ userId: venues.userId })
          .from(venues)
          .where(eq(venues.id, parsed.data.venueId))
          .limit(1);
        if (venue?.userId) {
          await dispatchNotification({
            userId: venue.userId,
            type: "review_new",
            title: "Ai o recenzie nouă",
            message: `${parsed.data.rating}★ de la ${parsed.data.authorName}`,
            actionUrl: "/dashboard/recenzii",
          });
        }
      }
    } catch (err) {
      console.error("[notifications] review POST", err);
    }
  })();

  return NextResponse.json(review, { status: 201 });
}
