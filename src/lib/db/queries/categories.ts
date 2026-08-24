import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

export async function getAllCategories() {
  return db
    .select()
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(asc(categories.sortOrder));
}

/**
 * The columns a category *picker* needs. getAllCategories() is a SELECT *,
 * and the categories table carries the SEO body copy — ~42 KB of prose
 * across the 29 rows — so the wizard's picker was downloading roughly
 * 60-70 KB of JSON to render seven fields.
 */
export async function getCategoriesForPicker() {
  return db
    .select({
      id: categories.id,
      slug: categories.slug,
      nameRo: categories.nameRo,
      nameRu: categories.nameRu,
      nameEn: categories.nameEn,
      type: categories.type,
      icon: categories.icon,
      sortOrder: categories.sortOrder,
    })
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(asc(categories.sortOrder));
}

export async function getCategoryBySlug(slug: string) {
  const results = await db
    .select()
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1);
  return results[0] ?? null;
}
