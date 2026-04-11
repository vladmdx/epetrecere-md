import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { seatingTables } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { requirePlanOwnership } from "@/lib/planner/ownership";

// M4 — POST /api/event-plans/[id]/tables
// Create a new seating table.

const createTableSchema = z.object({
  name: z.string().min(1).max(80),
  seats: z.number().int().min(2).max(30).optional(),
  posX: z.number().int().optional(),
  posY: z.number().int().optional(),
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
  const parsed = createTableSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const [last] = await db
    .select({ sortOrder: seatingTables.sortOrder })
    .from(seatingTables)
    .where(eq(seatingTables.planId, planId))
    .orderBy(desc(seatingTables.sortOrder))
    .limit(1);

  const defaultSeats = owned.plan.seatsPerTable ?? 10;

  const [table] = await db
    .insert(seatingTables)
    .values({
      planId,
      name: parsed.data.name,
      seats: parsed.data.seats ?? defaultSeats,
      posX: parsed.data.posX,
      posY: parsed.data.posY,
      sortOrder: (last?.sortOrder ?? 0) + 1,
    })
    .returning();

  return NextResponse.json({ table }, { status: 201 });
}
