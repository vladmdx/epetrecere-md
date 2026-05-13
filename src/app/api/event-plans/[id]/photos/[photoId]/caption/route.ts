// Phase 5/E3 — Claude-generated photo caption.
//
// POST /api/event-plans/[id]/photos/[photoId]/caption
// Owner-only. Reads the photo + plan context, asks Claude for a
// single Romanian caption, persists it on event_photos.caption,
// returns the result so the dashboard can update without a reload.

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { eventPhotos, eventPlans } from "@/lib/db/schema";
import { requirePlanOwnership } from "@/lib/planner/ownership";
import { generatePhotoCaption } from "@/lib/ai";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  const { id, photoId } = await params;
  const planId = Number(id);
  const photoIdNum = Number(photoId);
  if (!Number.isFinite(planId) || !Number.isFinite(photoIdNum)) {
    return NextResponse.json({ error: "Invalid ids" }, { status: 400 });
  }

  const owned = await requirePlanOwnership(planId);
  if (!owned.ok) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }

  // 60 AI calls per minute per IP is plenty for the bulk-tag use case
  // and well above what a single owner would trigger manually.
  const ip = req.headers.get("x-forwarded-for") || "anon";
  const { success } = await rateLimit(`ai-caption:${ip}`, 60, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Pull the photo + plan title in one round trip.
  const [row] = await db
    .select({
      id: eventPhotos.id,
      prompt: eventPhotos.prompt,
      guestName: eventPhotos.guestName,
      guestMessage: eventPhotos.guestMessage,
      planTitle: eventPlans.title,
    })
    .from(eventPhotos)
    .innerJoin(eventPlans, eq(eventPlans.id, eventPhotos.planId))
    .where(
      and(eq(eventPhotos.id, photoIdNum), eq(eventPhotos.planId, planId)),
    )
    .limit(1);
  if (!row) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  try {
    const caption = await generatePhotoCaption({
      eventTitle: row.planTitle,
      prompt: row.prompt,
      guestName: row.guestName,
      guestMessage: row.guestMessage,
    });
    if (!caption) {
      return NextResponse.json(
        { error: "Răspuns gol de la AI" },
        { status: 503 },
      );
    }
    await db
      .update(eventPhotos)
      .set({ caption })
      .where(eq(eventPhotos.id, photoIdNum));
    return NextResponse.json({ caption });
  } catch (err) {
    console.error("[ai-caption] failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI indisponibil" },
      { status: 503 },
    );
  }
}
