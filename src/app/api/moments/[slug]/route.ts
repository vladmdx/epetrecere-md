// Event Moments — public endpoints for QR-based guest photo gallery.
//
// GET  — return film metadata + photos.
//        Photos are gated by `revealAt`: when it's set and in the future,
//        we hide every photo from guests but still report the count so
//        the UI can show a "X poze încărcate până acum" teaser.
// POST — anonymous guest upload. Rate-limited per IP, gated by the
//        upload window (openAt..closeAt) and the per-device shot limit
//        (counted by device_id).
//
// The owner sees everything regardless — moderation happens via
// /cabinet/moments/[id] which calls authenticated owner endpoints.

import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { eventPhotos, eventPlans, photoReactions } from "@/lib/db/schema";
import { rateLimit } from "@/lib/rate-limit";

interface MomentsPlan {
  id: number;
  title: string;
  eventDate: string | null;
  momentsEnabled: boolean;
  momentsOpenAt: Date | null;
  momentsCloseAt: Date | null;
  momentsRevealAt: Date | null;
  momentsShotLimit: number | null;
  momentsVintage: boolean;
  momentsPrompts: string[] | null;
  momentsRequireApproval: boolean;
  momentsTables: string[] | null;
}

async function findPlan(slug: string): Promise<MomentsPlan | null> {
  const [plan] = await db
    .select({
      id: eventPlans.id,
      title: eventPlans.title,
      eventDate: eventPlans.eventDate,
      momentsEnabled: eventPlans.momentsEnabled,
      momentsOpenAt: eventPlans.momentsOpenAt,
      momentsCloseAt: eventPlans.momentsCloseAt,
      momentsRevealAt: eventPlans.momentsRevealAt,
      momentsShotLimit: eventPlans.momentsShotLimit,
      momentsVintage: eventPlans.momentsVintage,
      momentsPrompts: eventPlans.momentsPrompts,
      momentsRequireApproval: eventPlans.momentsRequireApproval,
      momentsTables: eventPlans.momentsTables,
    })
    .from(eventPlans)
    .where(eq(eventPlans.momentsSlug, slug))
    .limit(1);
  return plan ?? null;
}

/** Describe the upload window relative to `now`. Used by both GET (so
 *  the guest UI can render the right countdown) and POST (so we can
 *  reject early uploads with a clear reason). */
