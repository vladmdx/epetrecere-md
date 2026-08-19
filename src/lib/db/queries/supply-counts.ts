/**
 * Real supply counts for the homepage.
 *
 * The homepage used to hardcode "120+ / 150+ / 80+ …" next to each category
 * and "500+ furnizori verificați" in the trust band. Those were marketing
 * placeholders, not data — a marketplace advertising supply it doesn't have is
 * a trust problem, and the QA audit flagged it. These read the catalog, so the
 * numbers are true whatever its size and rise on their own as it fills up.
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { artists, venues, categories, bookingRequests } from "@/lib/db/schema";

export interface SupplyCounts {
  /** Per homepage tile key. */
  categories: Record<string, number>;
  activeArtists: number;
  activeVenues: number;
  serviceCategories: number;
  completedRequests: number;
}

/** Homepage tile key → category slug (venues counts the venues table). */
const TILE_CATEGORY_SLUG: Record<string, string | null> = {
  venues: null,
  bands: "formatii",
  dj: "dj",
  photo: "fotografi",
  hosts: "moderatori",
  decor: "decor",
};

export async function getSupplyCounts(): Promise<SupplyCounts> {
  const empty: SupplyCounts = {
    categories: {},
    activeArtists: 0,
    activeVenues: 0,
    serviceCategories: 0,
    completedRequests: 0,
  };

  try {
    const [cats, [artistRow], [venueRow], [catRow], [reqRow]] = await Promise.all([
      db.select({ id: categories.id, slug: categories.slug }).from(categories),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(artists)
        .where(eq(artists.isActive, true)),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(venues)
        .where(eq(venues.isActive, true)),
      db.select({ n: sql<number>`count(*)::int` }).from(categories),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(bookingRequests)
        .where(
          sql`${bookingRequests.status} in ('completed','confirmed_by_client')`,
        ),
    ]);

    const bySlug = new Map(cats.map((c) => [c.slug, c.id]));
    const result: Record<string, number> = {};

    for (const [tile, slug] of Object.entries(TILE_CATEGORY_SLUG)) {
      if (slug === null) {
        result[tile] = venueRow?.n ?? 0;
        continue;
      }
      const catId = bySlug.get(slug);
      if (!catId) {
        result[tile] = 0;
        continue;
      }
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(artists)
        .where(
          and(
            eq(artists.isActive, true),
            sql`${catId} = ANY(${artists.categoryIds})`,
          ),
        );
      result[tile] = row?.n ?? 0;
    }

    return {
      categories: result,
      activeArtists: artistRow?.n ?? 0,
      activeVenues: venueRow?.n ?? 0,
      serviceCategories: catRow?.n ?? 0,
      completedRequests: reqRow?.n ?? 0,
    };
  } catch {
    // DB unreachable — render without counters rather than with invented ones.
    return empty;
  }
}
