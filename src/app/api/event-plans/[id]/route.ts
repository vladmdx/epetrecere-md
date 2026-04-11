import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import {
  eventPlans,
  checklistItems,
  guestList,
  seatingTables,
  seatAssignments,
} from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { requirePlanOwnership } from "@/lib/planner/ownership";

// M4 — /api/event-plans/[id]
//
// GET    — full plan view: plan + checklist + guests + tables + seats.
// PUT    — update plan metadata (title, date, budget, etc.).
// DELETE — drop the plan (cascade wipes everything).

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

  const [checklist, guests, tables, seats] = await Promise.all([
    db
      .select()
      .from(checklistItems)
      .where(eq(checklistItems.planId, planId))
      .orderBy(asc(checklistItems.sortOrder), asc(checklistItems.id)),
    db
      .select()
      .from(guestList)
      .where(eq(guestList.planId, planId))
      .orderBy(asc(guestList.id)),
    db
      .select()
      .from(seatingTables)
      .where(eq(seatingTables.planId, planId))
      .orderBy(asc(seatingTables.sortOrder), asc(seatingTables.id)),
    db
      .select({
        id: seatAssignments.id,
        tableId: seatAssignments.tableId,
        guestId: seatAssignments.guestId,
        seatNumber: seatAssignments.seatNumber,
      })
      .from(seatAssignments)
      .innerJoin(seatingTables, eq(seatAssignments.tableId, seatingTables.id))
      .where(eq(seatingTables.planId, planId)),
  ]);

  return NextResponse.json({
    plan: owned.plan,
    checklist,
    guests,
    tables,
    seats,
  });
}

const updatePlanSchema = z.object({
  title: z.string().min(2).max(120).optional(),
  eventType: z.string().optional().nullable(),
  eventDate: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  guestCountTarget: z.number().int().positive().optional().nullable(),
  budgetTarget: z.number().int().nonnegative().optional().nullable(),
  seatsPerTable: z.number().int().min(2).max(20).optional(),
  notes: z.string().optional().nullable(),
});

export async function PUT(
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
  const parsed = updatePlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(eventPlans)
    .set({
      ...parsed.data,
      updatedAt: new Date(),
    })
    .where(and(eq(eventPlans.id, planId), eq(eventPlans.userId, owned.userId)))
    .returning();

  return NextResponse.json({ plan: updated });
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
    .delete(eventPlans)
    .where(and(eq(eventPlans.id, planId), eq(eventPlans.userId, owned.userId)));

  return NextResponse.json({ ok: true });
}
