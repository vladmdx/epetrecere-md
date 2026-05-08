import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { eventPlans, checklistItems, users } from "@/lib/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getPlannerTemplate } from "@/lib/planner/templates";
import { requireAppUser } from "@/lib/planner/ownership";

/** Cap on event plans a single client may create per rolling 7-day
 *  window. Stops drive-by spam (someone testing the wizard with
 *  throwaway plans, or a bot creating dozens to flood partners). Admins
 *  bypass this — they need to be able to seed test data. */
const MAX_PLANS_PER_WEEK = 3;

// M4 — /api/event-plans
//
// GET  — list the signed-in user's plans (newest first).
//        Query param `status` filters by plan status. Defaults to "active"
//        so archived/cancelled plans only show on the dedicated arhivă page.
//        Pass `status=all` to get every plan.
// POST — create a new plan and seed the checklist from the event-type
//        template so the user has a starting set of tasks immediately.

export async function GET(req: NextRequest) {
  const auth = await requireAppUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const statusParam = req.nextUrl.searchParams.get("status") ?? "active";
  const filters = [eq(eventPlans.userId, auth.userId)];
  if (statusParam !== "all") {
    // Narrow the enum cast — Zod isn't needed for a three-value allowlist.
    const allowed = ["active", "completed", "cancelled"] as const;
    if ((allowed as readonly string[]).includes(statusParam)) {
      filters.push(eq(eventPlans.status, statusParam as (typeof allowed)[number]));
    }
  }

  const plans = await db
    .select()
    .from(eventPlans)
    .where(and(...filters))
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
  // Wizard-supplied extras — used to pre-filter the "Artiști disponibili"
  // section and surface the "Săli" tab.
  venueNeeded: z.boolean().optional(),
  selectedCategories: z.array(z.number().int().positive()).optional(),
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

  // Per-week rate limit (3 plans / rolling 7 days). Admins bypass so
  // ops can still seed/test from production.
  const [me] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, auth.userId))
    .limit(1);
  const isAdmin = me?.role === "admin" || me?.role === "super_admin";
  if (!isAdmin) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [recent] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(eventPlans)
      .where(
        and(
          eq(eventPlans.userId, auth.userId),
          gte(eventPlans.createdAt, sevenDaysAgo),
        ),
      );
    if ((recent?.count ?? 0) >= MAX_PLANS_PER_WEEK) {
      return NextResponse.json(
        {
          error: `Poți crea maximum ${MAX_PLANS_PER_WEEK} evenimente pe săptămână. Încearcă din nou peste câteva zile.`,
        },
        { status: 429 },
      );
    }
  }

  const { eventDate, selectedCategories, ...rest } = parsed.data;

  const [plan] = await db
    .insert(eventPlans)
    .values({
      userId: auth.userId,
      ...rest,
      eventDate: eventDate || null,
      selectedCategories: selectedCategories ?? [],
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
