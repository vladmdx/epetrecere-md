// Phase 4A — guest emoji reactions on event photos.
//
// POST   — toggle a reaction. Same device pressing the same emoji on
//          the same photo twice removes the reaction. Anonymous —
//          uses the device id the guest UI already maintains.
//
// Reactions are gated behind reveal: before the gallery is revealed
// guests have nothing to react to from their side, so we 403. The
// owner doesn't use this endpoint (their moderation UI works against
// the authenticated /api/event-plans/[id]/photos route).

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { eventPhotos, eventPlans, photoReactions } from "@/lib/db/schema";
import { rateLimit } from "@/lib/rate-limit";

const ALLOWED_EMOJI = ["❤️", "🔥", "😂", "🥺", "🎉"] as const;

const schema = z.object({
  photoId: z.number().int().positive(),
  emoji: z.enum(ALLOWED_EMOJI),
  deviceId: z.string().min(6).max(80),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const ip = req.headers.get("x-forwarded-for") || "anon";
  // 60 toggles per minute per IP — generous for a wedding crowd
  // tap-dancing on a popular photo, tight enough to stop a bot.
  const { success } = await rateLimit(`reactions:${ip}:${slug}`, 60, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Too many reactions" }, { status: 429 });
  }

  const [plan] = await db
    .select({
      id: eventPlans.id,
      momentsEnabled: eventPlans.momentsEnabled,
      momentsRevealAt: eventPlans.momentsRevealAt,
    })
    .from(eventPlans)
    .where(eq(eventPlans.momentsSlug, slug))
    .limit(1);
  if (!plan || !plan.momentsEnabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (
    plan.momentsRevealAt &&
    plan.momentsRevealAt.getTime() > Date.now()
  ) {
    return NextResponse.json(
      { error: "Galeria nu este încă dezvăluită." },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  // Confirm the photo belongs to this plan — stops a malicious caller
  // from reacting to a photo on a different event by guessing its id.
  const [photo] = await db
    .select({ id: eventPhotos.id })
    .from(eventPhotos)
    .where(
      and(
        eq(eventPhotos.id, parsed.data.photoId),
        eq(eventPhotos.planId, plan.id),
      ),
    )
    .limit(1);
  if (!photo) {
    return NextResponse.json(
      { error: "Photo not on this plan" },
      { status: 404 },
    );
  }

  // Toggle semantics: if (photo, device, emoji) already exists, delete
  // it; otherwise insert. We keep the round-trip count to 1 query for
  // each branch via a delete-then-check-rowcount pattern.
  const existing = await db
    .select({ id: photoReactions.id })
    .from(photoReactions)
    .where(
      and(
        eq(photoReactions.photoId, parsed.data.photoId),
        eq(photoReactions.deviceId, parsed.data.deviceId),
        eq(photoReactions.emoji, parsed.data.emoji),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .delete(photoReactions)
      .where(eq(photoReactions.id, existing[0].id));
    return NextResponse.json({ removed: true, emoji: parsed.data.emoji });
  }

  await db.insert(photoReactions).values({
    photoId: parsed.data.photoId,
    deviceId: parsed.data.deviceId,
    emoji: parsed.data.emoji,
  });
  return NextResponse.json({ added: true, emoji: parsed.data.emoji });
}
