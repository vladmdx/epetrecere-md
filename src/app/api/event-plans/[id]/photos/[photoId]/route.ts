import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { eventPhotos } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { requirePlanOwnership } from "@/lib/planner/ownership";

// M4 — PATCH / DELETE /api/event-plans/[id]/photos/[photoId]

const patchSchema = z.object({
  caption: z.string().max(500).optional().nullable(),
  isPublic: z.boolean().optional(),
  taggedArtistId: z.number().int().positive().optional().nullable(),
  taggedVenueId: z.number().int().positive().optional().nullable(),
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

  return NextResponse.json({ photo });
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

  await db
    .delete(eventPhotos)
    .where(
      and(eq(eventPhotos.id, photoIdNum), eq(eventPhotos.planId, planId)),
    );

  return NextResponse.json({ ok: true });
}
