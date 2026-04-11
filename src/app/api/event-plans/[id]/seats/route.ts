import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import {
  seatAssignments,
  seatingTables,
  guestList,
} from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { requirePlanOwnership } from "@/lib/planner/ownership";

// M4 — /api/event-plans/[id]/seats
//
// POST   — assign a guest to a table (upsert via unique guest_id).
// DELETE — unassign a guest (query ?guestId=N).
//
// We enforce that both the guest and the table belong to this same plan
// so a malicious client can't re-seat guests from other plans.

const assignSchema = z.object({
  guestId: z.number().int().positive(),
  tableId: z.number().int().positive(),
  seatNumber: z.number().int().min(1).optional(),
});

export async function POST(
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
  const parsed = assignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { guestId, tableId, seatNumber } = parsed.data;

  // Verify guest + table both belong to this plan
  const [guest] = await db
    .select({ id: guestList.id })
    .from(guestList)
    .where(and(eq(guestList.id, guestId), eq(guestList.planId, planId)))
    .limit(1);
  if (!guest) {
    return NextResponse.json({ error: "Guest not found" }, { status: 404 });
  }

  const [table] = await db
    .select({ id: seatingTables.id, seats: seatingTables.seats })
    .from(seatingTables)
    .where(
      and(eq(seatingTables.id, tableId), eq(seatingTables.planId, planId)),
    )
    .limit(1);
  if (!table) {
    return NextResponse.json({ error: "Table not found" }, { status: 404 });
  }

  // Capacity check: count existing assignments on the target table
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(seatAssignments)
    .where(eq(seatAssignments.tableId, tableId));

  // If the guest is already on this table we're just moving their seat
  // number, not adding a seat, so allow the move.
  const [existing] = await db
    .select()
    .from(seatAssignments)
    .where(eq(seatAssignments.guestId, guestId))
    .limit(1);

  const isMoveWithinTable = existing && existing.tableId === tableId;
  if (!isMoveWithinTable && count >= table.seats) {
    return NextResponse.json(
      { error: "Table is full" },
      { status: 400 },
    );
  }

  // Upsert: one assignment per guest (unique constraint)
  const [assignment] = await db
    .insert(seatAssignments)
    .values({ guestId, tableId, seatNumber })
    .onConflictDoUpdate({
      target: seatAssignments.guestId,
      set: { tableId, seatNumber },
    })
    .returning();

  return NextResponse.json({ assignment }, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const planId = Number(id);

  const owned = await requirePlanOwnership(planId);
  if (!owned.ok) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }

  const guestIdParam = req.nextUrl.searchParams.get("guestId");
  const guestId = Number(guestIdParam);
  if (!Number.isFinite(guestId)) {
    return NextResponse.json({ error: "Missing guestId" }, { status: 400 });
  }

  // Belt & suspenders: ensure the guest is owned by this plan.
  const [guest] = await db
    .select({ id: guestList.id })
    .from(guestList)
    .where(and(eq(guestList.id, guestId), eq(guestList.planId, planId)))
    .limit(1);
  if (!guest) {
    return NextResponse.json({ error: "Guest not found" }, { status: 404 });
  }

  await db.delete(seatAssignments).where(eq(seatAssignments.guestId, guestId));

  return NextResponse.json({ ok: true });
}
