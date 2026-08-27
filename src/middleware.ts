import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import {
  DEFAULT_LOCALE,
  LOCALE_HEADER,
  isLocale,
  localizePath,
  splitLocale,
} from "@/lib/i18n/routing";

const isProtectedRoute = createRouteMatcher(["/admin(.*)", "/dashboard(.*)"]);

/** The same two trees, tested against the path with any locale prefix removed. */
const PROTECTED_PATHS = /^\/(admin|dashboard)(\/|$)/;

/**
 * DB-backed slug redirects (AD-29, spec 4.7).
 *
 * Previously the page-level `permanentRedirect` in /sali/[slug]/page.tsx
 * and /artisti/[slug]/page.tsx returned HTTP 200 + skeleton loading HTML
 * instead of 308, because Next 15 streaming commits the status header
 * before the thrown redirect is processed. That broke SEO and any bot
 * that follows the old URL.
 *
 * Fix: perform the redirect lookup here in middleware, which runs BEFORE
 * any page rendering and can return `NextResponse.redirect(url, 301)`
 * with correct headers.
 *
 * To avoid a DB query per request, we fetch the full redirects table
 * once per Edge instance and cache it for 5 minutes. Table is small
 * (~20 rows in practice) so the memory + bandwidth cost is trivial.
 */
let redirectsCache: Map<string, string> | null = null;
let redirectsCacheLoadedAt = 0;
// 60s is a pragmatic balance — slug renames are rare (monthly at most),
// and a fresh rename only "misses" the redirect for up to a minute before
// the cache refreshes on next request. Shorter TTL means more DB hits
// but query is trivial (table is small).
const REDIRECTS_CACHE_TTL_MS = 60 * 1000;

async function getSlugRedirectsMap(): Promise<Map<string, string>> {
  if (
    redirectsCache &&
    Date.now() - redirectsCacheLoadedAt < REDIRECTS_CACHE_TTL_MS
  ) {
    return redirectsCache;
  }
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const rows = (await sql`
      SELECT from_path, to_path FROM redirects
      WHERE from_path LIKE '/sali/%' OR from_path LIKE '/artisti/%'
    `) as Array<{ from_path: string; to_path: string }>;
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.from_path, r.to_path);
    redirectsCache = map;
    redirectsCacheLoadedAt = Date.now();
    return map;
  } catch (err) {
    // Never break middleware on DB hiccup — return last-known (possibly stale)
    // map, or an empty one. The page-level fallback inside /sali/[slug]
    // still handles the redirect (just without the 308 status).
    console.warn("[middleware] redirects cache load failed", err);
    return redirectsCache ?? new Map();
  }
}

/** Follow the redirect chain up to 5 hops. Matches the per-page helper
 *  used inside /sali/[slug] and /artisti/[slug]. */
async function resolveSlugRedirect(
  pathname: string,
): Promise<string | null> {
  if (!pathname.startsWith("/sali/") && !pathname.startsWith("/artisti/")) {
    return null;
  }
  const map = await getSlugRedirectsMap();
  if (map.size === 0) return null;
  let current = pathname;
  for (let i = 0; i < 5; i++) {
    const next = map.get(current);
    if (!next) break;
    current = next;
  }
  return current === pathname ? null : current;
}

/**
 * M2 SEO legacy redirects — WARN #2 from the M5–F-S6 test pass.
 *
 * The original test spec referenced URLs like `/moderatori-nunta-chisinau`
 * which never shipped; the canonical route is `/artisti/in/{city}/{category}`.
 * To keep any inbound SEO backlinks or ads campaigns from 404-ing, we
 * parse the slug-flat pattern here and 301 to the canonical path.
 *
 * Supported legacy patterns:
 *   /{category}-{city}                    (e.g. /moderatori-chisinau)
 *   /{category}-nunta-{city}              (e.g. /moderatori-nunta-chisinau)
 *   /{category}-botez-{city}
 *   /{category}-cumetrie-{city}
 *   /{category}-corporate-{city}
 *
 * Venues use a simpler legacy shape:
 *   /sali-{city}                          → /sali/in/{city}
 *   /sali-nunta-{city}                    → /sali/in/{city}
 *
 * Both category and city slugs must be in the hardcoded allowlists so we
 * don't accidentally redirect random routes that happen to contain a dash.
 */
