import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { artistImages } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// GET images for artist
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

// ADD image to artist
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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

// DELETE image
export async function DELETE(req: NextRequest) {
  const imageId = req.nextUrl.searchParams.get("imageId");
  if (!imageId) {
    return NextResponse.json({ error: "imageId required" }, { status: 400 });
  }

  await db.delete(artistImages).where(eq(artistImages.id, Number(imageId)));
  return NextResponse.json({ success: true });
}
