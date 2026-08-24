import type { Metadata } from "next";
import type { Locale } from "@/types";
import {
  DEFAULT_LOCALE,
  LOCALE_HEADER,
  isLocale,
  localizePath,
  localeAlternates,
  ogLocaleFor,
  type AppLocale,
} from "@/lib/i18n/routing";

/**
 * The multilingual SEO columns as Drizzle actually hands them back — camelCase
 * (`seoTitleRu`), not the snake_case this interface used to declare. Nothing in
 * the schema ever had a `seo_title_ru` key, so the lookup below silently found
 * nothing and every language served the Romanian copy. Snake_case is still
 * accepted for hand-built objects that mirror the raw column names.
 */
interface SEOEntity {
  [key: string]: unknown;
  seoTitleRo?: string | null;
  seoTitleRu?: string | null;
  seoTitleEn?: string | null;
  seoDescRo?: string | null;
  seoDescRu?: string | null;
  seoDescEn?: string | null;
}

/**
 * Copy for a metadata field. Pass a plain string when the caller has already
 * resolved the language, or the full three-language record when it has not —
 * `Record<AppLocale, string>` makes a forgotten translation a compile error at
 * the call site instead of a Romanian sentence quietly served to RU/EN readers.
 */
export type LocalizedText = string | Record<AppLocale, string>;

interface GenerateMetaOptions {
  title?: LocalizedText;
  description?: LocalizedText;
  entity?: SEOEntity;
  /** Omit to use the locale the middleware resolved from the URL prefix. */
  locale?: Locale;
  /** Bare (unprefixed) path — the helper adds the locale prefix itself. */
  path?: string;
  image?: string;
  type?: "website" | "article" | "profile";
  noindex?: boolean;
}

/**
 * Canonical origin for every absolute URL this app emits.
 *
 * `.trim()` + trailing-slash strip because the production `NEXT_PUBLIC_APP_URL`
 * carries a trailing newline — see the same defence in sitemap.ts. Without it
 * every canonical and every hreflang came out as `https://epetrecere.md\n/sali`.
 * sitemap.ts, robots.ts and the root layout's `metadataBase` all import this so
 * there is one origin instead of four that can drift apart.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "https://epetrecere.md"
)
  .trim()
  .replace(/\/+$/, "");

/**
 * Locale for the current request, straight off the header the middleware sets
 * from the URL prefix (`/ru/sali` → `ru`). Exported so page-meta.ts resolves it
 * the same way rather than keeping a second copy of this logic.
 */
export async function resolveRequestLocale(): Promise<Locale> {
  try {
    const { headers } = await import("next/headers");
    const raw = (await headers()).get(LOCALE_HEADER);
    return (isLocale(raw) ? raw : DEFAULT_LOCALE) as Locale;
  } catch {
    // No request in scope (a build-time call, a unit test). The default locale
    // is the only honest answer, and it is also the unprefixed URL.
    return DEFAULT_LOCALE as Locale;
  }
}

/** Pick the requested language out of `LocalizedText`. */
function pickText(text: LocalizedText | undefined, locale: AppLocale): string {
  if (!text) return "";
  return typeof text === "string" ? text : (text[locale] ?? "");
}

/**
 * Read one multilingual SEO column for exactly the requested language.
 *
 * Deliberately does NOT fall back to a sibling language the way `getLocalized`
 * does. An admin who filled in only `seo_title_ro` should leave the RU page on
 * its own translated default, not have the Romanian override overwrite it —
 * a missing translation must stay visible instead of being papered over.
 */
function seoField(
  entity: SEOEntity,
  field: "seoTitle" | "seoDesc",
  locale: AppLocale,
): string {
  const cap = locale.charAt(0).toUpperCase() + locale.slice(1);
  const snake = field === "seoTitle" ? "seo_title" : "seo_desc";
  const camel = entity[`${field}${cap}`];
  const value = typeof camel === "string" ? camel : entity[`${snake}_${locale}`];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Build the metadata for one page in the language of the current request.
 *
 * Async because the locale lives in a request header, and a synchronous helper
 * could only ever guess it — which is what it used to do (`opts.locale || "ro"`),
 * so every /ru and /en detail page shipped a Romanian canonical, Romanian
 * og:locale and an hreflang set that contradicted its own canonical. Callers
 * that already know the language may still pass `locale` explicitly.
 */
export async function generateMeta(
  opts: GenerateMetaOptions,
): Promise<Metadata> {
  const locale = (opts.locale ?? (await resolveRequestLocale())) as AppLocale;

  // Entity SEO columns override the page's own copy, but only for the language
  // that actually has a value (see seoField).
  let title = pickText(opts.title, locale);
  let description = pickText(opts.description, locale);

  if (opts.entity) {
    const seoTitle = seoField(opts.entity, "seoTitle", locale);
    const seoDesc = seoField(opts.entity, "seoDesc", locale);
    if (seoTitle) title = seoTitle;
    if (seoDesc) description = seoDesc;
  }

  // Canonical points at THIS locale's URL, and the alternates at the sibling
  // languages — now that each language has a distinct address, hreflang is
  // truthful instead of pointing three tags at one page.
  const bare = opts.path || "/";
  const url = `${SITE_URL}${localizePath(bare, locale)}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: "ePetrecere.md",
      type: opts.type || "website",
      locale: ogLocaleFor(locale),
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
      languages: localeAlternates(bare, SITE_URL),
    },
    ...(opts.noindex && { robots: { index: false, follow: false } }),
  };
}

/**
 * Alias kept because a dozen pages already import this name. `generateMeta` is
 * itself request-aware now, so the two are the same function.
 */
export const generateMetaAsync = generateMeta;
