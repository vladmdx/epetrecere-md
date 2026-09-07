import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { seatingTables } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { requirePlanOwnership } from "@/lib/planner/ownership";
import { guestHeadcount } from "@/lib/planner/guest-headcount";
import { lockSeatingPlan, tableOccupants } from "@/lib/planner/seating-capacity";

// M4 — PATCH / DELETE /api/event-plans/[id]/tables/[tableId]
// Rename, resize, move (drag-to-arrange), or remove a table.
// Cascade wipes seat assignments automatically.

const patchTableSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  seats: z.number().int().min(2).max(30).optional(),
  posX: z.number().int().optional().nullable(),
  posY: z.number().int().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tableId: string }> },
) {
  const { id, tableId } = await params;
  const planId = Number(id);
  const tableIdNum = Number(tableId);

  const owned = await requirePlanOwnership(planId);
  if (!owned.ok) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchTableSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  return db.transaction(async (tx) => {
    if (!await lockSeatingPlan(tx, planId, owned.userId)) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }
    if (parsed.data.seats != null) {
      const occupied = (await tableOccupants(tx, planId, tableIdNum))
        .reduce((sum, guest) => sum + guestHeadcount(guest), 0);
      if (parsed.data.seats < occupied) {
        return NextResponse.json({ error: "Table is full", code: "TABLE_FULL" }, { status: 400 });
      }
    }
    const [table] = await tx.update(seatingTables).set(parsed.data)
      .where(and(eq(seatingTables.id, tableIdNum), eq(seatingTables.planId, planId))).returning();
    if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });
    return NextResponse.json({ table });
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; tableId: string }> },
) {
  const { id, tableId } = await params;
  const planId = Number(id);
  const tableIdNum = Number(tableId);

  const owned = await requirePlanOwnership(planId);
  if (!owned.ok) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }

  return db.transaction(async (tx) => {
    if (!await lockSeatingPlan(tx, planId, owned.userId)) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }
    await tx.delete(seatingTables)
      .where(and(eq(seatingTables.id, tableIdNum), eq(seatingTables.planId, planId)));
    return NextResponse.json({ ok: true });
  });
}
