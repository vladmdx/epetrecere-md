import type { MetadataRoute } from "next";
import { DEFAULT_LOCALE, LOCALES } from "@/lib/i18n/routing";
import { SITE_URL } from "@/lib/seo/generate-meta";

// M2 — robots.txt. Next.js emits this at /robots.txt. Keep private / auth
// surfaces out of the index and point crawlers at the dynamic sitemap.

// Same sanitized origin as the sitemap and every canonical URL — the env value
// may carry a trailing newline. See generate-meta.ts.
const BASE_URL = SITE_URL;

/** Private surfaces. Listed bare and under every locale prefix. */
const PRIVATE_ROUTES = [
  "/admin",
  "/dashboard",
  "/cabinet",
  "/sign-in",
  "/sign-up",
  "/auth-redirect",
  "/test-login",
];

/** Never locale-prefixed by the router, so these need no prefixed twins. */
const NON_PAGE_ROUTES = ["/api/", "/_next/"];

export default function robots(): MetadataRoute.Robots {
  // Middleware rewrites /ru/admin onto /admin, so every private route answers
  // under all three prefixes. Listing only the bare paths left /ru/cabinet and
  // /en/dashboard crawlable.
  const prefixes = ["", ...LOCALES.filter((l) => l !== DEFAULT_LOCALE).map((l) => `/${l}`)];
  const disallow = [
    ...prefixes.flatMap((prefix) =>
      PRIVATE_ROUTES.flatMap((route) => [`${prefix}${route}`, `${prefix}${route}/`]),
    ),
    ...NON_PAGE_ROUTES,
  ];

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow,
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
