import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { guestList } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { requirePlanOwnership } from "@/lib/planner/ownership";

// M4 — PATCH / DELETE /api/event-plans/[id]/guests/[guestId]

const patchGuestSchema = z.object({
  fullName: z.string().min(1).max(120).optional(),
  phone: z.string().optional().nullable(),
  email: z.email().optional().nullable(),
  group: z.string().optional().nullable(),
  plusOnes: z.number().int().min(0).max(20).optional(),
  dietary: z.string().optional().nullable(),
  rsvp: z.enum(["pending", "accepted", "declined", "maybe"]).optional(),
  notes: z.string().optional().nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; guestId: string }> },
) {
  const { id, guestId } = await params;
  const planId = Number(id);
  const guestIdNum = Number(guestId);

  const owned = await requirePlanOwnership(planId);
  if (!owned.ok) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchGuestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const [guest] = await db
    .update(guestList)
    .set(parsed.data)
    .where(and(eq(guestList.id, guestIdNum), eq(guestList.planId, planId)))
    .returning();

  if (!guest) {
    return NextResponse.json({ error: "Guest not found" }, { status: 404 });
  }

  return NextResponse.json({ guest });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; guestId: string }> },
) {
  const { id, guestId } = await params;
  const planId = Number(id);
  const guestIdNum = Number(guestId);

  const owned = await requirePlanOwnership(planId);
  if (!owned.ok) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }

  await db
    .delete(guestList)
    .where(and(eq(guestList.id, guestIdNum), eq(guestList.planId, planId)));

  return NextResponse.json({ ok: true });
}
