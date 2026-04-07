import { db } from "@/lib/db";
import { venues, venueImages, reviews } from "@/lib/db/schema";
import { eq, and, desc, asc, sql, gte, lte } from "drizzle-orm";

export interface VenueFilters {
  capacityMin?: number;
  capacityMax?: number;
  priceMax?: number;
  city?: string;
  featured?: boolean;
  sort?: "popular" | "price_asc" | "price_desc" | "rating" | "capacity";
  page?: number;
  limit?: number;
}

export async function getVenues(filters: VenueFilters = {}) {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 12;
  const offset = (page - 1) * limit;

  const conditions = [eq(venues.isActive, true)];

  if (filters.capacityMin) {
    conditions.push(gte(venues.capacityMax, filters.capacityMin));
  }
  if (filters.capacityMax) {
    conditions.push(lte(venues.capacityMin, filters.capacityMax));
  }
  if (filters.priceMax) {
    conditions.push(lte(venues.pricePerPerson, filters.priceMax));
  }
  if (filters.city) {
    conditions.push(eq(venues.city, filters.city));
  }
  if (filters.featured) {
    conditions.push(eq(venues.isFeatured, true));
  }

  let orderBy;
  switch (filters.sort) {
    case "price_asc":
      orderBy = asc(venues.pricePerPerson);
      break;
    case "price_desc":
      orderBy = desc(venues.pricePerPerson);
      break;
    case "rating":
      orderBy = desc(venues.ratingAvg);
      break;
    case "capacity":
      orderBy = desc(venues.capacityMax);
      break;
    default:
      orderBy = desc(venues.isFeatured);
  }

  const where = conditions.length > 1 ? and(...conditions) : conditions[0];

  const [items, countResult] = await Promise.all([
    db.select().from(venues).where(where).orderBy(orderBy).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(venues).where(where),
  ]);

  return {
    items,
    total: Number(countResult[0]?.count ?? 0),
    page,
    totalPages: Math.ceil(Number(countResult[0]?.count ?? 0) / limit),
  };
}

export async function getVenueBySlug(slug: string) {
  const results = await db
    .select()
    .from(venues)
    .where(eq(venues.slug, slug))
    .limit(1);

  const venue = results[0];
  if (!venue) return null;

  const [images, venueReviews] = await Promise.all([
    db
      .select()
      .from(venueImages)
      .where(eq(venueImages.venueId, venue.id))
      .orderBy(asc(venueImages.sortOrder)),
    db
      .select()
      .from(reviews)
      .where(and(eq(reviews.venueId, venue.id), eq(reviews.isApproved, true)))
      .orderBy(desc(reviews.createdAt))
      .limit(20),
  ]);

  return { ...venue, images, reviews: venueReviews };
}

export async function getFeaturedVenues(limit = 6) {
  return db
    .select()
    .from(venues)
    .where(and(eq(venues.isActive, true), eq(venues.isFeatured, true)))
    .limit(limit);
}
