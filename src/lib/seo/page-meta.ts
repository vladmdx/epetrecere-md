// Helper for fetching admin-editable SEO overrides for static routes.
// Each public page calls getPageMeta("/some-path") inside generateMetadata
// and merges the result into generateMeta() — null fields fall back to the
// hardcoded defaults the page already provided.

import type { Metadata } from "next";
import { db } from "@/lib/db";
import { pageMeta } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateMeta, resolveRequestLocale } from "./generate-meta";
import type { AppLocale } from "@/lib/i18n/routing";
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

export interface MetaCopy {
  title: string;
  description: string;
}

export interface MetaDefaults extends MetaCopy {
  noindex?: boolean;
}

/**
 * Metadata written once per language. Preferred shape for public pages: the
 * `Record<AppLocale, …>` forces all three languages to exist, so a page can no
 * longer ship Romanian copy to /ru just because nobody wrote the translation.
 */
export type LocalizedMetaDefaults = Record<AppLocale, MetaCopy> & {
  noindex?: boolean;
};

function isLocalized(
  defaults: MetaDefaults | LocalizedMetaDefaults,
): defaults is LocalizedMetaDefaults {
  return "ro" in defaults;
}

/**
 * One-call helper for static pages — pulls admin override from page_meta and
 * falls back to the supplied defaults. Use inside `generateMetadata()`.
 *
 * `defaults` may be a single already-resolved {title, description} pair or the
 * three-language record; in the latter case the page does not need to resolve
 * the locale itself.
 */
export async function metaForPath(
  path: string,
  defaults: MetaDefaults | LocalizedMetaDefaults,
  localeArg?: Locale,
): Promise<Metadata> {
  // Default to the locale the middleware resolved from the URL prefix, so a
  // page under /ru gets Russian metadata and its own canonical instead of
  // inheriting the Romanian one.
  const locale: Locale = localeArg ?? (await resolveRequestLocale());
  const copy: MetaCopy = isLocalized(defaults)
    ? defaults[locale as AppLocale]
    : defaults;
  // The current page_meta table stores Romanian values only. Applying the
  // same override to RU/EN would replace correctly translated metadata with
  // Romanian copy, so localized pages use their translated defaults.
  const override = locale === "ro" ? await getPageMeta(path) : null;
  return generateMeta({
    title: override?.title ?? copy.title,
    description: override?.description ?? copy.description,
    path,
    locale,
    noindex: defaults.noindex,
  });
}
