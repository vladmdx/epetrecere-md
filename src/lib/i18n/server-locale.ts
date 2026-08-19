import { cookies, headers } from "next/headers";
import type { Locale } from "@/types";
import { DEFAULT_LOCALE, LOCALE_HEADER, isLocale } from "@/lib/i18n/routing";

/**
 * Locale for the current server render.
 *
 * The URL prefix wins: /ru/... is Russian no matter what cookie the visitor
 * carries, so a shared link always opens in the language it advertises and
 * crawlers see one language per URL. The cookie is only a fallback for
 * requests that never passed through the locale middleware.
 */
export async function getServerLocale(): Promise<Locale> {
  const h = await headers();
  const fromUrl = h.get(LOCALE_HEADER);
  if (isLocale(fromUrl)) return fromUrl as Locale;

  const store = await cookies();
  const fromCookie = store.get("locale")?.value;
  return (isLocale(fromCookie) ? fromCookie : DEFAULT_LOCALE) as Locale;
}
