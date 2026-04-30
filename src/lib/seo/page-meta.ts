// Helper for fetching admin-editable SEO overrides for static routes.
// Each public page calls getPageMeta("/some-path") inside generateMetadata
// and merges the result into generateMeta() — null fields fall back to the
// hardcoded defaults the page already provided.

import type { Metadata } from "next";
import { db } from "@/lib/db";
import { pageMeta } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateMeta } from "./generate-meta";

export interface PageMetaOverride {
  title: string | null;
  description: string | null;
}

/**
 * Returns admin-set overrides for the given path or null if none exist.
 * Failure (DB unreachable, table missing during a fresh deploy) is swallowed
 * so static pages never crash trying to fetch optional SEO data.
 */
export async function getPageMeta(path: string): Promise<PageMetaOverride | null> {
  try {
    const [row] = await db
      .select({ title: pageMeta.title, description: pageMeta.description })
      .from(pageMeta)
      .where(eq(pageMeta.path, path))
      .limit(1);
    if (!row) return null;
    return { title: row.title, description: row.description };
  } catch {
    return null;
  }
}

interface MetaDefaults {
  title: string;
  description: string;
  noindex?: boolean;
}

/**
 * One-call helper for static pages — pulls admin override from page_meta and
 * falls back to the hardcoded defaults. Use inside `generateMetadata()`.
 */
export async function metaForPath(
  path: string,
  defaults: MetaDefaults,
): Promise<Metadata> {
  const override = await getPageMeta(path);
  return generateMeta({
    title: override?.title ?? defaults.title,
    description: override?.description ?? defaults.description,
    path,
    noindex: defaults.noindex,
  });
}
