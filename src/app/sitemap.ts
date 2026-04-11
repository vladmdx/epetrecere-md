import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { artists, venues, categories, blogPosts, eventPhotos, eventPlans } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { CITIES } from "@/lib/seo/cities";

// M2 — Dynamic sitemap. Next.js calls this on demand (revalidated hourly)
// and emits an XML sitemap at /sitemap.xml. Includes every indexable URL:
//   - Static public pages
//   - All active artists
//   - All active venues
//   - All active categories
//   - All published blog posts
//   - SEO auto-pages: /artisti/in/[city], /artisti/in/[city]/[category], /sali/in/[city]

// `.trim()` + trailing-slash strip defends against env values that carry
// a trailing newline or stray slash — one such value is currently in
// `.env.production.local` and was previously shipping broken `<loc>` URLs
// (`https://epetrecere.md\n/artisti/...`) to Google via next-sitemap.
const BASE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://epetrecere.md")
  .trim()
  .replace(/\/+$/, "");

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
    { url: `${BASE_URL}/despre`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/calculatoare`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/calculatoare/dar-nunta`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/nunti-reale`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
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

  return [
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
}
