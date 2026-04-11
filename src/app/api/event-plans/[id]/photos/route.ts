import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { eventPhotos } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { requirePlanOwnership } from "@/lib/planner/ownership";

// M4 — /api/event-plans/[id]/photos
//
// GET  — list photos attached to this plan.
// POST — attach an already-uploaded image (from /api/upload) to the plan,
//        optionally tagging the artist or venue that worked the event.
//        Photos are marked not-approved so admins can moderate UGC
//        before it surfaces publicly.

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

  return NextResponse.json({ photos });
}

const createPhotoSchema = z.object({
  url: z.string().url(),
  caption: z.string().max(500).optional(),
  taggedArtistId: z.number().int().positive().optional().nullable(),
  taggedVenueId: z.number().int().positive().optional().nullable(),
  isPublic: z.boolean().optional(),
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

  const body = await req.json().catch(() => null);
  const parsed = createPhotoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const [photo] = await db
    .insert(eventPhotos)
    .values({
      planId,
      userId: owned.userId,
      url: parsed.data.url,
      caption: parsed.data.caption,
      taggedArtistId: parsed.data.taggedArtistId ?? null,
      taggedVenueId: parsed.data.taggedVenueId ?? null,
      isPublic: parsed.data.isPublic ?? false,
      isApproved: false,
    })
    .returning();

  return NextResponse.json({ photo }, { status: 201 });
}
