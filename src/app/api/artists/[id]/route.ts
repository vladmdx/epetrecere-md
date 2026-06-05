import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { artists, artistImages, artistVideos, artistPackages, reviews, users } from "@/lib/db/schema";
import { eq, and, asc, desc } from "drizzle-orm";

async function isAdmin(clerkId: string | null): Promise<boolean> {
  if (!clerkId) return false;
  const [u] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  return u?.role === "admin" || u?.role === "super_admin";
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Accept either a numeric id (admin/dashboard) OR a slug (public catalog +
  // the mobile app, which links artists by slug). Resolve the row first, then
  // use its numeric id for the related sub-queries below.
  const numericId = Number(id);
  const result = await db
    .select()
    .from(artists)
    .where(Number.isNaN(numericId) ? eq(artists.slug, id) : eq(artists.id, numericId))
    .limit(1);
  const artist = result[0];
  if (!artist) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const artistId = artist.id;

  const [images, videos, packages, artistReviews] = await Promise.all([
    db.select().from(artistImages).where(eq(artistImages.artistId, artistId)).orderBy(asc(artistImages.sortOrder)),
    db.select().from(artistVideos).where(eq(artistVideos.artistId, artistId)).orderBy(asc(artistVideos.sortOrder)),
    db.select().from(artistPackages).where(and(eq(artistPackages.artistId, artistId), eq(artistPackages.isVisible, true))),
    db.select().from(reviews).where(and(eq(reviews.artistId, artistId), eq(reviews.isApproved, true))).orderBy(desc(reviews.createdAt)).limit(20),
  ]);

  // Phone and email are admin-only (clients must communicate via platform).
  // Price and social links are visible to any authenticated user.
  const { userId } = await auth();
  const admin = await isAdmin(userId);
  let payload;
  if (admin) {
    payload = artist;
  } else if (userId) {
    payload = { ...artist, phone: null, email: null };
  } else {
    payload = {
      ...artist,
      priceFrom: null,
      phone: null,
      email: null,
      instagram: null,
      facebook: null,
      youtube: null,
      tiktok: null,
      website: null,
    };
  }

  return NextResponse.json({ ...payload, images, videos, packages, reviews: artistReviews });
}
