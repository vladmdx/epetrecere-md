import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { checklistItems } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { requirePlanOwnership } from "@/lib/planner/ownership";

// M4 — PATCH / DELETE /api/event-plans/[id]/checklist/[itemId]
// Toggle done, edit title/category/priority, or remove.

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  category: z.string().optional().nullable(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  dueDaysBefore: z.number().int().optional().nullable(),
  done: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await params;
  const planId = Number(id);
  const checklistItemId = Number(itemId);

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

  const updates: Partial<typeof checklistItems.$inferInsert> = { ...parsed.data };
  if (parsed.data.done !== undefined) {
    updates.doneAt = parsed.data.done ? new Date() : null;
  }

  const [item] = await db
    .update(checklistItems)
    .set(updates)
    .where(
      and(
        eq(checklistItems.id, checklistItemId),
        eq(checklistItems.planId, planId),
      ),
    )
    .returning();

  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  return NextResponse.json({ item });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await params;
  const planId = Number(id);
  const checklistItemId = Number(itemId);

  const owned = await requirePlanOwnership(planId);
  if (!owned.ok) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }

  await db
    .delete(checklistItems)
    .where(
      and(
        eq(checklistItems.id, checklistItemId),
        eq(checklistItems.planId, planId),
      ),
    );

  return NextResponse.json({ ok: true });
}
