import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { checklistItems } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { requirePlanOwnership } from "@/lib/planner/ownership";

// M4 — POST /api/event-plans/[id]/checklist
// Adds a new custom checklist item (templates are seeded on plan create).

const createItemSchema = z.object({
  title: z.string().min(1).max(200),
  category: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  dueDaysBefore: z.number().int().optional(),
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
  const parsed = createItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  // Push the new item to the bottom of the list
  const [last] = await db
    .select({ sortOrder: checklistItems.sortOrder })
    .from(checklistItems)
    .where(eq(checklistItems.planId, planId))
    .orderBy(desc(checklistItems.sortOrder))
    .limit(1);

  const [item] = await db
    .insert(checklistItems)
    .values({
      planId,
      title: parsed.data.title,
      category: parsed.data.category,
      priority: parsed.data.priority,
      dueDaysBefore: parsed.data.dueDaysBefore,
      sortOrder: (last?.sortOrder ?? 0) + 1,
    })
    .returning();

  return NextResponse.json({ item }, { status: 201 });
}
