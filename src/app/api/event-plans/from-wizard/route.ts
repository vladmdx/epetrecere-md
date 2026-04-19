// Converts a wizard-data blob (from sessionStorage on the public /planifica
// flow) into a real event_plan row. Called from /auth-redirect immediately
// after sign-up/sign-in so the user lands inside their dashboard with the
// plan already populated — no re-typing.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import {
  eventPlans,
  checklistItems,
  categories,
} from "@/lib/db/schema";
import { getPlannerTemplate } from "@/lib/planner/templates";
import { requireAppUser } from "@/lib/planner/ownership";

import { SERVICE_TO_CATEGORY_SLUG } from "@/lib/wizard/service-mapping";

const wizardSchema = z.object({
  eventType: z.string().optional(),
  eventDate: z.string().optional(),
  location: z.string().optional(),
  timeSlot: z.string().optional(),
  startTime: z.string().optional(),
  durationHours: z.number().int().min(1).max(24).optional(),
  guestCount: z.number().int().nonnegative().optional(),
  venueNeeded: z.enum(["", "yes", "no"]).optional(),
  venueRadiusKm: z.number().int().min(0).max(9999).optional(),
  services: z.array(z.string()).optional(),
  budget: z.number().int().nonnegative().optional(),
  name: z.string().optional(),
});

const EVENT_TYPE_LABELS: Record<string, string> = {
  wedding: "Nuntă",
  baptism: "Botez",
  cumatrie: "Cumătrie",
  birthday: "Zi de naștere",
  corporate: "Corporate",
  concert: "Concert",
  other: "Eveniment",
};

export async function POST(req: NextRequest) {
  const auth = await requireAppUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = await req.json().catch(() => null);
  const parsed = wizardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const w = parsed.data;

  // Resolve service-slug strings → category IDs for selectedCategories.
  let categoryIds: number[] = [];
  if (w.services && w.services.length > 0) {
    const slugs = w.services
      .map((s) => SERVICE_TO_CATEGORY_SLUG[s])
      .filter(Boolean);
    if (slugs.length > 0) {
      const found = await db
        .select({ id: categories.id, slug: categories.slug })
        .from(categories);
      categoryIds = found.filter((c) => slugs.includes(c.slug)).map((c) => c.id);
    }
  }

  // `name` in the wizard is the event title the user typed in the summary
  // step ("Nunta Ana & Ion"). Use it directly as the plan title; fall back
  // to the event type label when the user left the field blank (shouldn't
  // happen because the wizard requires it, but keeps us safe against
  // pre-migration saved drafts).
  const eventLabel = w.eventType
    ? EVENT_TYPE_LABELS[w.eventType] ?? "Eveniment"
    : "Eveniment";
  const title = w.name?.trim() || eventLabel;

  const [plan] = await db
    .insert(eventPlans)
    .values({
      userId: auth.userId,
      title: title.slice(0, 120),
      eventType: w.eventType || null,
      eventDate: w.eventDate || null,
      startTime: w.startTime || null,
      durationHours: w.durationHours ?? null,
      location: w.location || null,
      guestCountTarget: w.guestCount ?? null,
      budgetTarget: w.budget ?? null,
      venueNeeded: w.venueNeeded === "yes",
      venueRadiusKm: w.venueRadiusKm ?? 25,
      selectedCategories: categoryIds,
    })
    .returning();

  // Seed the checklist exactly like the manual create flow.
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
