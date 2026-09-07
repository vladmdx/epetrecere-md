import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { eventPhotos } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { requirePlanOwnership } from "@/lib/planner/ownership";
import sharp from "sharp";
import { deleteManagedPhoto, storePrivatePhoto } from "@/lib/moments/managed-photo";
import { serializePhoto } from "@/lib/moments/photo-url";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// M4 — /api/event-plans/[id]/photos
//
// GET  — list photos attached to this plan.
// POST — owner-only multipart image processing + storage + attachment.
// Arbitrary JSON URLs can never authorize another asset's deletion/download.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const planId = Number(id);

  const owned = await requirePlanOwnership(planId);
  if (!owned.ok) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }

  const photos = await db
    .select()
    .from(eventPhotos)
    .where(eq(eventPhotos.planId, planId))
    .orderBy(desc(eventPhotos.createdAt));

  return NextResponse.json({ photos: photos.map(serializePhoto) }, { headers: { "Cache-Control": "private, no-store" } });
}

const createPhotoSchema = z.object({
  caption: z.string().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const planId = Number(id);

  const owned = await requirePlanOwnership(planId);
  if (!owned.ok) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }

  if (!req.headers.get("content-type")?.startsWith("multipart/form-data")) {
    return NextResponse.json({ error: "Upload the image through the protected photo endpoint" }, { status: 410 });
  }
  const limited = await rateLimit(`owner-photo:${owned.userId}:${planId}`, 20, 60_000);
  if (!limited.success) return NextResponse.json({ error: "Too many uploads" }, { status: 429 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const parsed = createPhotoSchema.safeParse({ caption: form?.get("caption") || undefined });
  if (!parsed.success || !(file instanceof File) || !file.type.startsWith("image/") || file.size < 1) {
    return NextResponse.json({ error: "A valid image and caption are required" }, { status: 400 });
  }
  // Multipart overhead also counts toward Vercel's 4.5 MB request limit.
  if (file.size > 4 * 1024 * 1024) return NextResponse.json({ error: "Image must be at most 4 MB" }, { status: 413 });
  if (!process.env.MOMENTS_BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "Private photo storage unavailable" }, { status: 503 });
  let cleaned: Buffer;
  try {
    cleaned = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000 })
      .rotate().resize({ width: 3000, height: 3000, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 88 }).toBuffer();
  } catch { return NextResponse.json({ error: "Image could not be processed" }, { status: 400 }); }
  if (cleaned.byteLength > 4 * 1024 * 1024) return NextResponse.json({ error: "Processed image must be at most 4 MB" }, { status: 413 });
  let url: string;
  try {
    url = await storePrivatePhoto(cleaned, planId);
  } catch { return NextResponse.json({ error: "Photo storage unavailable" }, { status: 503 }); }
  try {
    const [photo] = await db
    .insert(eventPhotos)
    .values({
      planId,
      userId: owned.userId,
      url,
      caption: parsed.data.caption,
      isPublic: false,
      isApproved: false,
    })
    .returning();

    return NextResponse.json({ photo: serializePhoto(photo) }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    await deleteManagedPhoto(url, owned.plan);
    return NextResponse.json({ error: "Photo could not be saved" }, { status: 503 });
  }
}
