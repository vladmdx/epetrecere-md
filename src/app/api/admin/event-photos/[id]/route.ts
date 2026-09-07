import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { eventPhotos, eventPlans } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/admin";
import { serializePhoto } from "@/lib/moments/photo-url";
import { eraseManagedPhoto, photoErasureError, photoErasureSucceeded } from "@/lib/moments/erase-photo";

// M5 — PATCH / DELETE /api/admin/event-photos/[id]
//
// PATCH is used to approve/reject (and optionally make public) a photo.
// DELETE permanently removes a photo when admin rejects outright.

const patchSchema = z.object({
  isApproved: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  taggedArtistId: z.number().int().positive().nullable().optional(),
  taggedVenueId: z.number().int().positive().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id } = await params;
  const photoId = Number(id);
  if (!Number.isFinite(photoId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const [photo] = await db
    .update(eventPhotos)
    .set(parsed.data)
    .where(eq(eventPhotos.id, photoId))
    .returning();

  if (!photo) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  return NextResponse.json({ photo: serializePhoto(photo) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id } = await params;
  const photoId = Number(id);
  if (!Number.isFinite(photoId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const [photo] = await db.select({ url: eventPhotos.url, planId: eventPlans.id, momentsSlug: eventPlans.momentsSlug })
    .from(eventPhotos).innerJoin(eventPlans, eq(eventPlans.id, eventPhotos.planId)).where(eq(eventPhotos.id, photoId)).limit(1);
  if (!photo) return NextResponse.json({ ok: true });
  const result = await eraseManagedPhoto(photo.url, { id: photo.planId, momentsSlug: photo.momentsSlug });
  if (!photoErasureSucceeded(result)) return NextResponse.json(photoErasureError(result as "retry" | "unverified"), { status: result === "unverified" ? 409 : 503 });
  await db.delete(eventPhotos).where(and(eq(eventPhotos.id, photoId), eq(eventPhotos.planId, photo.planId), eq(eventPhotos.url, photo.url)));
  return NextResponse.json({ ok: true });
}
