import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { artists, categories } from "@/lib/db/schema";
import { plainText } from "@/lib/content/plain-text";
import { redactContact } from "@/lib/privacy/contact-redaction";

const label = (value: string | null) => value ? redactContact(plainText(value)) : null;

/** Minimal identity context, resolved from the authenticated account, never a model-supplied ID. */
export async function getOwnArtistProfileContext(userId: string) {
  const [artist] = await db.select({
    id: artists.id,
    nameRo: artists.nameRo, nameRu: artists.nameRu, nameEn: artists.nameEn,
    baseCity: artists.baseCity, location: artists.location, categoryIds: artists.categoryIds,
  }).from(artists).where(eq(artists.userId, userId)).limit(1);
  if (!artist) return null;

  const categoryIds = [...new Set(artist.categoryIds ?? [])];
  const ownCategories = categoryIds.length ? await db.select({
    id: categories.id, nameRo: categories.nameRo, nameRu: categories.nameRu, nameEn: categories.nameEn,
  }).from(categories).where(inArray(categories.id, categoryIds)) : [];

  return {
    id: artist.id,
    nameRo: label(artist.nameRo), nameRu: label(artist.nameRu), nameEn: label(artist.nameEn),
    baseCity: label(artist.baseCity || artist.location),
    categories: ownCategories.map(category => ({
      id: category.id,
      nameRo: label(category.nameRo), nameRu: label(category.nameRu), nameEn: label(category.nameEn),
    })),
  };
}
