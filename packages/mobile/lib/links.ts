// Centralized external-link helper. Opens public epetrecere.md pages
// (terms, contact, public profiles) in an in-app browser sheet.
//
// WEB_BASE is derived from the API URL so it follows the same domain in
// every environment (prod / preview) instead of being hardcoded.

import * as WebBrowser from "expo-web-browser";

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

/** Open a path (relative to WEB_BASE) or absolute URL in an in-app browser. */
export function openExternal(pathOrUrl: string): Promise<unknown> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${WEB_BASE}${pathOrUrl}`;
  return WebBrowser.openBrowserAsync(url).catch(() => {
    // Swallow — a failed browser open shouldn't crash the screen.
  });
}
