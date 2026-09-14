import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  venueHallMenuSets,
  venueMenuCategories,
  venueMenuItems,
  venueMenuPackages,
  venueMenuSets,
} from "@/lib/db/schema";

/**
 * Resolve the public menu inherited by one Hall.
 *
 * An explicit Hall assignment wins. With no assignment, the venue default
 * menu set is used. Venues predating menu sets retain their NULL-scoped menu.
 * The caller is responsible for proving that the venue/Hall is public or that
 * the current actor has private access.
 */
export async function getVenueMenuForHall(
  venueId: number,
  hallId: number | null,
) {
  const explicitLinks = hallId == null ? [] : await db
    .select({ menuSetId: venueHallMenuSets.menuSetId })
    .from(venueHallMenuSets)
    .where(and(
      eq(venueHallMenuSets.venueId, venueId),
      eq(venueHallMenuSets.hallId, hallId),
    ));

  const inheritedDefault = explicitLinks.length ? [] : await db
    .select({ id: venueMenuSets.id })
    .from(venueMenuSets)
    .where(and(
      eq(venueMenuSets.venueId, venueId),
      eq(venueMenuSets.isDefault, true),
    ))
    .limit(1);
  const menuSetIds = explicitLinks.length
    ? explicitLinks.map((row) => row.menuSetId)
    : inheritedDefault.map((row) => row.id);
  const categoryScope = menuSetIds.length
    ? inArray(venueMenuCategories.menuSetId, menuSetIds)
    : isNull(venueMenuCategories.menuSetId);
  const packageScope = menuSetIds.length
    ? inArray(venueMenuPackages.menuSetId, menuSetIds)
    : isNull(venueMenuPackages.menuSetId);

  const [categories, packages] = await Promise.all([
    db
      .select({
        id: venueMenuCategories.id,
        nameRo: venueMenuCategories.nameRo,
        nameRu: venueMenuCategories.nameRu,
        nameEn: venueMenuCategories.nameEn,
        icon: venueMenuCategories.icon,
        sortOrder: venueMenuCategories.sortOrder,
      })
      .from(venueMenuCategories)
      .where(and(eq(venueMenuCategories.venueId, venueId), categoryScope))
      .orderBy(asc(venueMenuCategories.sortOrder), asc(venueMenuCategories.id)),
    db
      .select({
        id: venueMenuPackages.id,
        nameRo: venueMenuPackages.nameRo,
        nameRu: venueMenuPackages.nameRu,
        nameEn: venueMenuPackages.nameEn,
        pricePerPerson: venueMenuPackages.pricePerPerson,
        currency: venueMenuPackages.currency,
        includes: venueMenuPackages.includes,
        excludes: venueMenuPackages.excludes,
        minGuests: venueMenuPackages.minGuests,
        isRecommended: venueMenuPackages.isRecommended,
        sortOrder: venueMenuPackages.sortOrder,
      })
      .from(venueMenuPackages)
      .where(and(eq(venueMenuPackages.venueId, venueId), packageScope))
      .orderBy(asc(venueMenuPackages.sortOrder), asc(venueMenuPackages.id)),
  ]);

  const categoryIds = categories.map((category) => category.id);
  const items = categoryIds.length ? await db
    .select({
      id: venueMenuItems.id,
      categoryId: venueMenuItems.categoryId,
      nameRo: venueMenuItems.nameRo,
      nameRu: venueMenuItems.nameRu,
      nameEn: venueMenuItems.nameEn,
      descriptionRo: venueMenuItems.descriptionRo,
      priceMdl: venueMenuItems.priceMdl,
      priceEur: venueMenuItems.priceEur,
      sortOrder: venueMenuItems.sortOrder,
    })
    .from(venueMenuItems)
    .where(inArray(venueMenuItems.categoryId, categoryIds))
    .orderBy(asc(venueMenuItems.sortOrder), asc(venueMenuItems.id)) : [];

  return { categories, items, packages };
}