function uploadState(plan: MomentsPlan, now: Date): "before" | "open" | "after" {
  if (plan.momentsOpenAt && now < plan.momentsOpenAt) return "before";
  if (plan.momentsCloseAt && now >= plan.momentsCloseAt) return "after";
  return "open";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const plan = await findPlan(slug);
  if (!plan || !plan.momentsEnabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const now = new Date();
  const state = uploadState(plan, now);
  const revealed = !plan.momentsRevealAt || now >= plan.momentsRevealAt;

  // Always compute the count so guests can see "153 cadre primite" even
  // before reveal. The actual rows stay hidden until reveal time.
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(eventPhotos)
    .where(
      and(
        eq(eventPhotos.planId, plan.id),
        eq(eventPhotos.isApproved, true),
      ),
    );

  // Per-device usage counter — lets the guest UI show "5/20 cadre"
  // without a second round trip. Only computed when the limit is set
  // AND the device_id query param is provided.
  const deviceId = req.nextUrl.searchParams.get("device_id");
  let deviceUsed: number | null = null;
  if (plan.momentsShotLimit && deviceId && deviceId.length > 0) {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(eventPhotos)
      .where(
        and(
          eq(eventPhotos.planId, plan.id),
          eq(eventPhotos.deviceId, deviceId),
        ),
      );
    deviceUsed = row?.count ?? 0;
  }

  const photos = revealed
    ? await db
        .select({
          id: eventPhotos.id,
          url: eventPhotos.url,
          guestName: eventPhotos.guestName,
          guestMessage: eventPhotos.guestMessage,
          prompt: eventPhotos.prompt,
          createdAt: eventPhotos.createdAt,
        })
        .from(eventPhotos)
        .where(
          and(
            eq(eventPhotos.planId, plan.id),
            eq(eventPhotos.isApproved, true),
          ),
        )
        .orderBy(desc(eventPhotos.createdAt))
        .limit(500)
    : [];

  // Phase 4A — pull per-photo reaction counts so the gallery can
  // render "❤️ 5  🔥 3" badges without a second round trip. Only
  // computed when photos are revealed (otherwise nothing to react to
  // from the public perspective) AND when there are photos to look up.
  const reactionsByPhoto: Record<number, Record<string, number>> = {};
  const myReactions: Record<number, string[]> = {};
  if (revealed && photos.length > 0) {
    const ids = photos.map((p) => p.id);
    const rows = await db
      .select({
        photoId: photoReactions.photoId,
        emoji: photoReactions.emoji,
        deviceId: photoReactions.deviceId,
      })
      .from(photoReactions)
      .where(inArray(photoReactions.photoId, ids));
    for (const r of rows) {
      const bucket = (reactionsByPhoto[r.photoId] ??= {});
      bucket[r.emoji] = (bucket[r.emoji] ?? 0) + 1;
      if (deviceId && r.deviceId === deviceId) {
        (myReactions[r.photoId] ??= []).push(r.emoji);
      }
    }
  }

  // Phase 4A — which prompts has THIS device already answered?
  // Lets the guest UI skip past completed missions instead of
  // re-showing them. Reads from event_photos.prompt directly.
  let promptsDone: string[] = [];
  if (deviceId && plan.momentsPrompts && plan.momentsPrompts.length > 0) {
    const rows = await db
      .selectDistinct({ prompt: eventPhotos.prompt })
      .from(eventPhotos)
      .where(
        and(
          eq(eventPhotos.planId, plan.id),
          eq(eventPhotos.deviceId, deviceId),
        ),
      );
    promptsDone = rows
      .map((r) => r.prompt)
      .filter((p): p is string => typeof p === "string" && p.length > 0);
  }

  return NextResponse.json({
    plan: {
      title: plan.title,
      eventDate: plan.eventDate,
      openAt: plan.momentsOpenAt?.toISOString() ?? null,
      closeAt: plan.momentsCloseAt?.toISOString() ?? null,
      revealAt: plan.momentsRevealAt?.toISOString() ?? null,
      shotLimit: plan.momentsShotLimit ?? null,
      vintage: plan.momentsVintage,
      prompts: plan.momentsPrompts ?? [],
      tables: plan.momentsTables ?? [],
    },
    uploadState: state,
    revealed,
    totalPhotos: total,
    deviceUsed,
    photos: photos.map((p) => ({
      ...p,
      reactions: reactionsByPhoto[p.id] ?? {},
      myReactions: myReactions[p.id] ?? [],
    })),
    promptsDone,
  });
}

const uploadSchema = z.object({
  url: z.string().url(),
  guestName: z.string().min(1).max(60),
  guestMessage: z.string().max(280).optional(),
  /** Anonymous fingerprint generated client-side and stored in
   *  localStorage. We trust it for shot-limit accounting because the
   *  threat model is "polite guests at a wedding," not adversaries.
   *  Wipe the browser → fresh allowance, and that's fine. */
  deviceId: z.string().min(6).max(80).optional(),
  /** Phase 4A — which prompt label this upload answers. Owner-defined
   *  list lives on the plan; the client picks one and sends it back.
   *  We store the label rather than an id so the schema stays simple
   *  and renames don't orphan history. */
  prompt: z.string().max(80).optional(),
  /** Phase 5/C3 — which table label this upload was scanned from.
   *  Same validation pattern as prompt: stored only if it matches
   *  the owner's declared list. */
  tableLabel: z.string().max(40).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const ip = req.headers.get("x-forwarded-for") || "anon";
  const { success } = await rateLimit(`moments:${ip}:${slug}`, 20, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Too many uploads" }, { status: 429 });
  }

  const plan = await findPlan(slug);
  if (!plan || !plan.momentsEnabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Gate by upload window first — surfacing a clear "filmul nu e încă
  // deschis" beats a 400 with a generic validation error.
  const now = new Date();
  const state = uploadState(plan, now);
  if (state === "before") {
    return NextResponse.json(
      {
        error: "Filmul se deschide mai târziu.",
        opensAt: plan.momentsOpenAt?.toISOString() ?? null,
      },
      { status: 403 },
    );
  }
  if (state === "after") {
    return NextResponse.json(
      { error: "Filmul s-a închis. Mulțumim pentru participare!" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = uploadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  // Per-device shot limit. We rely on the device_id the client sends;
  // when it's missing we skip the cap so legacy clients without the
  // new JS still work (they just bypass the limit, which matches the
  // pre-Phase-1 behaviour).
  if (plan.momentsShotLimit && parsed.data.deviceId) {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(eventPhotos)
      .where(
        and(
          eq(eventPhotos.planId, plan.id),
          eq(eventPhotos.deviceId, parsed.data.deviceId),
        ),
      );
    if ((row?.count ?? 0) >= plan.momentsShotLimit) {
      return NextResponse.json(
        {
          error: `Ai folosit toate cele ${plan.momentsShotLimit} cadre alocate pe acest dispozitiv.`,
          shotLimit: plan.momentsShotLimit,
        },
        { status: 429 },
      );
    }
  }

  // Phase 4A — validate the prompt label against the owner's list
  // when prompts mode is on. Out-of-list prompts get silently
  // dropped (we still save the photo, just without the prompt tag) so
  // an attacker can't poison the dashboard with fake mission labels.
  let promptToSave: string | null = null;
  if (parsed.data.prompt) {
    const trimmed = parsed.data.prompt.trim();
    if (plan.momentsPrompts && plan.momentsPrompts.includes(trimmed)) {
      promptToSave = trimmed;
    }
  }

  // Phase 5/C3 — same allowlist treatment for table_label. Out-of-list
  // tables get silently dropped so QR-card mods can't seed bogus rooms.
  let tableLabelToSave: string | null = null;
  if (parsed.data.tableLabel) {
    const trimmed = parsed.data.tableLabel.trim();
    if (plan.momentsTables && plan.momentsTables.includes(trimmed)) {
      tableLabelToSave = trimmed;
    }
  }

  const [photo] = await db
    .insert(eventPhotos)
    .values({
      planId: plan.id,
      url: parsed.data.url,
      guestName: parsed.data.guestName,
      guestMessage: parsed.data.guestMessage ?? null,
      source: "guest",
      deviceId: parsed.data.deviceId ?? null,
      prompt: promptToSave,
      tableLabel: tableLabelToSave,
      // Auto-approve unless the owner explicitly turned on the
      // moderation queue (Phase 4B). In that mode every guest upload
      // sits hidden until the owner clicks "Aprobă" — useful for
      // family-friendly events / corporate. Reveal-based gating is a
      // separate axis: a photo can be approved but still hidden until
      // revealAt passes.
      isApproved: !plan.momentsRequireApproval,
      isPublic: false,
    })
    .returning({ id: eventPhotos.id });

  return NextResponse.json({ id: photo.id }, { status: 201 });
}
