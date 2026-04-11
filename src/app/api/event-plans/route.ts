import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { eventPlans, checklistItems } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { getPlannerTemplate } from "@/lib/planner/templates";
import { requireAppUser } from "@/lib/planner/ownership";

// M4 — /api/event-plans
//
// GET  — list the signed-in user's plans (newest first).
// POST — create a new plan and seed the checklist from the event-type
//        template so the user has a starting set of tasks immediately.

export async function GET() {
  const auth = await requireAppUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const plans = await db
    .select()
    .from(eventPlans)
    .where(eq(eventPlans.userId, auth.userId))
    .orderBy(desc(eventPlans.createdAt));

  return NextResponse.json({ plans });
}

const createPlanSchema = z.object({
  title: z.string().min(2).max(120),
  eventType: z.string().optional(),
  eventDate: z.string().optional(), // ISO date "YYYY-MM-DD"
  location: z.string().optional(),
  guestCountTarget: z.number().int().positive().optional(),
  budgetTarget: z.number().int().nonnegative().optional(),
  seatsPerTable: z.number().int().min(2).max(20).optional(),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAppUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  const parsed = createPlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { eventDate, ...rest } = parsed.data;

  const [plan] = await db
    .insert(eventPlans)
    .values({
      userId: auth.userId,
      ...rest,
      eventDate: eventDate || null,
    })
    .returning();

  // Seed the checklist from the template. We keep this outside a transaction
  // on purpose — if template seeding fails for some reason the user still has
  // a plan row and can add their own items.
  const template = getPlannerTemplate(plan.eventType);
  if (template.length > 0) {
    await db.insert(checklistItems).values(
      template.map((item, idx) => ({
        planId: plan.id,
        title: item.title,
        category: item.category,
        priority: item.priority,
        dueDaysBefore: item.dueDaysBefore,
        sortOrder: idx,
      })),
    );
  }

  return NextResponse.json({ plan }, { status: 201 });
}
