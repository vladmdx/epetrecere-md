import { db } from "@/lib/db";
import { venues, venueImages, reviews, calendarEvents } from "@/lib/db/schema";
import { eq, and, desc, asc, sql, gte, lte, ilike, or } from "drizzle-orm";

export interface VenueFilters {
  capacityMin?: number;
  capacityMax?: number;
  priceMax?: number;
  city?: string;
  /** M2 — alternate spellings for SEO landing pages, matched case-insensitively. */
  cityKeywords?: string[];
  featured?: boolean;
  /** Exclude venues that are booked/blocked on this date. Format: YYYY-MM-DD */
  availableDate?: string;
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
  // City filter: use ILIKE OR over a list of keywords so vendors' free-form
  // city entries ("Chișinău", "mun. Chisinau", "Кишинёв") all match.
  const cityNeedles: string[] = [];
  if (filters.cityKeywords?.length) cityNeedles.push(...filters.cityKeywords);
  if (filters.city) cityNeedles.push(filters.city);
  if (cityNeedles.length) {
    const unique = Array.from(new Set(cityNeedles.map((s) => s.trim()).filter(Boolean)));
    const ilikeConds = unique.map((needle) => ilike(venues.city, `%${needle}%`));
    const combined = ilikeConds.length === 1 ? ilikeConds[0] : or(...ilikeConds);
    if (combined) conditions.push(combined);
  }
  if (filters.featured) {
    conditions.push(eq(venues.isFeatured, true));
  }
  if (filters.availableDate) {
    // Exclude venues booked or blocked on this date. Uses the shared
    // calendar_events table where entity_type='venue'.
    conditions.push(
      sql`${venues.id} NOT IN (
        SELECT ${calendarEvents.entityId} FROM ${calendarEvents}
        WHERE ${calendarEvents.entityType} = 'venue'
        AND ${calendarEvents.date} = ${filters.availableDate}
        AND ${calendarEvents.status} IN ('booked', 'blocked')
      )`,
    );
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
