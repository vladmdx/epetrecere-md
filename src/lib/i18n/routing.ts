/**
 * Path-based i18n routing.
 *
 * Until now the site served the SAME html at the same URL for every language
 * and swapped the text client-side from a cookie. That is invisible to search
 * engines: one URL can only be indexed as one language, so RU/EN content was
 * unreachable to crawlers and `hreflang` would have been a lie.
 *
 * Now each language has its own URL:
 *     RO (default)  /sali            ← canonical, kept unprefixed
 *     RU            /ru/sali
 *     EN            /en/sali
 *
 * The prefix is stripped by middleware, which rewrites to the existing route
 * tree and passes the locale on via a request header. That keeps the whole
 * `(public)/(admin)/(vendor)` folder structure — and Clerk's matchers —
 * untouched, instead of moving 40 routes under an `[locale]` segment.
 */

export const LOCALES = ["ro", "ru", "en"] as const;
export type AppLocale = (typeof LOCALES)[number];

/** RO is served unprefixed so the canonical URLs stay clean and stable. */
export const DEFAULT_LOCALE: AppLocale = "ro";

/** Header the middleware uses to hand the locale to server components. */
export const LOCALE_HEADER = "x-app-locale";

export function isLocale(v: string | null | undefined): v is AppLocale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}

/** Split "/ru/sali" into { locale: "ru", pathname: "/sali" }. */
export function splitLocale(pathname: string): {
  locale: AppLocale;
  pathname: string;
} {
  const segments = pathname.split("/");
  const first = segments[1];
  if (isLocale(first) && first !== DEFAULT_LOCALE) {
    const rest = "/" + segments.slice(2).join("/");
    return { locale: first, pathname: rest === "//" ? "/" : rest };
  }
  return { locale: DEFAULT_LOCALE, pathname };
}

/** Build the public URL for a path in a given locale. */
export function localizePath(pathname: string, locale: AppLocale): string {
  // Never prefix non-page paths.
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("#") ||
    /^https?:\/\//.test(pathname)
  ) {
    return pathname;
  }
  const { pathname: bare } = splitLocale(pathname);
  if (locale === DEFAULT_LOCALE) return bare;
  return `/${locale}${bare === "/" ? "" : bare}`;
}

/** Absolute alternates for `<link rel="alternate" hreflang>`. */
export function localeAlternates(
  pathname: string,
  baseUrl: string,
): Record<string, string> {
  const { pathname: bare } = splitLocale(pathname);
  const out: Record<string, string> = {};
  for (const l of LOCALES) {
    out[hreflangFor(l)] = `${baseUrl}${localizePath(bare, l)}`;
  }
  // Tell crawlers which version to serve when no language matches.
  out["x-default"] = `${baseUrl}${localizePath(bare, DEFAULT_LOCALE)}`;
  return out;
}

/** BCP-47 tag used in hreflang and og:locale. */
export function hreflangFor(locale: AppLocale): string {
  return locale === "ro" ? "ro-MD" : locale === "ru" ? "ru-MD" : "en";
}

export function ogLocaleFor(locale: AppLocale): string {
  return locale === "ro" ? "ro_MD" : locale === "ru" ? "ru_MD" : "en_US";
}
