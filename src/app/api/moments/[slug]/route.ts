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
import { db } from "@/lib/db";
import { eventPhotos, eventPlans, photoReactions } from "@/lib/db/schema";
import { requestHasMomentsAccess } from "@/lib/moments/access";

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
  if (!requestHasMomentsAccess(req, slug)) {
    return NextResponse.json({ error: "Access code required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
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
          deviceId: eventPhotos.deviceId,
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

  const response = NextResponse.json({
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
      canDelete: Boolean(deviceId && p.deviceId === deviceId),
      deviceId: undefined,
    })),
    promptsDone,
  });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!requestHasMomentsAccess(req, slug)) {
    return NextResponse.json({ error: "Access code required" }, { status: 401 });
  }
  // URL-only inserts could attach an arbitrary public image and bypass EXIF
  // stripping and the rights confirmation. New clients use the atomic
  // multipart /upload endpoint, which performs all privacy checks before a
  // database row is created.
  return NextResponse.json(
    { error: "Use the protected Moments upload endpoint" },
    { status: 410 },
  );
}