const LEGACY_CATEGORY_SLUGS = new Set([
  "moderatori",
  "dj",
  "cantareti",
  "formatii",
  "fotografi",
  "videografi",
  "decor",
  "animatori",
  "echipament-tehnic",
  "show-program",
  "cantareti-de-estrada",
  "interpreti-muzica-populara",
  "cover-band",
  "instrumentalisti",
  "cvartet",
  "dansatori",
  "dansuri-populare",
  "ansamblu-tiganesc",
  "dans-oriental",
  "striptiz",
  "iluzionisti-magicieni",
  "show-ul-focului",
  "clovni",
  "interesant-la-sarbatoare",
  "stand-up",
  "show-circus",
  "mos-craciun",
  "foto-video",
  "foto-zona-selfie",
]);

const LEGACY_CITY_SLUGS = new Set([
  "chisinau",
  "balti",
  "tiraspol",
  "cahul",
  "ungheni",
  "orhei",
  "comrat",
  "soroca",
  "hincesti",
  "straseni",
  "ialoveni",
]);

/**
 * Paths where an unprefixed URL should follow the `locale` cookie rather than
 * fall back to Romanian. Public catalogue pages are excluded on purpose —
 * they are the indexed canonicals.
 */
/**
 * Paths served from outside the `[locale]` segment. They must reach Next
 * exactly as requested — a locale prefix would point at nothing.
 */
const NON_LOCALIZED_PREFIXES = ["/api", "/_next", "/trpc", "/monitoring"];
const NON_LOCALIZED_EXACT = new Set([
  "/sitemap.xml",
  "/robots.txt",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icon",
]);

function isNonLocalizedPath(pathname: string): boolean {
  if (NON_LOCALIZED_EXACT.has(pathname)) return true;
  if (/\.[a-z0-9]+$/i.test(pathname)) return true; // any static asset
  return NON_LOCALIZED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

const LOCALE_COOKIE_ROUTES = [
  "/sign-in",
  "/sign-up",
  "/auth-redirect",
  "/cabinet",
  "/dashboard",
];

const LEGACY_EVENT_KEYWORDS = new Set([
  "nunta",
  "cununie",
  "cerere-in-casatorie",
  "botez",
  "cumetrie",
  "corporate",
  "zi-nastere",
  "aniversare",
  "aniversare-copii",
]);

/**
 * Attempts to parse a legacy flat slug like `moderatori-nunta-chisinau`
 * and rewrite it to the canonical `/artisti/in/chisinau/moderatori`.
 *
 * Returns the canonical pathname if the slug matches, or null otherwise.
 */
function resolveLegacySeoSlug(pathname: string): string | null {
  // Only single-segment slugs (no nested paths).
  const slug = pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!slug || slug.includes("/")) return null;

  // --- Venues: /sali-{city} and /sali-nunta-{city} etc. ---
  if (slug.startsWith("sali-")) {
    const rest = slug.slice("sali-".length);
    const parts = rest.split("-");
    // Drop optional event keyword.
    if (parts.length >= 2 && LEGACY_EVENT_KEYWORDS.has(parts[0])) parts.shift();
    const city = parts.join("-");
    if (LEGACY_CITY_SLUGS.has(city)) return `/sali/in/${city}`;
    return null;
  }

  // --- Artists: find a known category prefix, then optional event keyword, then city ---
  // Try longest category slug first (so "echipament-tehnic" wins over just "echipament").
  const sortedCats = [...LEGACY_CATEGORY_SLUGS].sort(
    (a, b) => b.length - a.length,
  );
  for (const cat of sortedCats) {
    if (slug === cat || !slug.startsWith(cat + "-")) continue;
    const rest = slug.slice(cat.length + 1);
    const parts = rest.split("-");
    // Drop optional event keyword(s).
    while (parts.length > 1 && LEGACY_EVENT_KEYWORDS.has(parts[0])) {
      parts.shift();
    }
    // Multi-word city slugs are possible (e.g. "zi-nastere"), but all
    // current cities in the whitelist are single-token, so just join.
    const city = parts.join("-");
    if (LEGACY_CITY_SLUGS.has(city)) {
      return `/artisti/in/${city}/${cat}`;
    }
  }

  return null;
}

