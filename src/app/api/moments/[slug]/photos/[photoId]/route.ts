import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { eventPhotos, eventPlans } from "@/lib/db/schema";
import { requestHasMomentsAccess } from "@/lib/moments/access";
import { rateLimit } from "@/lib/rate-limit";
import { eraseManagedPhoto, photoErasureError, photoErasureSucceeded } from "@/lib/moments/erase-photo";

const deleteSchema = z.object({ deviceId: z.string().min(6).max(80) });
const reportSchema = z.object({ reason: z.string().trim().min(2).max(240) });

async function locate(slug: string, photoId: number) {
  const [row] = await db
    .select({ id: eventPhotos.id, url: eventPhotos.url, deviceId: eventPhotos.deviceId, planId: eventPlans.id })
    .from(eventPhotos)
    .innerJoin(eventPlans, eq(eventPlans.id, eventPhotos.planId))
    .where(and(eq(eventPlans.momentsSlug, slug), eq(eventPlans.momentsEnabled, true), eq(eventPhotos.id, photoId)))
    .limit(1);
  return row ?? null;
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; photoId: string }> },
) {
  const { slug, photoId: raw } = await params;
  if (!requestHasMomentsAccess(req, slug)) return NextResponse.json({ error: "Access code required" }, { status: 401 });
  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  const photoId = Number(raw);
  if (!parsed.success || !Number.isInteger(photoId)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const photo = await locate(slug, photoId);
  if (!photo || !photo.deviceId || photo.deviceId !== parsed.data.deviceId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const result = await eraseManagedPhoto(photo.url, { id: photo.planId, momentsSlug: slug });
  if (!photoErasureSucceeded(result)) return NextResponse.json(photoErasureError(result as "retry" | "unverified"), { status: result === "unverified" ? 409 : 503 });
  await db.delete(eventPhotos).where(and(eq(eventPhotos.id, photo.id), eq(eventPhotos.planId, photo.planId), eq(eventPhotos.deviceId, parsed.data.deviceId), eq(eventPhotos.url, photo.url)));
  return NextResponse.json({ deleted: true });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; photoId: string }> },
) {
  const { slug, photoId: raw } = await params;
  if (!requestHasMomentsAccess(req, slug)) return NextResponse.json({ error: "Access code required" }, { status: 401 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  const limited = await rateLimit(`moments-report:${ip}:${slug}`, 10, 60 * 60_000);
  if (!limited.success) return NextResponse.json({ error: "Too many reports" }, { status: 429 });
  const parsed = reportSchema.safeParse(await req.json().catch(() => null));
  const photoId = Number(raw);
  if (!parsed.success || !Number.isInteger(photoId)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const photo = await locate(slug, photoId);
  if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db
    .update(eventPhotos)
    .set({ isApproved: false, reportedAt: new Date(), reportReason: parsed.data.reason })
    .where(eq(eventPhotos.id, photo.id));
  return NextResponse.json({ reported: true });
}
