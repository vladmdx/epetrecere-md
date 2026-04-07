import { db } from "@/lib/db";
import { artists, venues } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getMeiliClient } from "./meilisearch";

/** Sync a single artist to Meilisearch index */
export async function syncArtistToIndex(artistId: number) {
  const client = getMeiliClient();
  if (!client) return;

  const [artist] = await db
    .select()
    .from(artists)
    .where(eq(artists.id, artistId))
    .limit(1);

  if (!artist || !artist.isActive) {
    // Remove from index if inactive
    try { await client.index("artists").deleteDocument(artistId); } catch {}
    return;
  }

  await client.index("artists").addDocuments([{
    id: artist.id,
    slug: artist.slug,
    name_ro: artist.nameRo,
    name_ru: artist.nameRu,
    name_en: artist.nameEn,
    description_ro: artist.descriptionRo,
    location: artist.location,
    price_from: artist.priceFrom,
    rating_avg: artist.ratingAvg,
    is_featured: artist.isFeatured,
    is_verified: artist.isVerified,
    type: "artist",
  }], { primaryKey: "id" });
}

/** Sync a single venue to Meilisearch index */
export async function syncVenueToIndex(venueId: number) {
  const client = getMeiliClient();
  if (!client) return;

  const [venue] = await db
    .select()
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);

  if (!venue || !venue.isActive) {
    try { await client.index("venues").deleteDocument(venueId); } catch {}
    return;
  }

  await client.index("venues").addDocuments([{
    id: venue.id,
    slug: venue.slug,
    name_ro: venue.nameRo,
    name_ru: venue.nameRu,
    name_en: venue.nameEn,
    description_ro: venue.descriptionRo,
    city: venue.city,
    capacity_max: venue.capacityMax,
    price_per_person: venue.pricePerPerson,
    rating_avg: venue.ratingAvg,
    type: "venue",
  }], { primaryKey: "id" });
}

/** Full reindex all active artists and venues */
export async function fullReindex() {
  const client = getMeiliClient();
  if (!client) return { artists: 0, venues: 0 };

  const allArtists = await db
    .select()
    .from(artists)
    .where(eq(artists.isActive, true));

  const allVenues = await db
    .select()
    .from(venues)
    .where(eq(venues.isActive, true));

  if (allArtists.length) {
    await client.index("artists").addDocuments(
      allArtists.map((a) => ({
        id: a.id,
        slug: a.slug,
        name_ro: a.nameRo,
        name_ru: a.nameRu,
        name_en: a.nameEn,
        description_ro: a.descriptionRo,
        location: a.location,
        price_from: a.priceFrom,
        rating_avg: a.ratingAvg,
        is_featured: a.isFeatured,
        is_verified: a.isVerified,
        type: "artist" as const,
      })),
      { primaryKey: "id" },
    );
  }

  if (allVenues.length) {
    await client.index("venues").addDocuments(
      allVenues.map((v) => ({
        id: v.id,
        slug: v.slug,
        name_ro: v.nameRo,
        name_ru: v.nameRu,
        name_en: v.nameEn,
        description_ro: v.descriptionRo,
        city: v.city,
        capacity_max: v.capacityMax,
        price_per_person: v.pricePerPerson,
        rating_avg: v.ratingAvg,
        type: "venue" as const,
      })),
      { primaryKey: "id" },
    );
  }

  return { artists: allArtists.length, venues: allVenues.length };
}
