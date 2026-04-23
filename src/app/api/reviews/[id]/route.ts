import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { reviews, artists, venues, users } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/admin";

/**
 * Recompute rating_avg + rating_count for the artist or venue this review
 * belongs to, based on ONLY approved reviews. Called after approve / delete
 * so the public card reflects the latest aggregate immediately.
 */
async function refreshRatingAggregate(review: {
  artistId: number | null;
  venueId: number | null;
}) {
  if (review.artistId) {
    await db.execute(sql`
      UPDATE artists
      SET rating_avg = COALESCE((
        SELECT AVG(rating)::numeric(3,2)
        FROM reviews
        WHERE artist_id = ${review.artistId} AND is_approved = true
      ), 0),
      rating_count = COALESCE((
        SELECT COUNT(*) FROM reviews
        WHERE artist_id = ${review.artistId} AND is_approved = true
      ), 0)
      WHERE id = ${review.artistId}
    `);
  }
  if (review.venueId) {
    await db.execute(sql`
      UPDATE venues
      SET rating_avg = COALESCE((
        SELECT AVG(rating)::numeric(3,2)
        FROM reviews
        WHERE venue_id = ${review.venueId} AND is_approved = true
      ), 0),
      rating_count = COALESCE((
        SELECT COUNT(*) FROM reviews
        WHERE venue_id = ${review.venueId} AND is_approved = true
      ), 0)
      WHERE id = ${review.venueId}
    `);
  }
}

// Approve / reject review — admin only; Reply — admin OR artist owner
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const { action, reply } = body;

  // If action is "approve" or "reject", require admin
  if (action === "approve" || action === "reject") {
    const admin = await requireAdmin();
    if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });

    // Capture the target before mutation so we know which aggregate to refresh.
    const [target] = await db
      .select({
        artistId: reviews.artistId,
        venueId: reviews.venueId,
      })
      .from(reviews)
      .where(eq(reviews.id, Number(id)))
      .limit(1);
    if (!target) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }

    if (action === "approve") {
      await db.update(reviews).set({ isApproved: true }).where(eq(reviews.id, Number(id)));
    } else {
      await db.delete(reviews).where(eq(reviews.id, Number(id)));
    }
    // Recompute aggregate so the artist/venue card shows the new rating
    // immediately, no manual job or re-index needed.
    await refreshRatingAggregate(target);
    return NextResponse.json({ success: true });
  }

  // If reply is provided, allow both admin AND the artist owner
  if (reply !== undefined) {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Check if admin
    const adminCheck = await requireAdmin();
    if (adminCheck.ok) {
      await db.update(reviews).set({ reply }).where(eq(reviews.id, Number(id)));
      return NextResponse.json({ success: true });
    }

    // Check if artist owner of this review
    const [appUser] = await db.select({ id: users.id }).from(users).where(eq(users.clerkId, clerkId)).limit(1);
    if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [review] = await db
      .select({ artistId: reviews.artistId, venueId: reviews.venueId })
      .from(reviews)
      .where(eq(reviews.id, Number(id)))
      .limit(1);
    if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 });

    // Owner can be either the artist owner or the venue owner
    let owns = false;
    if (review.artistId) {
      const [artist] = await db
        .select({ id: artists.id })
        .from(artists)
        .where(and(eq(artists.id, review.artistId), eq(artists.userId, appUser.id)))
        .limit(1);
      if (artist) owns = true;
    }
    if (!owns && review.venueId) {
      const [venue] = await db
        .select({ id: venues.id })
        .from(venues)
        .where(and(eq(venues.id, review.venueId), eq(venues.userId, appUser.id)))
        .limit(1);
      if (venue) owns = true;
    }
    if (!owns) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await db
      .update(reviews)
      .set({ reply, replyAt: new Date() })
      .where(eq(reviews.id, Number(id)));
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });

  const { id } = await params;
  const [target] = await db
    .select({ artistId: reviews.artistId, venueId: reviews.venueId })
    .from(reviews)
    .where(eq(reviews.id, Number(id)))
    .limit(1);
  if (!target) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }
  await db.delete(reviews).where(eq(reviews.id, Number(id)));
  await refreshRatingAggregate(target);
  return NextResponse.json({ success: true });
}
