// M3 — Lead matching engine.
//
// Given a newly created lead, find the top-N eligible active artists/venues
// and create lead_matches rows. Scoring is heuristic and favours:
//   1. Category overlap (services the client selected vs artist.categoryIds)
//   2. City overlap (wizard location vs artist.location free-text ILIKE)
//   3. Budget headroom (client budget ≥ artist.priceFrom)
//   4. Date availability (no calendar_events blocking that day)
//   5. Featured / verified bonus
//
// Called fire-and-forget from POST /api/leads so the response doesn't block.

import { db } from "@/lib/db";
import {
  artists,
  leads,
  leadMatches,
  calendarEvents,
  categories as categoriesTable,
} from "@/lib/db/schema";
import { and, eq, ilike, or, sql, inArray, notInArray } from "drizzle-orm";
import { dispatchNotification } from "@/lib/notifications/dispatch";

const MAX_MATCHES_PER_LEAD = 20;

/**
 * Wizard services are free-text slugs (e.g. "singer", "dj"). We map them
 * to category slugs in our DB. Extendable — anything not in this map will
 * be ignored for category matching but still contributes to city/budget.
 */
const SERVICE_TO_CATEGORY_SLUGS: Record<string, string[]> = {
  singer: ["cantareti-de-estrada", "interpreti-muzica-populara"],
  mc: ["moderatori"],
  dj: ["dj"],
  band: ["formatii", "cover-band"],
  photographer: ["foto-video"],
  videographer: ["foto-video"],
  show: ["show-program", "dansatori", "dansuri-populare"],
  decor: ["decor-floristica"],
  candy_bar: ["candy-bar"],
  fireworks: ["foc-de-artificii"],
  animators: ["animatori"],
  equipment: ["echipament-tehnic"],
};

export interface LeadMatchInput {
  leadId: number;
}

/**
 * Runs in the background after a lead is created. Deliberately swallows
 * errors so a matching failure never breaks the user-facing submission.
 */
export async function matchLeadToVendors(input: LeadMatchInput): Promise<number> {
  try {
    // 1. Load the lead with the wizard payload
    const [lead] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, input.leadId))
      .limit(1);
    if (!lead) return 0;

    const wizard = (lead.wizardData ?? {}) as {
      services?: string[];
      venueNeeded?: string;
    } | null;

    // 2. Resolve wizard services → category IDs
    const serviceSlugs = wizard?.services ?? [];
    const categorySlugs = Array.from(
      new Set(serviceSlugs.flatMap((s) => SERVICE_TO_CATEGORY_SLUGS[s] ?? [])),
    );

    let categoryIds: number[] = [];
    if (categorySlugs.length > 0) {
      const cats = await db
        .select({ id: categoriesTable.id })
        .from(categoriesTable)
        .where(inArray(categoriesTable.slug, categorySlugs));
      categoryIds = cats.map((c) => c.id);
    }

    // 3. Compute excluded artists (booked/blocked on that date)
    let excludedArtistIds: number[] = [];
    if (lead.eventDate) {
      const blocked = await db
        .select({ entityId: calendarEvents.entityId })
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.entityType, "artist"),
            eq(calendarEvents.date, lead.eventDate),
            inArray(calendarEvents.status, ["booked", "blocked"]),
          ),
        );
      excludedArtistIds = blocked.map((b) => b.entityId);
    }

    // 4. Load candidate artists — active only, free on the event date
    const conditions = [eq(artists.isActive, true)];
    if (excludedArtistIds.length > 0) {
      conditions.push(notInArray(artists.id, excludedArtistIds));
    }
    // City (free-text ILIKE). If the lead has no location, skip this filter.
    if (lead.location) {
      conditions.push(ilike(artists.location, `%${lead.location}%`));
    }
    // Budget: drop vendors whose priceFrom exceeds the client budget by >50%.
    if (lead.budget && lead.budget > 0) {
      conditions.push(
        or(
          sql`${artists.priceFrom} IS NULL`,
          sql`${artists.priceFrom} <= ${Math.round(lead.budget * 1.5)}`,
        )!,
      );
    }

    const candidates = await db
      .select({
        id: artists.id,
        categoryIds: artists.categoryIds,
        priceFrom: artists.priceFrom,
        isFeatured: artists.isFeatured,
        isVerified: artists.isVerified,
        ratingAvg: artists.ratingAvg,
        location: artists.location,
      })
      .from(artists)
      .where(and(...conditions))
      .limit(200);

    // 5. Score each candidate
    type Scored = {
      id: number;
      score: number;
      reasons: string[];
    };

    const scored: Scored[] = candidates.map((a) => {
      const reasons: string[] = [];
      let score = 20; // base

      // Category overlap (up to 40 pts)
      if (categoryIds.length > 0 && a.categoryIds?.length) {
        const overlap = a.categoryIds.filter((c) => categoryIds.includes(c));
        if (overlap.length > 0) {
          score += Math.min(40, overlap.length * 20);
          reasons.push(`Categorii potrivite: ${overlap.length}`);
        }
      }

      // City overlap (10 pts if location ILIKE already passed)
      if (lead.location && a.location?.toLowerCase().includes(lead.location.toLowerCase())) {
        score += 10;
        reasons.push(`Activează în ${lead.location}`);
      }

      // Budget fit (up to 15 pts). Already filtered to ≤150% budget.
      if (lead.budget && a.priceFrom && a.priceFrom <= lead.budget) {
        score += 15;
        reasons.push("În buget");
      } else if (lead.budget && a.priceFrom && a.priceFrom <= lead.budget * 1.5) {
        score += 5;
        reasons.push("Aproape de buget");
      }

      // Quality signals (up to 15 pts)
      if (a.isVerified) { score += 5; reasons.push("Verificat"); }
      if (a.isFeatured) { score += 5; reasons.push("Featured"); }
      if (a.ratingAvg && a.ratingAvg >= 4.5) { score += 5; reasons.push(`Rating ${a.ratingAvg.toFixed(1)}`); }

      return { id: a.id, score: Math.min(100, score), reasons };
    });

    // 6. Keep top N and insert lead_matches
    const top = scored
      .sort((x, y) => y.score - x.score)
      .slice(0, MAX_MATCHES_PER_LEAD)
      .filter((s) => s.score >= 30); // noise floor

    if (top.length === 0) return 0;

    await db.insert(leadMatches).values(
      top.map((t) => ({
        leadId: lead.id,
        artistId: t.id,
        score: t.score,
        reasons: t.reasons,
        status: "matched" as const,
      })),
    );

    // M5 — notify each matched artist's owner in-app (fire-and-forget).
    void (async () => {
      try {
        const matchedArtistIds = top.map((t) => t.id);
        const owners = await db
          .select({ id: artists.id, userId: artists.userId, nameRo: artists.nameRo })
          .from(artists)
          .where(inArray(artists.id, matchedArtistIds));
        const scoreById = new Map(top.map((t) => [t.id, t.score]));
        await Promise.all(
          owners
            .filter((a) => !!a.userId)
            .map((a) =>
              dispatchNotification({
                userId: a.userId!,
                type: "lead_new",
                title: "Lead nou potrivit pentru tine",
                message: `Potrivire ${scoreById.get(a.id) ?? ""}% · ${lead.eventType ?? "Eveniment"}${lead.location ? ` · ${lead.location}` : ""}`,
                actionUrl: "/dashboard/leads",
              }),
            ),
        );
      } catch (err) {
        console.error("[notifications] lead matching", err);
      }
    })();

    return top.length;
  } catch (err) {
    console.error("[matchLeadToVendors] failed:", err);
    return 0;
  }
}
