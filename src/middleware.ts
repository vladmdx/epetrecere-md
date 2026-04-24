import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

const isAdminRoute = createRouteMatcher(["/admin(.*)"]);
const isVendorRoute = createRouteMatcher(["/dashboard(.*)"]);
const isProtectedRoute = createRouteMatcher(["/admin(.*)", "/dashboard(.*)"]);

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

const LEGACY_EVENT_KEYWORDS = new Set([
  "nunta",
  "botez",
  "cumetrie",
  "corporate",
  "zi-nastere",
  "aniversare",
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
  const pathname = req.nextUrl.pathname;

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
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
