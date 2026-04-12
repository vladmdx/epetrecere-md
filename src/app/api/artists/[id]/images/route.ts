import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { artistImages, artists, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Verify the signed-in user owns this artist
async function requireArtistOwner(clerkId: string, artistId: number) {
  const [appUser] = await db.select({ id: users.id }).from(users).where(eq(users.clerkId, clerkId)).limit(1);
  if (!appUser) return false;
  const [artist] = await db.select({ userId: artists.userId }).from(artists).where(eq(artists.id, artistId)).limit(1);
  return artist?.userId === appUser.id;
}

// GET images for artist (public — used on artist detail page)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const images = await db
    .select()
    .from(artistImages)
    .where(eq(artistImages.artistId, Number(id)))
    .orderBy(artistImages.sortOrder);

  return NextResponse.json(images);
}

// ADD image to artist — auth + ownership required
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const isOwner = await requireArtistOwner(clerkId, Number(id));
  if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { url, altRo, altRu, altEn, isCover } = body;

  if (!url) {
    return NextResponse.json({ error: "URL required" }, { status: 400 });
  }

  // If setting as cover, unset other covers
  if (isCover) {
    await db
      .update(artistImages)
      .set({ isCover: false })
      .where(eq(artistImages.artistId, Number(id)));
  }

  const [image] = await db.insert(artistImages).values({
    artistId: Number(id),
    url,
    altRo: altRo || null,
    altRu: altRu || null,
    altEn: altEn || null,
    isCover: isCover || false,
    sortOrder: 0,
  }).returning();

  return NextResponse.json(image, { status: 201 });
}

// DELETE image — auth + ownership required
export async function DELETE(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const imageId = req.nextUrl.searchParams.get("imageId");
  const artistId = req.nextUrl.searchParams.get("artistId") || req.nextUrl.pathname.split("/").at(-2);
  if (!imageId) {
    return NextResponse.json({ error: "imageId required" }, { status: 400 });
  }

  // Verify ownership via the image's artist
  if (artistId) {
    const isOwner = await requireArtistOwner(clerkId, Number(artistId));
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.delete(artistImages).where(eq(artistImages.id, Number(imageId)));
  return NextResponse.json({ success: true });
}
