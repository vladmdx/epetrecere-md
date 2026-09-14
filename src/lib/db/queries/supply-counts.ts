/**
 * Real supply counts for the homepage.
 *
 * The homepage used to hardcode "120+ / 150+ / 80+ …" next to each category
 * and "500+ furnizori verificați" in the trust band. Those were marketing
 * placeholders, not data — a marketplace advertising supply it doesn't have is
 * a trust problem, and the QA audit flagged it. These read the catalog, so the
 * numbers are true whatever its size and rise on their own as it fills up.
 */

import { sql } from "drizzle-orm";
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
    // This must remain ONE database statement. Runtime postgres.js uses a
    // deliberately small pool; launching several queries with Promise.all
    // only makes them queue for the same sockets and can strand an ISR render
    // behind the pooler. Combining the counters also removes queue
    // amplification and leaves one failure boundary for the zero-data
    // fallback. Do not treat the postgres.js startup statement_timeout as a
    // hard deadline here: Supavisor's transaction endpoint ignores that
    // override.
    //
    // Exclude bookings made by QA/E2E accounts from the public trust badge.
    // They remain in the database; only this aggregate ignores them.
    type SupplyCountRow = {
      activeArtists: number | string;
      activeVenues: number | string;
      serviceCategories: number | string;
      completedRequests: number | string;
      bySlug: Record<string, number | string> | null;
    };
    const response = await db.execute<SupplyCountRow>(sql`
      WITH category_counts AS (
        SELECT
          ${categories.slug} AS slug,
          count(${artists.id})::int AS n
        FROM ${categories}
        LEFT JOIN ${artists}
          ON ${artists.isActive} = true
         AND ${categories.id} = ANY(${artists.categoryIds})
        GROUP BY ${categories.slug}
      )
      SELECT
        (SELECT count(*)::int FROM ${artists}
          WHERE ${artists.isActive} = true) AS "activeArtists",
        (SELECT count(*)::int FROM ${venues}
          WHERE ${venues.isActive} = true) AS "activeVenues",
        (SELECT count(*)::int FROM ${categories}) AS "serviceCategories",
        (SELECT count(*)::int
          FROM ${bookingRequests}
          LEFT JOIN ${users}
            ON ${users.id} = ${bookingRequests.clientUserId}
          WHERE ${bookingRequests.status} IN ('completed', 'confirmed_by_client')
            AND (${users.email} IS NULL
              OR ${users.email} !~* '(test|qa|demo|e2e)')) AS "completedRequests",
        coalesce(
          (SELECT jsonb_object_agg(slug, n) FROM category_counts),
          '{}'::jsonb
        ) AS "bySlug"
    `);
    const rows = response as unknown as SupplyCountRow[];
    const row = rows[0];
    if (!row) throw new Error("Supply count query returned no row");

    const toCount = (value: number | string | null | undefined) => {
      const parsed = Number(value ?? 0);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const countBySlug = new Map(
      Object.entries(row.bySlug ?? {}).map(([slug, count]) => [slug, toCount(count)]),
    );
    const result: Record<string, number> = {};

    for (const [tile, slug] of Object.entries(TILE_CATEGORY_SLUG)) {
      // A null slug means the tile counts venues, not artists.
      result[tile] = slug === null
        ? toCount(row.activeVenues)
        : (countBySlug.get(slug) ?? 0);
    }

    return {
      categories: result,
      bySlug: Object.fromEntries(countBySlug),
      activeArtists: toCount(row.activeArtists),
      activeVenues: toCount(row.activeVenues),
      serviceCategories: toCount(row.serviceCategories),
      completedRequests: toCount(row.completedRequests),
    };
  } catch {
    // DB unreachable — render without counters rather than with invented ones.
    return empty;
  }
}
