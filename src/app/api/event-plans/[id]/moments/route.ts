// F-C8 — owner endpoints for Event Moments / Photo Moments.
//
// GET    — current settings (slug, enabled, window, reveal, limit).
// POST   — flip enabled=true and generate slug if missing.
// PATCH  — partial update of window / reveal / shot limit settings
//          (added in Phase 1 — the once.film-inspired flow).
// DELETE — flip enabled=false (keeps the slug so re-enable is stable).

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { eventPlans } from "@/lib/db/schema";
import { requirePlanOwnership } from "@/lib/planner/ownership";

function randomSlug(): string {
  // 10-char base36 — plenty of entropy for event galleries and easy to scan.
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);
}

/** Parse an ISO datetime string into a Date, allowing the explicit
 *  string "null" or empty string as a clear "unset" signal so the
 *  owner can wipe the value via PATCH without sending an actual JSON
 *  null (which trips up some form libraries). */
function parseDateOrNull(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "" || v === "null") return null;
  if (typeof v !== "string") return undefined;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : undefined;
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
      momentsOpenAt: eventPlans.momentsOpenAt,
      momentsCloseAt: eventPlans.momentsCloseAt,
      momentsRevealAt: eventPlans.momentsRevealAt,
      momentsShotLimit: eventPlans.momentsShotLimit,
    })
    .from(eventPlans)
    .where(eq(eventPlans.id, planId))
    .limit(1);

  return NextResponse.json({
    slug: plan?.momentsSlug ?? null,
    enabled: plan?.momentsEnabled ?? false,
    openAt: plan?.momentsOpenAt?.toISOString() ?? null,
    closeAt: plan?.momentsCloseAt?.toISOString() ?? null,
    revealAt: plan?.momentsRevealAt?.toISOString() ?? null,
    shotLimit: plan?.momentsShotLimit ?? null,
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

/** Partial settings update — open window, reveal time, shot limit.
 *  Each field accepts null to clear it. Fields omitted from the body
 *  are left unchanged so the owner can tweak one knob at a time. */
const patchSchema = z.object({
  openAt: z.union([z.string(), z.null()]).optional(),
  closeAt: z.union([z.string(), z.null()]).optional(),
  revealAt: z.union([z.string(), z.null()]).optional(),
  shotLimit: z.union([z.number().int().min(1).max(500), z.null()]).optional(),
});

export async function PATCH(
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
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.openAt !== undefined) {
    const v = parseDateOrNull(parsed.data.openAt);
    if (v !== undefined) update.momentsOpenAt = v;
  }
  if (parsed.data.closeAt !== undefined) {
    const v = parseDateOrNull(parsed.data.closeAt);
    if (v !== undefined) update.momentsCloseAt = v;
  }
  if (parsed.data.revealAt !== undefined) {
    const v = parseDateOrNull(parsed.data.revealAt);
    if (v !== undefined) update.momentsRevealAt = v;
  }
  if (parsed.data.shotLimit !== undefined) {
    update.momentsShotLimit = parsed.data.shotLimit;
  }

  // Reject impossible windows up front so the owner gets a clear
  // error rather than silently saving a film that can never accept
  // uploads. open ≥ close is the only consistency check worth doing
  // server-side; everything else (reveal in the past, etc.) is fine.
  if (
    typeof update.momentsOpenAt !== "undefined" &&
    typeof update.momentsCloseAt !== "undefined" &&
    update.momentsOpenAt instanceof Date &&
    update.momentsCloseAt instanceof Date &&
    update.momentsOpenAt >= update.momentsCloseAt
  ) {
    return NextResponse.json(
      { error: "Ora de început trebuie să fie înainte de ora de închidere." },
      { status: 400 },
    );
  }

  await db.update(eventPlans).set(update).where(eq(eventPlans.id, planId));

  const [plan] = await db
    .select({
      momentsOpenAt: eventPlans.momentsOpenAt,
      momentsCloseAt: eventPlans.momentsCloseAt,
      momentsRevealAt: eventPlans.momentsRevealAt,
      momentsShotLimit: eventPlans.momentsShotLimit,
    })
    .from(eventPlans)
    .where(eq(eventPlans.id, planId))
    .limit(1);

  return NextResponse.json({
    openAt: plan?.momentsOpenAt?.toISOString() ?? null,
    closeAt: plan?.momentsCloseAt?.toISOString() ?? null,
    revealAt: plan?.momentsRevealAt?.toISOString() ?? null,
    shotLimit: plan?.momentsShotLimit ?? null,
  });
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
