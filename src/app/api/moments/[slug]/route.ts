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
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { eventPhotos, eventPlans } from "@/lib/db/schema";
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

  return NextResponse.json({
    plan: {
      title: plan.title,
      eventDate: plan.eventDate,
      openAt: plan.momentsOpenAt?.toISOString() ?? null,
      closeAt: plan.momentsCloseAt?.toISOString() ?? null,
      revealAt: plan.momentsRevealAt?.toISOString() ?? null,
      shotLimit: plan.momentsShotLimit ?? null,
    },
    uploadState: state,
    revealed,
    totalPhotos: total,
    deviceUsed,
    photos,
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

  const [photo] = await db
    .insert(eventPhotos)
    .values({
      planId: plan.id,
      url: parsed.data.url,
      guestName: parsed.data.guestName,
      guestMessage: parsed.data.guestMessage ?? null,
      source: "guest",
      deviceId: parsed.data.deviceId ?? null,
      // Approve immediately when the guest UI is gating uploads via the
      // open/close + reveal mechanic — the original moderation gate
      // (isApproved=false → owner had to approve every photo) felt
      // hostile in the once.film flow. Owner still has a "delete" path
      // on the dashboard for anything inappropriate.
      isApproved: true,
      isPublic: false,
    })
    .returning({ id: eventPhotos.id });

  return NextResponse.json({ id: photo.id }, { status: 201 });
}
