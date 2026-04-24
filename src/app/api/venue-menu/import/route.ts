// Bulk-commit a reviewed menu (from the AI scanner OR a typed-up payload)
// into venue_menu_categories / venue_menu_items / venue_menu_packages.
//
// The client receives the scan result from /api/venue-menu/scan, lets the
// owner edit it inline, then POSTs the final payload here. Rows are
// appended (not replaced) — existing items aren't touched. Sort order is
// computed relative to the current max per parent.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  users,
  venues,
  venueMenuCategories,
  venueMenuItems,
  venueMenuPackages,
} from "@/lib/db/schema";

const itemSchema = z.object({
  nameRo: z.string().min(1).max(200),
  descriptionRo: z.string().max(500).nullable().optional(),
  priceMdl: z.number().int().nonnegative().nullable().optional(),
  priceEur: z.number().int().nonnegative().nullable().optional(),
});

const categorySchema = z.object({
  nameRo: z.string().min(1).max(100),
  icon: z
    .enum(["salad", "beef", "cake", "wine", "coffee", "utensils"])
    .nullable()
    .optional(),
  items: z.array(itemSchema).default([]),
});

const packageSchema = z.object({
  nameRo: z.string().min(1).max(100),
  pricePerPerson: z.number().int().nonnegative(),
  includes: z.string().max(2000).nullable().optional(),
  excludes: z.string().max(2000).nullable().optional(),
  minGuests: z.number().int().positive().nullable().optional(),
});

const importSchema = z.object({
  venueId: z.number().int().positive(),
  /** If true, wipe the venue's existing menu first. Default: append. */
  replaceExisting: z.boolean().default(false),
  categories: z.array(categorySchema).default([]),
  packages: z.array(packageSchema).default([]),
});

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  // Ownership
  const [appUser] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isAdmin = appUser.role === "admin" || appUser.role === "super_admin";
  if (!isAdmin) {
    const [venue] = await db
      .select({ userId: venues.userId })
      .from(venues)
      .where(eq(venues.id, parsed.data.venueId))
      .limit(1);
    if (!venue || venue.userId !== appUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { venueId, replaceExisting } = parsed.data;

  // Optional wipe. Cascade from categories deletes items automatically.
  if (replaceExisting) {
    await db
      .delete(venueMenuCategories)
      .where(eq(venueMenuCategories.venueId, venueId));
    await db
      .delete(venueMenuPackages)
      .where(eq(venueMenuPackages.venueId, venueId));
  }

  // Starting sort_order for categories & packages — we append so inserts
  // slot in after whatever the owner already has.
  const [lastCat] = await db
    .select({ sortOrder: venueMenuCategories.sortOrder })
    .from(venueMenuCategories)
    .where(eq(venueMenuCategories.venueId, venueId))
    .orderBy(desc(venueMenuCategories.sortOrder))
    .limit(1);
  let catSort = (lastCat?.sortOrder ?? 0) + 1;

  const [lastPkg] = await db
    .select({ sortOrder: venueMenuPackages.sortOrder })
    .from(venueMenuPackages)
    .where(eq(venueMenuPackages.venueId, venueId))
    .orderBy(desc(venueMenuPackages.sortOrder))
    .limit(1);
  let pkgSort = (lastPkg?.sortOrder ?? 0) + 1;

  const createdCategories: Array<{
    id: number;
    nameRo: string;
    itemCount: number;
  }> = [];
  const createdPackages: Array<{ id: number; nameRo: string }> = [];

  // Insert categories + their items sequentially. Small volumes (< 10 cats,
  // < 50 items per cat) so a transaction isn't strictly necessary, but we
  // want the insert to abort cleanly on error rather than leave partial data.
  for (const cat of parsed.data.categories) {
    const [catRow] = await db
      .insert(venueMenuCategories)
      .values({
        venueId,
        nameRo: cat.nameRo,
        icon: cat.icon ?? null,
        sortOrder: catSort++,
      })
      .returning();
    if (!catRow) continue;

    if (cat.items.length > 0) {
      await db.insert(venueMenuItems).values(
        cat.items.map((it, idx) => ({
          categoryId: catRow.id,
          nameRo: it.nameRo,
          descriptionRo: it.descriptionRo ?? null,
          priceMdl: it.priceMdl ?? null,
          priceEur: it.priceEur ?? null,
          sortOrder: idx,
        })),
      );
    }

    createdCategories.push({
      id: catRow.id,
      nameRo: catRow.nameRo,
      itemCount: cat.items.length,
    });
  }

  for (const pkg of parsed.data.packages) {
    const [pkgRow] = await db
      .insert(venueMenuPackages)
      .values({
        venueId,
        nameRo: pkg.nameRo,
        pricePerPerson: pkg.pricePerPerson,
        includes: pkg.includes ?? null,
        excludes: pkg.excludes ?? null,
        minGuests: pkg.minGuests ?? null,
        sortOrder: pkgSort++,
      })
      .returning();
    if (pkgRow) {
      createdPackages.push({ id: pkgRow.id, nameRo: pkgRow.nameRo });
    }
  }

  return NextResponse.json({
    success: true,
    categories: createdCategories,
    packages: createdPackages,
  });
}
