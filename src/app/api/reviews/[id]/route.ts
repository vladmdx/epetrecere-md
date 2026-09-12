import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { requireVenueCapability } from "@/lib/venue-access";
import { reviews, artists, venues, users } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/admin";
import { revalidateVendorCatalog } from "@/lib/vendors/revalidate";

type ReviewTarget = {
  artistId: number | null;
  venueId: number | null;
  artistSlug: string | null;
  venueSlug: string | null;
  artistIsActive: boolean | null;
  venueIsActive: boolean | null;
};

function revalidateReviewTarget(target: ReviewTarget, ratingChanged: boolean) {
  if (target.artistId && target.artistIsActive) {
    revalidateVendorCatalog("artist", {
      profileSlugs: [target.artistSlug],
      directory: ratingChanged,
      homepage: ratingChanged,
    });
  }
  if (target.venueId && target.venueIsActive) {
    revalidateVendorCatalog("venue", {
      profileSlugs: [target.venueSlug],
      directory: ratingChanged,
      homepage: ratingChanged,
    });
  }
}

/** Minimal, uncached owner read for reconciling a reply whose write response was lost. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!Number.isSafeInteger(Number(id)) || Number(id) < 1) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  const [appUser] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.clerkId, clerkId)).limit(1);
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [review] = await db.select({ id: reviews.id, reply: reviews.reply, replyAt: reviews.replyAt, artistId: reviews.artistId, venueId: reviews.venueId })
    .from(reviews).where(eq(reviews.id, Number(id))).limit(1);
  if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 });
  let owns = appUser.role === "admin" || appUser.role === "super_admin";
  if (!owns && review.artistId) {
    const [artist] = await db.select({ id: artists.id }).from(artists)
      .where(and(eq(artists.id, review.artistId), eq(artists.userId, appUser.id))).limit(1);
    owns = !!artist;
  }
  if (!owns && review.venueId) {
    const access = await requireVenueCapability(review.venueId, "request_reviews");
    owns = access.ok;
  }
  if (!owns) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ id: review.id, reply: review.reply, replyAt: review.replyAt }, { headers: { "Cache-Control": "private, no-store" } });
}

/**
 * Recompute rating_avg + rating_count for the artist or venue this review
 * belongs to, based on ONLY approved reviews. Called after approve / delete
 * so the public card reflects the latest aggregate immediately.
 */
async function refreshRatingAggregate(review: {
  artistId: number | null;
  venueId: number | null;
  artistSlug: string | null;
  venueSlug: string | null;
  artistIsActive: boolean | null;
  venueIsActive: boolean | null;
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
  revalidateReviewTarget(review, true);
}

// Approve / reject review — admin only; Reply — admin OR artist owner
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!Number.isSafeInteger(Number(id)) || Number(id) < 1) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { action, reply } = body;
  if (reply !== undefined && (typeof reply !== "string" || reply.trim().length < 1 || reply.length > 5000)) {
    return NextResponse.json({ error: "Reply must contain 1 to 5000 characters" }, { status: 400 });
  }

  // If action is "approve" or "reject", require admin
  if (action === "approve" || action === "reject") {
    const admin = await requireAdmin();
    if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });

    // Capture the target before mutation so we know which aggregate to refresh.
    const [target] = await db
      .select({
        artistId: reviews.artistId,
        venueId: reviews.venueId,
        artistSlug: artists.slug,
        venueSlug: venues.slug,
        artistIsActive: artists.isActive,
        venueIsActive: venues.isActive,
      })
      .from(reviews)
      .leftJoin(artists, eq(artists.id, reviews.artistId))
      .leftJoin(venues, eq(venues.id, reviews.venueId))
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
      const [target] = await db
        .select({
          artistId: reviews.artistId,
          venueId: reviews.venueId,
          artistSlug: artists.slug,
          venueSlug: venues.slug,
          artistIsActive: artists.isActive,
          venueIsActive: venues.isActive,
        })
        .from(reviews)
        .leftJoin(artists, eq(artists.id, reviews.artistId))
        .leftJoin(venues, eq(venues.id, reviews.venueId))
        .where(eq(reviews.id, Number(id)))
        .limit(1);
      if (!target) return NextResponse.json({ error: "Review not found" }, { status: 404 });
      const [updated] = await db
        .update(reviews)
        .set({ reply: reply.trim(), replyAt: new Date() })
        .where(eq(reviews.id, Number(id)))
        .returning({ id: reviews.id });
      if (!updated) return NextResponse.json({ error: "Review not found" }, { status: 404 });
      revalidateReviewTarget(target, false);
      return NextResponse.json({ success: true });
    }

    // Check if artist owner of this review
    const [appUser] = await db.select({ id: users.id }).from(users).where(eq(users.clerkId, clerkId)).limit(1);
    if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [review] = await db
      .select({
        artistId: reviews.artistId,
        venueId: reviews.venueId,
        artistSlug: artists.slug,
        venueSlug: venues.slug,
        artistIsActive: artists.isActive,
        venueIsActive: venues.isActive,
      })
      .from(reviews)
      .leftJoin(artists, eq(artists.id, reviews.artistId))
      .leftJoin(venues, eq(venues.id, reviews.venueId))
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
      const access = await requireVenueCapability(review.venueId, "request_reviews");
      if (access.ok) owns = true;
    }
    if (!owns) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await db
      .update(reviews)
      .set({ reply: reply.trim(), replyAt: new Date() })
      .where(eq(reviews.id, Number(id)));
    revalidateReviewTarget(review, false);
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
    .select({
      artistId: reviews.artistId,
      venueId: reviews.venueId,
      artistSlug: artists.slug,
      venueSlug: venues.slug,
      artistIsActive: artists.isActive,
      venueIsActive: venues.isActive,
    })
    .from(reviews)
    .leftJoin(artists, eq(artists.id, reviews.artistId))
    .leftJoin(venues, eq(venues.id, reviews.venueId))
    .where(eq(reviews.id, Number(id)))
    .limit(1);
  if (!target) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }
  await db.delete(reviews).where(eq(reviews.id, Number(id)));
  await refreshRatingAggregate(target);
  return NextResponse.json({ success: true });
}
