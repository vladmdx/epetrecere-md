import { Meilisearch } from "meilisearch";

let client: Meilisearch | null = null;

export function getMeiliClient(): Meilisearch | null {
  if (!process.env.MEILISEARCH_HOST) return null;
  if (!client) {
    client = new Meilisearch({
      host: process.env.MEILISEARCH_HOST,
      apiKey: process.env.MEILISEARCH_API_KEY,
    });
  }
  return client;
}

export interface SearchableArtist {
  id: number;
  slug: string;
  name_ro: string;
  name_ru: string | null;
  name_en: string | null;
  description_ro: string | null;
  categories: string[];
  location: string | null;
  price_from: number | null;
  rating_avg: number | null;
  is_featured: boolean;
  is_verified: boolean;
  type: "artist";
}

export interface SearchableVenue {
  id: number;
  slug: string;
  name_ro: string;
  name_ru: string | null;
  name_en: string | null;
  description_ro: string | null;
  city: string | null;
  capacity_max: number | null;
  price_per_person: number | null;
  rating_avg: number | null;
  type: "venue";
}

const ARTISTS_INDEX = "artists";
const VENUES_INDEX = "venues";

export async function syncArtistToSearch(artist: SearchableArtist) {
  const client = getMeiliClient();
  if (!client) return;

  const index = client.index(ARTISTS_INDEX);
  await index.addDocuments([artist], { primaryKey: "id" });
}

export async function syncVenueToSearch(venue: SearchableVenue) {
  const client = getMeiliClient();
  if (!client) return;

  const index = client.index(VENUES_INDEX);
  await index.addDocuments([venue], { primaryKey: "id" });
}

export async function removeFromSearch(indexName: string, id: number) {
  const client = getMeiliClient();
  if (!client) return;

  await client.index(indexName).deleteDocument(id);
}

export async function setupSearchIndexes() {
  const client = getMeiliClient();
  if (!client) return;

  // Artists index
  const artistsIndex = client.index(ARTISTS_INDEX);
  await artistsIndex.updateSettings({
    searchableAttributes: ["name_ro", "name_ru", "name_en", "description_ro", "categories", "location"],
    filterableAttributes: ["categories", "location", "price_from", "rating_avg", "is_featured", "is_verified", "type"],
    sortableAttributes: ["price_from", "rating_avg", "name_ro"],
    displayedAttributes: ["id", "slug", "name_ro", "name_ru", "name_en", "location", "price_from", "rating_avg", "is_featured", "is_verified", "type"],
  });

  // Venues index
  const venuesIndex = client.index(VENUES_INDEX);
  await venuesIndex.updateSettings({
    searchableAttributes: ["name_ro", "name_ru", "name_en", "description_ro", "city"],
    filterableAttributes: ["city", "capacity_max", "price_per_person", "rating_avg", "type"],
    sortableAttributes: ["price_per_person", "rating_avg", "capacity_max"],
    displayedAttributes: ["id", "slug", "name_ro", "name_ru", "name_en", "city", "capacity_max", "price_per_person", "rating_avg", "type"],
  });
}

export async function searchAll(query: string, limit = 5) {
  const client = getMeiliClient();
  if (!client) return { artists: [], venues: [] };

  const [artistResults, venueResults] = await Promise.all([
    client.index(ARTISTS_INDEX).search(query, { limit }),
    client.index(VENUES_INDEX).search(query, { limit }),
  ]);

  return {
    artists: artistResults.hits as SearchableArtist[],
    venues: venueResults.hits as SearchableVenue[],
  };
}
