// Centralized external-link helper. Opens public epetrecere.md pages
// (terms, contact, public profiles) in an in-app browser sheet.
//
// WEB_BASE is derived from the API URL so it follows the same domain in
// every environment (prod / preview) instead of being hardcoded.

import * as WebBrowser from "expo-web-browser";
import i18n from "./i18n";

const API = process.env.EXPO_PUBLIC_API_URL ?? "https://epetrecere.md/api/v1";
export const WEB_BASE = API.replace(/\/api\/v1\/?$/, "") || "https://epetrecere.md";

/** Known public web routes (kept here so callers don't hardcode paths). */
export const WEB_LINKS = {
  contact: "/contact",
  terms: "/termeni",
  privacy: "/confidentialitate",
  artist: (slug: string) => `/artisti/${slug}`,
  venue: (slug: string) => `/sali/${slug}`,
} as const;

/**
 * Prefix a path with the reader's locale, the way the website routes them:
 * Romanian is unprefixed, Russian and English take /ru and /en. Mirrors
 * `localizePath` in src/lib/i18n/routing.ts.
 *
 * Without this, a Russian-speaking user tapping "Политика конфиденциальности"
 * landed on the Romanian text — the translations exist and were simply
 * unreachable from the app.
 */
export function localizedPath(path: string): string {
  const lang = (i18n.language || "ro").slice(0, 2);
  return lang === "ru" || lang === "en" ? `/${lang}${path}` : path;
}

/**
 * Open a path (relative to WEB_BASE) or absolute URL in an in-app browser.
 * Relative paths are localized; absolute URLs are passed through untouched,
 * which is what the moments/scan-result callers rely on.
 */
export function openExternal(pathOrUrl: string): Promise<unknown> {
  const url = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : `${WEB_BASE}${localizedPath(pathOrUrl)}`;
  return WebBrowser.openBrowserAsync(url).catch(() => {
    // Swallow — a failed browser open shouldn't crash the screen.
  });
}
