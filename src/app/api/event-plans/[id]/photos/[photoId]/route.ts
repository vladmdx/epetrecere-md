import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { eventPhotos } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { requirePlanOwnership } from "@/lib/planner/ownership";
import { eraseManagedPhoto, photoErasureError, photoErasureSucceeded } from "@/lib/moments/erase-photo";
import { serializePhoto } from "@/lib/moments/photo-url";

// M4 — PATCH / DELETE /api/event-plans/[id]/photos/[photoId]

const patchSchema = z.object({
  caption: z.string().max(500).optional().nullable(),
  isPublic: z.boolean().optional(),
  taggedArtistId: z.number().int().positive().optional().nullable(),
  taggedVenueId: z.number().int().positive().optional().nullable(),
  /** Phase 4B — owner-side approval flip used by the moderation
   *  queue. Approving a previously-pending guest photo flips this to
   *  true; rejecting it deletes the row (handled by DELETE). */
  isApproved: z.boolean().optional(),
  /** Phase 4B — favorite star. Filters the collage / ZIP / hero
   *  selection. */
  isFavorite: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  const { id, photoId } = await params;
  const planId = Number(id);
  const photoIdNum = Number(photoId);

  const owned = await requirePlanOwnership(planId);
  if (!owned.ok) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
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
    .where(
      and(eq(eventPhotos.id, photoIdNum), eq(eventPhotos.planId, planId)),
    )
    .returning();

  if (!photo) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  return NextResponse.json({ photo: serializePhoto(photo) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  const { id, photoId } = await params;
  const planId = Number(id);
  const photoIdNum = Number(photoId);

  const owned = await requirePlanOwnership(planId);
  if (!owned.ok) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }

  const [photo] = await db
    .select({ url: eventPhotos.url })
    .from(eventPhotos)
    .where(
      and(eq(eventPhotos.id, photoIdNum), eq(eventPhotos.planId, planId)),
    )
    .limit(1);
  if (!photo) return NextResponse.json({ ok: true });
  const result = await eraseManagedPhoto(photo.url, owned.plan);
  if (!photoErasureSucceeded(result)) return NextResponse.json(photoErasureError(result as "retry" | "unverified"), { status: result === "unverified" ? 409 : 503 });
  await db.delete(eventPhotos).where(and(eq(eventPhotos.id, photoIdNum), eq(eventPhotos.planId, planId), eq(eventPhotos.url, photo.url)));
  return NextResponse.json({ ok: true });
}
