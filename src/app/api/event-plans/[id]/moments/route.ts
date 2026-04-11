// F-C8 — owner endpoints to enable Event Moments on a plan and get the
// public URL / QR code target. Generates a unique slug on first enable.

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { eventPlans } from "@/lib/db/schema";
import { requirePlanOwnership } from "@/lib/planner/ownership";

function randomSlug(): string {
  // 10-char base36 — plenty of entropy for event galleries and easy to scan.
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);
}

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

  const [plan] = await db
    .select({
      momentsSlug: eventPlans.momentsSlug,
      momentsEnabled: eventPlans.momentsEnabled,
    })
    .from(eventPlans)
    .where(eq(eventPlans.id, planId))
    .limit(1);

  return NextResponse.json({
    slug: plan?.momentsSlug ?? null,
    enabled: plan?.momentsEnabled ?? false,
  });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const planId = Number(id);
  const owned = await requirePlanOwnership(planId);
  if (!owned.ok) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }

  const [existing] = await db
    .select({ momentsSlug: eventPlans.momentsSlug })
    .from(eventPlans)
    .where(eq(eventPlans.id, planId))
    .limit(1);

  const slug = existing?.momentsSlug ?? randomSlug();
  await db
    .update(eventPlans)
    .set({ momentsSlug: slug, momentsEnabled: true, updatedAt: new Date() })
    .where(eq(eventPlans.id, planId));

  return NextResponse.json({ slug, enabled: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const planId = Number(id);
  const owned = await requirePlanOwnership(planId);
  if (!owned.ok) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }

  await db
    .update(eventPlans)
    .set({ momentsEnabled: false, updatedAt: new Date() })
    .where(eq(eventPlans.id, planId));

  return NextResponse.json({ enabled: false });
}