export default clerkMiddleware(async (auth, req) => {
  const rawPathname = req.nextUrl.pathname;

  // ── i18n routing ───────────────────────────────────────────────────────
  // Each language now has its own URL (/sali, /ru/sali, /en/sali) so search
  // engines can index all three. The prefix is stripped here and handed to
  // server components through a request header, which keeps the existing
  // route tree (and Clerk's matchers) working unchanged.
  const { locale, pathname } = splitLocale(rawPathname);
  const hasPrefix = locale !== DEFAULT_LOCALE;

  // "/ro/..." is not a real URL — RO is served unprefixed. Redirect so we
  // never serve the same page under two addresses.
  const firstSegment = rawPathname.split("/")[1];
  if (firstSegment === DEFAULT_LOCALE) {
    const url = req.nextUrl.clone();
    const rest = "/" + rawPathname.split("/").slice(2).join("/");
    url.pathname = rest === "//" ? "/" : rest;
    return NextResponse.redirect(url, 308);
  }
  void isLocale;

  // Safety net for the account area. Every link inside /cabinet and
  // /dashboard is a plain next/link, and Clerk's own footer links and OAuth
  // returns are built from configured URLs — so a Russian visitor who signs
  // in has any number of ways to land on an unprefixed path and get served
  // Romanian for the rest of the session. When that happens, honour the
  // language they actually picked, which the switcher already stores.
  //
  // Deliberately limited to the signed-in surfaces: the public pages are the
  // SEO canonicals and must never redirect on a cookie, or a crawler that
  // happens to carry one would be sent away from the URL it asked for.
  if (!hasPrefix && req.method === "GET") {
    const cookieLocale = req.cookies.get("locale")?.value;
    const isAppRoute = LOCALE_COOKIE_ROUTES.some(
      (r) => pathname === r || pathname.startsWith(r + "/"),
    );
    if (isAppRoute && isLocale(cookieLocale) && cookieLocale !== DEFAULT_LOCALE) {
      const url = req.nextUrl.clone();
      url.pathname = localizePath(pathname, cookieLocale);
      return NextResponse.redirect(url, 307);
    }
  }

  // Legacy SEO redirects must run BEFORE auth logic so public crawlers
  // hitting `/moderatori-nunta-chisinau` get a clean 301 to the canonical URL.
  const canonical = resolveLegacySeoSlug(pathname);
  if (canonical) {
    const url = req.nextUrl.clone();
    url.pathname = canonical;
    return NextResponse.redirect(url, 301);
  }

  // DB-backed per-entity slug redirects (spec 4.7). Owner renamed their
  // venue/artist slug → we inserted a row in `redirects` table → here we
  // serve a proper 301 at HTTP level. Page-level `permanentRedirect`
  // fallback still runs if this cache is stale.
  const renamedPath = await resolveSlugRedirect(pathname);
  if (renamedPath) {
    const url = req.nextUrl.clone();
    url.pathname = renamedPath;
    return NextResponse.redirect(url, 301);
  }

  // SEC — Force sign-in for protected routes (/admin/*, /dashboard/*).
  // Role-based access (admin vs vendor vs user) is enforced at the
  // layout/page/API level via requireAdmin() and individual auth()
  // checks; this middleware gate catches the anonymous-access case
  // early so unauthenticated requests never reach server components.
  // Match the locale-stripped path: createRouteMatcher sees the raw URL, so
  // "/admin(.*)" never matched /ru/admin and the middleware gate covered only
  // the Romanian addresses. The pages' own requireAdmin() caught the rest,
  // but a guard that works in one language out of three is not a guard.
  if (isProtectedRoute(req) || PROTECTED_PATHS.test(pathname)) {
    // Redirect rather than `auth.protect()`. That helper answers a signed-out
    // visitor by rewriting to an internal `/clerk_<id>` path and RETURNING a
    // response — which this code awaited and then threw away, carrying on to
    // its own rewrite. It also expects that internal path to 404, which stops
    // being true the moment a `[locale]` segment sits at the root and matches
    // anything. Sending them to sign-in is explicit, survives both, and is
    // what /cabinet already did.
    const { userId } = await auth();
    if (!userId) {
      const url = req.nextUrl.clone();
      url.pathname = localizePath("/sign-in", locale);
      url.search = "";
      url.searchParams.set("redirect_url", rawPathname);
      return NextResponse.redirect(url);
    }
  }

  // Every page lives under the `[locale]` segment, so the locale is a build
  // parameter and the pages can be prerendered. Romanian is still served
  // unprefixed on the wire — `/sali` is rewritten onto `/ro/sali` here, which
  // is an internal rewrite, so the address bar and the indexed URLs are
  // untouched. A prefixed request already matches the segment and passes
  // through as it is.
  //
  // The header is still set: a handful of non-page surfaces (route handlers,
  // sitemap, opengraph-image) have no route params to read.
  const headers = new Headers(req.headers);
  headers.set(LOCALE_HEADER, locale);

  // Only PAGES live under `[locale]`. Route handlers, the sitemap, robots
  // and the icon stayed at the root of src/app, so rewriting them onto
  // `/ro/...` sends them to a route that does not exist — which is exactly
  // what happened when the segment landed: every API endpoint, the sitemap
  // and robots.txt went 404 in production.
  if (!hasPrefix && !isNonLocalizedPath(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = `/${DEFAULT_LOCALE}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url, { request: { headers } });
  }
  return NextResponse.next({ request: { headers } });
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
