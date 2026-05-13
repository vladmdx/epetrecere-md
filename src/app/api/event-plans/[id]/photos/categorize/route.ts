// Phase 5/E1 — bulk AI photo classifier.
//
// POST /api/event-plans/[id]/photos/categorize
// Owner-only. Picks every photo that doesn't have a category yet
// (or all if ?force=1), asks Claude (vision) to classify each, writes
// the result back to event_photos.category. Returns a tally so the
// dashboard can show "Categorized 47 photos: 12 dans, 8 grup, ...".

import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { eventPhotos } from "@/lib/db/schema";
import { requirePlanOwnership } from "@/lib/planner/ownership";
import { classifyPhoto } from "@/lib/ai";
import { rateLimit } from "@/lib/rate-limit";

/** Per-call cap so an owner triggering this on a 500-photo gallery
 *  doesn't accidentally burn through their quota in one tap. They can
 *  hit the endpoint again to process the next batch. */
const BATCH_LIMIT = 80;

/** Concurrency on the vision API. Stays inside Anthropic's rate
 *  limits and keeps total runtime under ~30s for the BATCH_LIMIT. */
const CONCURRENCY = 4;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const planId = Number(id);
  if (!Number.isFinite(planId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const owned = await requirePlanOwnership(planId);
  if (!owned.ok) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }

  const ip = req.headers.get("x-forwarded-for") || "anon";
  // 5 bulk runs per hour per IP is generous — even a 500-photo gallery
  // finishes in 7 batches at 80 each.
  const { success } = await rateLimit(`ai-categorize:${ip}`, 5, 60 * 60_000);
  if (!success) {
    return NextResponse.json(
      { error: "Prea multe cereri — încearcă peste o oră." },
      { status: 429 },
    );
  }

  const force = req.nextUrl.searchParams.get("force") === "1";

  const candidates = await db
    .select({ id: eventPhotos.id, url: eventPhotos.url })
    .from(eventPhotos)
    .where(
      force
        ? eq(eventPhotos.planId, planId)
        : and(eq(eventPhotos.planId, planId), isNull(eventPhotos.category)),
    )
    .limit(BATCH_LIMIT);

  if (candidates.length === 0) {
    return NextResponse.json({
      processed: 0,
      remaining: 0,
      tally: {},
      message: force
        ? "Nu există poze pentru categorizare."
        : "Toate pozele sunt deja categorizate.",
    });
  }

  // Small worker pool so we don't open 80 HTTPS requests at once.
  const tally: Record<string, number> = {};
  async function worker(slice: typeof candidates) {
    for (const photo of slice) {
      try {
        const category = await classifyPhoto(photo.url);
        await db
          .update(eventPhotos)
          .set({ category })
          .where(eq(eventPhotos.id, photo.id));
        tally[category] = (tally[category] ?? 0) + 1;
      } catch (err) {
        console.error("[categorize] failed for", photo.id, err);
        tally["error"] = (tally["error"] ?? 0) + 1;
      }
    }
  }
  const chunks: (typeof candidates)[] = Array.from(
    { length: CONCURRENCY },
    () => [],
  );
  candidates.forEach((p, i) => chunks[i % CONCURRENCY].push(p));
  await Promise.all(chunks.map((c) => worker(c)));

  // Anything left to process — surfaces the "Mai există X poze
  // necategorizate" pill on the dashboard so the owner knows to tap
  // again. force=1 mode already re-runs over everything so leave it 0.
  let remaining = 0;
  if (!force) {
    const stillNull = await db
      .select({ id: eventPhotos.id })
      .from(eventPhotos)
      .where(
        and(eq(eventPhotos.planId, planId), isNull(eventPhotos.category)),
      );
    remaining = stillNull.length;
  }

  return NextResponse.json({
    processed: candidates.length,
    remaining,
    tally,
  });
}
