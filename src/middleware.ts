import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isAdminRoute = createRouteMatcher(["/admin(.*)"]);
const isVendorRoute = createRouteMatcher(["/dashboard(.*)"]);
const isProtectedRoute = createRouteMatcher(["/admin(.*)", "/dashboard(.*)"]);

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
  // Legacy SEO redirects must run BEFORE auth logic so public crawlers
  // hitting `/moderatori-nunta-chisinau` get a clean 301 to the canonical URL.
  const canonical = resolveLegacySeoSlug(req.nextUrl.pathname);
  if (canonical) {
    const url = req.nextUrl.clone();
    url.pathname = canonical;
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
