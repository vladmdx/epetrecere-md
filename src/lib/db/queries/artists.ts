import { db } from "@/lib/db";
import {
  artists,
  artistImages,
  artistVideos,
  artistPackages,
  reviews,
  calendarEvents,
  categories,
  eventPhotos,
} from "@/lib/db/schema";
import { eq, and, desc, asc, sql, ilike, gte, lte, arrayContains, notInArray, or } from "drizzle-orm";

export interface ArtistFilters {
  categoryId?: number;
  search?: string;
  priceMin?: number;
  priceMax?: number;
  ratingMin?: number;
  city?: string;
  /**
   * M2 — alternate spellings for the same city (e.g. "Chișinău", "Chisinau",
   * "Кишинёв") so SEO landing pages match artists regardless of how the
   * vendor typed their location.
   */
  cityKeywords?: string[];
  featured?: boolean;
  availableDate?: string; // "2026-08-15" — exclude booked/blocked artists
  sort?: "popular" | "price_asc" | "price_desc" | "rating" | "newest";
  page?: number;
  limit?: number;
}

export async function getArtists(filters: ArtistFilters = {}) {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 12;
  const offset = (page - 1) * limit;

  const conditions = [eq(artists.isActive, true)];

  if (filters.categoryId) {
    conditions.push(arrayContains(artists.categoryIds, [filters.categoryId]));
  }
  if (filters.search) {
    conditions.push(
      sql`(${artists.nameRo} ILIKE ${"%" + filters.search + "%"} OR ${artists.nameRu} ILIKE ${"%" + filters.search + "%"} OR ${artists.descriptionRo} ILIKE ${"%" + filters.search + "%"})`,
    );
  }
  if (filters.priceMin) {
    conditions.push(gte(artists.priceFrom, filters.priceMin));
  }
  if (filters.priceMax) {
    conditions.push(lte(artists.priceFrom, filters.priceMax));
  }
  if (filters.ratingMin) {
    conditions.push(gte(artists.ratingAvg, filters.ratingMin));
  }
  if (filters.availableDate) {
    // Exclude artists who are booked/blocked on this date
    conditions.push(
      sql`${artists.id} NOT IN (
        SELECT ${calendarEvents.entityId} FROM ${calendarEvents}
        WHERE ${calendarEvents.entityType} = 'artist'
        AND ${calendarEvents.date} = ${filters.availableDate}
        AND ${calendarEvents.status} IN ('booked', 'blocked')
      )`,
    );
  }
  if (filters.featured) {
    conditions.push(eq(artists.isFeatured, true));
  }
  // M2 — location filter (SEO auto-pages). Match the free-text location
  // column against any of the city's known spellings so "Chișinău" /
  // "Chisinau" / "Кишинёв" all count.
  const locationNeedles: string[] = [];
  if (filters.cityKeywords?.length) locationNeedles.push(...filters.cityKeywords);
  if (filters.city) locationNeedles.push(filters.city);
  if (locationNeedles.length) {
    const unique = Array.from(new Set(locationNeedles.map((s) => s.trim()).filter(Boolean)));
    const ilikeConds = unique.map((needle) => ilike(artists.location, `%${needle}%`));
    const combined = ilikeConds.length === 1 ? ilikeConds[0] : or(...ilikeConds);
    if (combined) conditions.push(combined);
  }

  let orderBy;
  switch (filters.sort) {
    case "price_asc":
      orderBy = asc(artists.priceFrom);
      break;
    case "price_desc":
      orderBy = desc(artists.priceFrom);
      break;
    case "rating":
      orderBy = desc(artists.ratingAvg);
      break;
    case "newest":
      orderBy = desc(artists.createdAt);
      break;
    default:
      orderBy = asc(artists.sortOrder);
  }

  const where = conditions.length > 1 ? and(...conditions) : conditions[0];

  const [items, countResult] = await Promise.all([
    db.select().from(artists).where(where).orderBy(orderBy, asc(artists.id)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(artists).where(where),
  ]);

  // Fetch cover images for all artists in one query
  const artistIds = items.map((a) => a.id);
  let coverImages: { artistId: number; url: string }[] = [];
  if (artistIds.length) {
    coverImages = await db
      .select({ artistId: artistImages.artistId, url: artistImages.url })
      .from(artistImages)
      .where(
        and(
          sql`${artistImages.artistId} IN (${sql.join(artistIds.map(id => sql`${id}`), sql`, `)})`,
          eq(artistImages.isCover, true),
        ),
      );
  }

  const coverMap = new Map(coverImages.map((c) => [c.artistId, c.url]));
  const itemsWithCovers = items.map((a) => ({
    ...a,
    coverImageUrl: a.photoUrl || coverMap.get(a.id) || null,
  }));

  return {
    items: itemsWithCovers,
    total: Number(countResult[0]?.count ?? 0),
    page,
    totalPages: Math.ceil(Number(countResult[0]?.count ?? 0) / limit),
  };
}

export async function getArtistBySlug(slug: string) {
  const results = await db
    .select()
    .from(artists)
    .where(eq(artists.slug, slug))
    .limit(1);

  const artist = results[0];
  if (!artist) return null;

  const [images, videos, packages, artistReviews] = await Promise.all([
    db
      .select()
      .from(artistImages)
      .where(eq(artistImages.artistId, artist.id))
      .orderBy(asc(artistImages.sortOrder)),
    db
      .select()
      .from(artistVideos)
      .where(eq(artistVideos.artistId, artist.id))
      .orderBy(asc(artistVideos.sortOrder)),
    db
      .select()
      .from(artistPackages)
      .where(
        and(
          eq(artistPackages.artistId, artist.id),
          eq(artistPackages.isVisible, true),
        ),
      ),
    db
      .select()
      .from(reviews)
      .where(and(eq(reviews.artistId, artist.id), eq(reviews.isApproved, true)))
      .orderBy(desc(reviews.createdAt))
      .limit(20),
  ]);

  return { ...artist, images, videos, packages, reviews: artistReviews };
}

export async function getFeaturedArtists(limit = 8) {
  const items = await db
    .select()
    .from(artists)
    .where(and(eq(artists.isActive, true), eq(artists.isFeatured, true)))
    .orderBy(asc(artists.sortOrder))
    .limit(limit);

  // Add cover images
  const ids = items.map((a) => a.id);
  let covers: { artistId: number; url: string }[] = [];
  if (ids.length) {
    covers = await db
      .select({ artistId: artistImages.artistId, url: artistImages.url })
      .from(artistImages)
      .where(and(
        sql`${artistImages.artistId} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`,
        eq(artistImages.isCover, true),
      ));
  }
  const coverMap = new Map(covers.map((c) => [c.artistId, c.url]));
  return items.map((a) => ({ ...a, coverImageUrl: a.photoUrl || coverMap.get(a.id) || null }));
}

/**
 * M5 — Public UGC feed: approved + public event photos clients have tagged
 * with this artist. Surfaces as a "Real events" gallery on the artist page.
 */
export async function getUgcPhotosForArtist(artistId: number, limit = 12) {
  const rows = await db
    .select({
      id: eventPhotos.id,
      url: eventPhotos.url,
      caption: eventPhotos.caption,
      createdAt: eventPhotos.createdAt,
    })
    .from(eventPhotos)
    .where(
      and(
        eq(eventPhotos.taggedArtistId, artistId),
        eq(eventPhotos.isApproved, true),
        eq(eventPhotos.isPublic, true),
      ),
    )
    .orderBy(desc(eventPhotos.createdAt))
    .limit(limit);
  return rows;
}

export async function getSimilarArtists(artistId: number, categoryIds: number[], limit = 4) {
  if (!categoryIds.length) return [];

  const items = await db
    .select()
    .from(artists)
    .where(
      and(
        eq(artists.isActive, true),
        sql`${artists.id} != ${artistId}`,
        sql`${artists.categoryIds} && ARRAY[${sql.join(categoryIds.map(id => sql`${id}`), sql`, `)}]::int[]`,
      ),
    )
    .orderBy(desc(artists.ratingAvg))
    .limit(limit);

  // Add cover images
  const ids = items.map((a) => a.id);
  let covers: { artistId: number; url: string }[] = [];
  if (ids.length) {
    covers = await db
      .select({ artistId: artistImages.artistId, url: artistImages.url })
      .from(artistImages)
      .where(and(
        sql`${artistImages.artistId} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`,
        eq(artistImages.isCover, true),
      ));
  }
  const coverMap = new Map(covers.map((c) => [c.artistId, c.url]));
  return items.map((a) => ({ ...a, coverImageUrl: a.photoUrl || coverMap.get(a.id) || null }));
}
