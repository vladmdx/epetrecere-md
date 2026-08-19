// Helper for fetching admin-editable SEO overrides for static routes.
// Each public page calls getPageMeta("/some-path") inside generateMetadata
// and merges the result into generateMeta() — null fields fall back to the
// hardcoded defaults the page already provided.

import type { Metadata } from "next";
import { db } from "@/lib/db";
import { pageMeta } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateMeta } from "./generate-meta";
import type { Locale } from "@/types";

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
  localeArg?: Locale,
): Promise<Metadata> {
  // Default to the locale the middleware resolved from the URL prefix, so a
  // page under /ru gets Russian metadata and its own canonical instead of
  // inheriting the Romanian one.
  const locale: Locale = localeArg ?? (await resolveRequestLocale());
  // The current page_meta table stores Romanian values only. Applying the
  // same override to RU/EN would replace correctly translated metadata with
  // Romanian copy, so localized pages use their translated defaults.
  const override = locale === "ro" ? await getPageMeta(path) : null;
  return generateMeta({
    title: override?.title ?? defaults.title,
    description: override?.description ?? defaults.description,
    path,
    locale,
    noindex: defaults.noindex,
  });
}

/** Locale for the current request, from the URL prefix (see middleware). */
async function resolveRequestLocale(): Promise<Locale> {
  try {
    const { headers } = await import("next/headers");
    const { LOCALE_HEADER, DEFAULT_LOCALE, isLocale } = await import(
      "@/lib/i18n/routing"
    );
    const raw = (await headers()).get(LOCALE_HEADER);
    return (isLocale(raw) ? raw : DEFAULT_LOCALE) as Locale;
  } catch {
    return "ro";
  }
}
