import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { artists, artistImages, artistVideos, artistPackages, reviews } from "@/lib/db/schema";
import { eq, and, asc, desc } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const artistId = Number(id);
  if (isNaN(artistId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const result = await db.select().from(artists).where(eq(artists.id, artistId)).limit(1);
  const artist = result[0];
  if (!artist) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [images, videos, packages, artistReviews] = await Promise.all([
    db.select().from(artistImages).where(eq(artistImages.artistId, artistId)).orderBy(asc(artistImages.sortOrder)),
    db.select().from(artistVideos).where(eq(artistVideos.artistId, artistId)).orderBy(asc(artistVideos.sortOrder)),
    db.select().from(artistPackages).where(and(eq(artistPackages.artistId, artistId), eq(artistPackages.isVisible, true))),
    db.select().from(reviews).where(and(eq(reviews.artistId, artistId), eq(reviews.isApproved, true))).orderBy(desc(reviews.createdAt)).limit(20),
  ]);

  // M0a #8 — contact/price gated behind login.
  const { userId } = await auth();
  const payload = userId
    ? artist
    : {
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

  return NextResponse.json({ ...payload, images, videos, packages, reviews: artistReviews });
}
