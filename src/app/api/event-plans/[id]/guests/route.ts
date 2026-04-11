import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { guestList } from "@/lib/db/schema";
import { requirePlanOwnership } from "@/lib/planner/ownership";

// M4 — POST /api/event-plans/[id]/guests
// Add a guest to the plan's guest list.

const createGuestSchema = z.object({
  fullName: z.string().min(1).max(120),
  phone: z.string().optional(),
  email: z.email().optional(),
  group: z.string().optional(),
  plusOnes: z.number().int().min(0).max(20).optional(),
  dietary: z.string().optional(),
  rsvp: z.enum(["pending", "accepted", "declined", "maybe"]).optional(),
  notes: z.string().optional(),
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
  const parsed = createGuestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const [guest] = await db
    .insert(guestList)
    .values({
      planId,
      fullName: parsed.data.fullName,
      phone: parsed.data.phone,
      email: parsed.data.email,
      group: parsed.data.group,
      plusOnes: parsed.data.plusOnes ?? 0,
      dietary: parsed.data.dietary,
      rsvp: parsed.data.rsvp ?? "pending",
      notes: parsed.data.notes,
    })
    .returning();

  return NextResponse.json({ guest }, { status: 201 });
}
