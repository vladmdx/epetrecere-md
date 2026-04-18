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

const SERVICE_TO_CATEGORY_SLUG: Record<string, string> = {
  singer: "cantareti",
  dj: "dj",
  photographer: "fotografi",
  videographer: "videografi",
  mc: "moderatori",
  band: "formatii",
  show: "show",
  decor: "decor",
  animators: "animatori",
  equipment: "echipament",
  candy_bar: "candy-bar",
  fireworks: "artificii",
};

const wizardSchema = z.object({
  eventType: z.string().optional(),
  eventDate: z.string().optional(),
  location: z.string().optional(),
  timeSlot: z.string().optional(),
  guestCount: z.number().int().nonnegative().optional(),
  venueNeeded: z.enum(["", "yes", "no"]).optional(),
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

  // Build a human-readable title from event type + owner name so it shows up
  // nicely in the sidebar ("Nunta Ana & Ion" kind of vibe).
  const eventLabel = w.eventType
    ? EVENT_TYPE_LABELS[w.eventType] ?? "Eveniment"
    : "Eveniment";
  const ownerHint = w.name?.trim() || "";
  const title = ownerHint ? `${eventLabel} — ${ownerHint}` : eventLabel;

  const [plan] = await db
    .insert(eventPlans)
    .values({
      userId: auth.userId,
      title: title.slice(0, 120),
      eventType: w.eventType || null,
      eventDate: w.eventDate || null,
      location: w.location || null,
      guestCountTarget: w.guestCount ?? null,
      budgetTarget: w.budget ?? null,
      venueNeeded: w.venueNeeded === "yes",
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
