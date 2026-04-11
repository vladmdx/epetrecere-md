import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { seatingTables } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { requirePlanOwnership } from "@/lib/planner/ownership";

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

  const [table] = await db
    .update(seatingTables)
    .set(parsed.data)
    .where(
      and(eq(seatingTables.id, tableIdNum), eq(seatingTables.planId, planId)),
    )
    .returning();

  if (!table) {
    return NextResponse.json({ error: "Table not found" }, { status: 404 });
  }

  return NextResponse.json({ table });
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

  await db
    .delete(seatingTables)
    .where(
      and(eq(seatingTables.id, tableIdNum), eq(seatingTables.planId, planId)),
    );

  return NextResponse.json({ ok: true });
}
