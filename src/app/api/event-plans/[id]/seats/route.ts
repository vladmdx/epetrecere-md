import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import {
  seatAssignments,
  seatingTables,
  guestList,
} from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { requirePlanOwnership } from "@/lib/planner/ownership";
import { fitsAtTable } from "@/lib/planner/guest-headcount";
import { lockSeatingPlan, tableOccupants } from "@/lib/planner/seating-capacity";

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

  return db.transaction(async (tx) => {
    if (!await lockSeatingPlan(tx, planId, owned.userId)) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }
    const [guest] = await tx.select().from(guestList)
      .where(and(eq(guestList.id, guestId), eq(guestList.planId, planId))).limit(1);
    if (!guest) return NextResponse.json({ error: "Guest not found" }, { status: 404 });
    const [table] = await tx.select({ id: seatingTables.id, seats: seatingTables.seats }).from(seatingTables)
      .where(and(eq(seatingTables.id, tableId), eq(seatingTables.planId, planId))).limit(1);
    if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });
    if (seatNumber != null && seatNumber > table.seats) {
      return NextResponse.json({ error: "Seat number exceeds table capacity" }, { status: 400 });
    }
    // Count adults + children, not guest rows. The same group already at
    // this table is excluded before adding it back (idempotent intra-move).
    if (!fitsAtTable(table.seats, await tableOccupants(tx, planId, tableId), guest)) {
      return NextResponse.json({ error: "Table is full", code: "TABLE_FULL" }, { status: 400 });
    }
    const [assignment] = await tx.insert(seatAssignments).values({ guestId, tableId, seatNumber })
      .onConflictDoUpdate({ target: seatAssignments.guestId, set: { tableId, seatNumber } }).returning();
    return NextResponse.json({ assignment }, { status: 201 });
  });
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
  if (!Number.isSafeInteger(guestId) || guestId <= 0) {
    return NextResponse.json({ error: "Missing guestId" }, { status: 400 });
  }

  return db.transaction(async (tx) => {
    if (!await lockSeatingPlan(tx, planId, owned.userId)) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }
    const [guest] = await tx.select({ id: guestList.id }).from(guestList)
      .where(and(eq(guestList.id, guestId), eq(guestList.planId, planId))).limit(1);
    if (!guest) return NextResponse.json({ error: "Guest not found" }, { status: 404 });
    await tx.delete(seatAssignments).where(eq(seatAssignments.guestId, guestId));
    return NextResponse.json({ ok: true });
  });
}
