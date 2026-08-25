import { headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_HEADER, isLocale, localizePath } from "./routing";

/**
 * The path to send a signed-out visitor to, in the language they were reading.
 *
 * A bare `redirect("/sign-in")` from a server component drops the locale: a
 * Russian visitor bounced off /ru/cabinet landed on the Romanian sign-in page
 * and stayed in Romanian for the rest of the session. The middleware sets
 * LOCALE_HEADER on every request, so the language is knowable here.
 */
export async function signInPath(redirectTo?: string): Promise<string> {
  const raw = (await headers()).get(LOCALE_HEADER);
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const base = localizePath("/sign-in", locale);
  return redirectTo
    ? `${base}?redirect_url=${encodeURIComponent(localizePath(redirectTo, locale))}`
    : base;
}
