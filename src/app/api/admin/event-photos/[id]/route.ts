import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { eventPhotos } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/admin";

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

  return NextResponse.json({ photo });
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

  await db.delete(eventPhotos).where(eq(eventPhotos.id, photoId));
  return NextResponse.json({ ok: true });
}
