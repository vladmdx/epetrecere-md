import { db } from "@/lib/db";
import {
  artists,
  artistImages,
  artistVideos,
  artistPackages,
  reviews,
  calendarEvents,
  categories,
} from "@/lib/db/schema";
import { eq, and, desc, asc, sql, ilike, gte, lte, arrayContains, notInArray } from "drizzle-orm";

export interface ArtistFilters {
  categoryId?: number;
  search?: string;
  priceMin?: number;
  priceMax?: number;
  ratingMin?: number;
  city?: string;
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
    db.select().from(artists).where(where).orderBy(orderBy).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(artists).where(where),
  ]);

  return {
    items,
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
  return db
    .select()
    .from(artists)
    .where(and(eq(artists.isActive, true), eq(artists.isFeatured, true)))
    .orderBy(asc(artists.sortOrder))
    .limit(limit);
}

export async function getSimilarArtists(artistId: number, categoryIds: number[], limit = 4) {
  if (!categoryIds.length) return [];

  return db
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
}
