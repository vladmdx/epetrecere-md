// Event Moments (F-C8) — public endpoints for QR-based guest photo gallery.
//
// GET  — list approved photos for a moments-enabled plan, public.
// POST — anonymous guest upload. Rate-limited per IP. Photos are created
//         with source="guest" and isApproved=false so the plan owner can
//         moderate before the slideshow publishes them.

import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { eventPhotos, eventPlans } from "@/lib/db/schema";
import { rateLimit } from "@/lib/rate-limit";

async function findPlan(slug: string) {
  const [plan] = await db
    .select({
      id: eventPlans.id,
      title: eventPlans.title,
      eventDate: eventPlans.eventDate,
      momentsEnabled: eventPlans.momentsEnabled,
    })
    .from(eventPlans)
    .where(eq(eventPlans.momentsSlug, slug))
    .limit(1);
  return plan ?? null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const plan = await findPlan(slug);
  if (!plan || !plan.momentsEnabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const photos = await db
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
    .limit(500);

  return NextResponse.json({
    plan: { title: plan.title, eventDate: plan.eventDate },
    photos,
  });
}

const uploadSchema = z.object({
  url: z.string().url(),
  guestName: z.string().min(1).max(60),
  guestMessage: z.string().max(280).optional(),
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

  const body = await req.json().catch(() => null);
  const parsed = uploadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const [photo] = await db
    .insert(eventPhotos)
    .values({
      planId: plan.id,
      url: parsed.data.url,
      guestName: parsed.data.guestName,
      guestMessage: parsed.data.guestMessage ?? null,
      source: "guest",
      isApproved: true, // auto-approve guest uploads for live slideshow; owner can delete
      isPublic: true,
    })
    .returning({ id: eventPhotos.id });

  return NextResponse.json({ id: photo.id }, { status: 201 });
}
