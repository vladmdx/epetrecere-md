import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { eventPhotos, eventPlans, users } from "@/lib/db/schema";
import { requestHasMomentsAccess } from "@/lib/moments/access";
import { canReadPhoto } from "@/lib/moments/photo-access";
import { readPhotoContentBytes } from "@/lib/moments/managed-photo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "Vercel-CDN-Cache-Control": "no-store",
  "CDN-Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, noarchive, nosnippet",
  "Vary": "Cookie, Authorization",
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const photoId = Number(id);
  const missing = () => NextResponse.json({ error: "Photo not found" }, { status: 404, headers });
  if (!Number.isSafeInteger(photoId) || photoId < 1) return missing();
  const [photo] = await db.select({
    id: eventPhotos.id, url: eventPhotos.url, planId: eventPlans.id,
    ownerId: eventPlans.userId, isPublic: eventPhotos.isPublic, isApproved: eventPhotos.isApproved,
    momentsSlug: eventPlans.momentsSlug, momentsEnabled: eventPlans.momentsEnabled,
    momentsRevealAt: eventPlans.momentsRevealAt,
  }).from(eventPhotos).innerJoin(eventPlans, eq(eventPlans.id, eventPhotos.planId))
    .where(eq(eventPhotos.id, photoId)).limit(1);
  if (!photo) return missing();
  const { userId: clerkId } = await auth();
  const [actor] = clerkId ? await db.select({ id: users.id, role: users.role }).from(users)
    .where(eq(users.clerkId, clerkId)).limit(1) : [];
  const galleryAccess = Boolean(photo.momentsSlug && requestHasMomentsAccess(req, photo.momentsSlug));
  if (!canReadPhoto(photo, actor ?? null, galleryAccess)) return missing();
  const bytes = await readPhotoContentBytes(photo.url, { id: photo.planId, momentsSlug: photo.momentsSlug }, 4 * 1024 * 1024, true);
  if (!bytes) return missing();
  const extension = photo.url.split(".").pop()?.toLowerCase();
  const contentType = extension === "png" ? "image/png" : extension === "gif" ? "image/gif" : extension === "webp" ? "image/webp" : "image/jpeg";
  return new Response(bytes.buffer as ArrayBuffer, { headers: { ...headers, "Content-Type": contentType, "Content-Length": String(bytes.byteLength) } });
}
