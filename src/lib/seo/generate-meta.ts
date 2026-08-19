import type { Metadata } from "next";
import type { Locale } from "@/types";
import { getLocalized } from "@/i18n";
import {
  localizePath,
  localeAlternates,
  ogLocaleFor,
  type AppLocale,
} from "@/lib/i18n/routing";

interface SEOEntity {
  [key: string]: unknown;
  seo_title_ro?: string;
  seo_title_ru?: string;
  seo_title_en?: string;
  seo_desc_ro?: string;
  seo_desc_ru?: string;
  seo_desc_en?: string;
}

interface GenerateMetaOptions {
  title?: string;
  description?: string;
  entity?: SEOEntity;
  locale?: Locale;
  path?: string;
  image?: string;
  type?: "website" | "article" | "profile";
  noindex?: boolean;
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://epetrecere.md";

export function generateMeta(opts: GenerateMetaOptions): Metadata {
  const locale = opts.locale || "ro";

  // Try entity SEO fields first, then fallback to provided values
  let title = opts.title || "";
  let description = opts.description || "";

  if (opts.entity) {
    const seoTitle = getLocalized(opts.entity, "seo_title", locale);
    const seoDesc = getLocalized(opts.entity, "seo_desc", locale);
    if (seoTitle) title = seoTitle;
    if (seoDesc) description = seoDesc;
  }

  // Canonical points at THIS locale's URL, and the alternates at the sibling
  // languages — now that each language has a distinct address, hreflang is
  // truthful instead of pointing three tags at one page.
  const bare = opts.path || "/";
  const url = `${BASE_URL}${localizePath(bare, locale as AppLocale)}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: "ePetrecere.md",
      type: opts.type || "website",
      locale: ogLocaleFor(locale as AppLocale),
      ...(opts.image && {
        images: [{ url: opts.image, width: 1200, height: 630, alt: title }],
      }),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(opts.image && { images: [opts.image] }),
    },
    alternates: {
      canonical: url,
      languages: localeAlternates(bare, BASE_URL),
    },
    ...(opts.noindex && { robots: { index: false, follow: false } }),
  };
}

/**
 * Same as `generateMeta`, but resolves the locale from the request instead of
 * requiring every caller to thread it through. Use inside an async
 * `generateMetadata()` so a prefixed URL (/ru/..., /en/...) gets its own
 * canonical and og:locale — a static `export const metadata` cannot read
 * headers, so it would label the RU page as a duplicate of the RO one.
 */
export async function generateMetaAsync(
  opts: GenerateMetaOptions,
): Promise<Metadata> {
  const { headers } = await import("next/headers");
  const { LOCALE_HEADER, DEFAULT_LOCALE, isLocale } = await import(
    "@/lib/i18n/routing"
  );
  const h = await headers();
  const raw = h.get(LOCALE_HEADER);
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  return generateMeta({ ...opts, locale: opts.locale ?? (locale as never) });
}
