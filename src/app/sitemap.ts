import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { artists, venues, categories, blogPosts, eventPhotos, eventPlans } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { CITIES } from "@/lib/seo/cities";
import {
  LOCALES,
  localeAlternates,
  localizePath,
} from "@/lib/i18n/routing";
import { SITE_URL } from "@/lib/seo/generate-meta";

// M2 — Dynamic sitemap. Next.js calls this on demand (revalidated hourly)
// and emits an XML sitemap at /sitemap.xml. Includes every indexable URL:
//   - Static public pages
//   - All active artists
//   - All active venues
//   - All active categories
//   - All published blog posts
//   - SEO auto-pages: /artisti/in/[city], /artisti/in/[city]/[category], /sali/in/[city]

// One shared origin with the canonical/hreflang helper and robots.txt. It is
// sanitized there (`.trim()` + trailing-slash strip) because the value in
// `.env.production.local` carries a trailing newline, which was shipping broken
// `<loc>` URLs (`https://epetrecere.md\n/artisti/...`) to Google.
const BASE_URL = SITE_URL;

// Revalidate the sitemap at most once an hour so Google doesn't hammer the DB.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // ─── Static routes ────────────────────────────────────
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE_URL}/artisti`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/sali`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/planifica`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/servicii`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/cum-functioneaza`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/utilitati`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/despre`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/calculatoare`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/calculatoare/alcool`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/calculatoare/buget`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/calculatoare/dar-nunta`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/calculatoare/invitati`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/calculatoare/meniu`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/calculatoare/nunta`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/nunti-reale`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/categorii`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/pachete`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/chestionar`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    // Legal pages are thin but they are indexable and were reachable only via
    // footer links, so crawlers rediscovered them slowly after every deploy.
    { url: `${BASE_URL}/legal`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/termeni`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/confidentialitate`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/cookies`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  // ─── Real weddings (public plans with approved photos) ────
  const realWeddings = await db
    .selectDistinct({ id: eventPlans.id, updatedAt: eventPlans.updatedAt })
    .from(eventPlans)
    .innerJoin(eventPhotos, eq(eventPhotos.planId, eventPlans.id))
    .where(
      and(eq(eventPhotos.isPublic, true), eq(eventPhotos.isApproved, true)),
    );
  const realWeddingRoutes: MetadataRoute.Sitemap = realWeddings.map((w) => ({
    url: `${BASE_URL}/nunti-reale/${w.id}`,
    lastModified: w.updatedAt ?? now,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  // ─── Artists ──────────────────────────────────────────
  const activeArtists = await db
    .select({ slug: artists.slug, updatedAt: artists.updatedAt })
    .from(artists)
    .where(eq(artists.isActive, true));

  const artistRoutes: MetadataRoute.Sitemap = activeArtists.map((a) => ({
    url: `${BASE_URL}/artisti/${a.slug}`,
    lastModified: a.updatedAt ?? now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  // ─── Venues ───────────────────────────────────────────
  const activeVenues = await db
    .select({ slug: venues.slug, updatedAt: venues.updatedAt })
    .from(venues)
    .where(eq(venues.isActive, true));

  const venueRoutes: MetadataRoute.Sitemap = activeVenues.map((v) => ({
    url: `${BASE_URL}/sali/${v.slug}`,
    lastModified: v.updatedAt ?? now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  // ─── Categories ───────────────────────────────────────
  const activeCategories = await db
    .select({ slug: categories.slug })
    .from(categories)
    .where(eq(categories.isActive, true));

  const categoryRoutes: MetadataRoute.Sitemap = activeCategories.map((c) => ({
    url: `${BASE_URL}/categorie/${c.slug}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  // ─── SEO auto-pages: city landings ────────────────────
  const cityArtistRoutes: MetadataRoute.Sitemap = CITIES.map((c) => ({
    url: `${BASE_URL}/artisti/in/${c.slug}`,
    lastModified: now,
    changeFrequency: "daily" as const,
    priority: 0.7 * c.priority,
  }));

  const cityVenueRoutes: MetadataRoute.Sitemap = CITIES.map((c) => ({
    url: `${BASE_URL}/sali/in/${c.slug}`,
    lastModified: now,
    changeFrequency: "daily" as const,
    priority: 0.7 * c.priority,
  }));

  // ─── SEO auto-pages: city × category ──────────────────
  const cityCategoryRoutes: MetadataRoute.Sitemap = [];
  for (const city of CITIES) {
    for (const cat of activeCategories) {
      cityCategoryRoutes.push({
        url: `${BASE_URL}/artisti/in/${city.slug}/${cat.slug}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.6 * city.priority,
      });
    }
  }

  // ─── Blog posts ───────────────────────────────────────
  const posts = await db
    .select({ slug: blogPosts.slug, updatedAt: blogPosts.updatedAt })
    .from(blogPosts)
    .where(eq(blogPosts.status, "published"));

  const blogRoutes: MetadataRoute.Sitemap = posts.map((p) => ({
    url: `${BASE_URL}/blog/${p.slug}`,
    lastModified: p.updatedAt ?? now,
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));

  const all = [
    ...staticRoutes,
    ...artistRoutes,
    ...venueRoutes,
    ...categoryRoutes,
    ...cityArtistRoutes,
    ...cityVenueRoutes,
    ...cityCategoryRoutes,
    ...blogRoutes,
    ...realWeddingRoutes,
  ];

  // Every page exists in three languages at three distinct URLs, so the
  // sitemap lists all of them and declares the alternates. Without this the
  // RU/EN versions would be crawled only if something happened to link to
  // them.
  return withLocaleAlternates(all);
}

/** Expand each entry into its ro/ru/en URLs, each carrying `alternates`. */
function withLocaleAlternates(
  entries: MetadataRoute.Sitemap,
): MetadataRoute.Sitemap {
  const out: MetadataRoute.Sitemap = [];
  for (const e of entries) {
    const path = e.url.startsWith(BASE_URL) ? e.url.slice(BASE_URL.length) : e.url;
    const languages = localeAlternates(path || "/", BASE_URL);
    for (const locale of LOCALES) {
      out.push({
        ...e,
        url: `${BASE_URL}${localizePath(path || "/", locale)}`,
        alternates: { languages },
      });
    }
  }
  return out;
}
