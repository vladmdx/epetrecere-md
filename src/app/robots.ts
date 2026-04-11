import type { MetadataRoute } from "next";

// M2 — robots.txt. Next.js emits this at /robots.txt. Keep private / auth
// surfaces out of the index and point crawlers at the dynamic sitemap.

// See sitemap.ts — env may carry a trailing newline, sanitize defensively.
const BASE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://epetrecere.md")
  .trim()
  .replace(/\/+$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/admin/",
          "/dashboard",
          "/dashboard/",
          "/cabinet",
          "/cabinet/",
          "/api/",
          "/sign-in",
          "/sign-up",
          "/auth-redirect",
          "/test-login",
          "/_next/",
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
