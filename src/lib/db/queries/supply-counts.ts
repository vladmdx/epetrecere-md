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
import { withTimeout } from "@/lib/db/with-timeout";
import { db } from "@/lib/db";
import { artists, venues, categories, bookingRequests, users } from "@/lib/db/schema";

export interface SupplyCounts {
  /** Per homepage tile key. */
  categories: Record<string, number>;
  /** Active artists per category slug — the grouped query already produces
   *  the whole map, so any page that lists categories can show a real
   *  number instead of a hardcoded one. */
  bySlug: Record<string, number>;
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
    bySlug: {},
    activeArtists: 0,
    activeVenues: 0,
    serviceCategories: 0,
    completedRequests: 0,
  };

  try {
    // Bounded. Every caller already renders without these numbers, so a slow
    // or contended database should cost a counter, never a page — and never a
    // deploy. Waiting is the failure mode that actually happens here: the
    // driver queues rather than erroring once the pooler is full.
    const [[artistRow], [venueRow], [catRow], [reqRow]] = await withTimeout(
      Promise.all([
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(artists)
        .where(eq(artists.isActive, true)),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(venues)
        .where(eq(venues.isActive, true)),
      db.select({ n: sql<number>`count(*)::int` }).from(categories),
      // Exclude bookings made by QA/E2E accounts — they are real rows, but
      // counting them would overstate the marketplace's activity on a public
      // trust badge. The data stays; only the public tally ignores it.
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(bookingRequests)
        .leftJoin(users, eq(users.id, bookingRequests.clientUserId))
        .where(
          sql`${bookingRequests.status} in ('completed','confirmed_by_client')
              and (${users.email} is null or ${users.email} !~* '(test|qa|demo|e2e)')`,
        ),
    ]),
    );

    // One grouped statement for every tile. This used to be a loop that
    // awaited a separate count per tile — five more strictly serial
    // round-trips to Frankfurt on every homepage render, which was the
    // single longest stretch of the critical path.
    const perCategory = await withTimeout(
      db
      .select({
        slug: categories.slug,
        n: sql<number>`count(${artists.id})::int`,
      })
      .from(categories)
      .leftJoin(
        artists,
        and(
          eq(artists.isActive, true),
          sql`${categories.id} = ANY(${artists.categoryIds})`,
        ),
      )
      .groupBy(categories.slug),
    );

    const countBySlug = new Map(perCategory.map((r) => [r.slug, r.n]));
    const result: Record<string, number> = {};

    for (const [tile, slug] of Object.entries(TILE_CATEGORY_SLUG)) {
      // A null slug means the tile counts venues, not artists.
      result[tile] = slug === null ? (venueRow?.n ?? 0) : (countBySlug.get(slug) ?? 0);
    }

    return {
      categories: result,
      bySlug: Object.fromEntries(countBySlug),
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
