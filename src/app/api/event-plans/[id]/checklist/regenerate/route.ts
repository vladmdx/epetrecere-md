// Regenerate the checklist for an event plan from the event-type template.
// Deletes existing items and reseeds from the template in `@/lib/planner/templates`.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { eventPlans, checklistItems, users } from "@/lib/db/schema";
import { getPlannerTemplate } from "@/lib/planner/templates";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const planId = Number(id);
  if (!Number.isFinite(planId)) {
    return NextResponse.json({ error: "Invalid plan id" }, { status: 400 });
  }

  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  if (!appUser) {
    return NextResponse.json({ error: "User not found" }, { status: 403 });
  }

  const [plan] = await db
    .select({
      id: eventPlans.id,
      userId: eventPlans.userId,
      eventType: eventPlans.eventType,
    })
    .from(eventPlans)
    .where(eq(eventPlans.id, planId))
    .limit(1);

  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }
  if (plan.userId !== appUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Wipe current checklist items
  await db.delete(checklistItems).where(eq(checklistItems.planId, planId));

  // Seed from event-type template
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

  // Return the new items
  const items = await db
    .select()
    .from(checklistItems)
    .where(eq(checklistItems.planId, planId))
    .orderBy(checklistItems.sortOrder);

  return NextResponse.json({ items });
}
