// Venue digital menu — combined API for categories, items, and packages.
//
// GET ?venue_id=N  — public read (anyone can see the full menu)
// POST             — owner-gated writes via action field

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  venues,
  users,
  venueMenuCategories,
  venueMenuItems,
  venueMenuPackages,
} from "@/lib/db/schema";

async function requireVenueOwner(venueId: number) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return { ok: false as const, status: 401 };
  const [appUser] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) return { ok: false as const, status: 401 };
  const isAdmin = appUser.role === "admin" || appUser.role === "super_admin";
  if (isAdmin) return { ok: true as const };
  const [venue] = await db
    .select({ userId: venues.userId })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  if (!venue || venue.userId !== appUser.id) {
    return { ok: false as const, status: 403 };
  }
  return { ok: true as const };
}

export async function GET(req: NextRequest) {
  const venueId = Number(req.nextUrl.searchParams.get("venue_id"));
  if (!Number.isFinite(venueId) || venueId < 1) {
    return NextResponse.json({ error: "venue_id required" }, { status: 400 });
  }

  const [categories, packages] = await Promise.all([
    db
      .select()
      .from(venueMenuCategories)
      .where(eq(venueMenuCategories.venueId, venueId))
      .orderBy(asc(venueMenuCategories.sortOrder), asc(venueMenuCategories.id)),
    db
      .select()
      .from(venueMenuPackages)
      .where(eq(venueMenuPackages.venueId, venueId))
      .orderBy(asc(venueMenuPackages.sortOrder), asc(venueMenuPackages.id)),
  ]);

  const catIds = categories.map((c) => c.id);
  const items =
    catIds.length > 0
      ? await db
          .select()
          .from(venueMenuItems)
          .where(inArray(venueMenuItems.categoryId, catIds))
          .orderBy(asc(venueMenuItems.sortOrder), asc(venueMenuItems.id))
      : [];

  return NextResponse.json({ categories, items, packages });
}

// Action-based POST
const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_category"),
    venueId: z.number(),
    nameRo: z.string().min(1),
    icon: z.string().optional(),
  }),
  z.object({
    action: z.literal("update_category"),
    venueId: z.number(),
    id: z.number(),
    nameRo: z.string().optional(),
    icon: z.string().nullable().optional(),
    sortOrder: z.number().int().optional(),
  }),
  z.object({
    action: z.literal("delete_category"),
    venueId: z.number(),
    id: z.number(),
  }),
  z.object({
    action: z.literal("create_item"),
    venueId: z.number(),
    categoryId: z.number(),
    nameRo: z.string().min(1),
    descriptionRo: z.string().optional(),
    priceMdl: z.number().int().nullable().optional(),
    priceEur: z.number().int().nullable().optional(),
  }),
  z.object({
    action: z.literal("update_item"),
    venueId: z.number(),
    id: z.number(),
    nameRo: z.string().optional(),
    descriptionRo: z.string().nullable().optional(),
    priceMdl: z.number().int().nullable().optional(),
    priceEur: z.number().int().nullable().optional(),
    sortOrder: z.number().int().optional(),
  }),
  z.object({
    action: z.literal("delete_item"),
    venueId: z.number(),
    id: z.number(),
  }),
  z.object({
    action: z.literal("create_package"),
    venueId: z.number(),
    nameRo: z.string().min(1),
    pricePerPerson: z.number().int().nonnegative(),
    includes: z.string().optional(),
    excludes: z.string().optional(),
    minGuests: z.number().int().positive().nullable().optional(),
  }),
  z.object({
    action: z.literal("update_package"),
    venueId: z.number(),
    id: z.number(),
    nameRo: z.string().optional(),
    pricePerPerson: z.number().int().nonnegative().optional(),
    includes: z.string().nullable().optional(),
    excludes: z.string().nullable().optional(),
    minGuests: z.number().int().positive().nullable().optional(),
    isRecommended: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  }),
  z.object({
    action: z.literal("delete_package"),
    venueId: z.number(),
    id: z.number(),
  }),
]);

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const owner = await requireVenueOwner(parsed.data.venueId);
  if (!owner.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: owner.status });
  }

  const data = parsed.data;

  switch (data.action) {
    case "create_category": {
      const [row] = await db
        .insert(venueMenuCategories)
        .values({
          venueId: data.venueId,
          nameRo: data.nameRo,
          icon: data.icon ?? null,
        })
        .returning();
      return NextResponse.json({ category: row });
    }
    case "update_category": {
      const { id, venueId, action: _a, ...updates } = data;
      const [row] = await db
        .update(venueMenuCategories)
        .set(updates)
        .where(
          and(
            eq(venueMenuCategories.id, id),
            eq(venueMenuCategories.venueId, venueId),
          ),
        )
        .returning();
      return NextResponse.json({ category: row });
    }
    case "delete_category": {
      await db
        .delete(venueMenuCategories)
        .where(
          and(
            eq(venueMenuCategories.id, data.id),
            eq(venueMenuCategories.venueId, data.venueId),
          ),
        );
      return NextResponse.json({ ok: true });
    }
    case "create_item": {
      // Verify category belongs to this venue
      const [cat] = await db
        .select({ id: venueMenuCategories.id })
        .from(venueMenuCategories)
        .where(
          and(
            eq(venueMenuCategories.id, data.categoryId),
            eq(venueMenuCategories.venueId, data.venueId),
          ),
        )
        .limit(1);
      if (!cat) return NextResponse.json({ error: "Invalid category" }, { status: 400 });
      const [row] = await db
        .insert(venueMenuItems)
        .values({
          categoryId: data.categoryId,
          nameRo: data.nameRo,
          descriptionRo: data.descriptionRo ?? null,
          priceMdl: data.priceMdl ?? null,
          priceEur: data.priceEur ?? null,
        })
        .returning();
      return NextResponse.json({ item: row });
    }
    case "update_item": {
      const { id, venueId: _v, action: _a, ...updates } = data;
      const [row] = await db
        .update(venueMenuItems)
        .set(updates)
        .where(eq(venueMenuItems.id, id))
        .returning();
      return NextResponse.json({ item: row });
    }
    case "delete_item": {
      await db.delete(venueMenuItems).where(eq(venueMenuItems.id, data.id));
      return NextResponse.json({ ok: true });
    }
    case "create_package": {
      const [row] = await db
        .insert(venueMenuPackages)
        .values({
          venueId: data.venueId,
          nameRo: data.nameRo,
          pricePerPerson: data.pricePerPerson,
          includes: data.includes ?? null,
          excludes: data.excludes ?? null,
          minGuests: data.minGuests ?? null,
        })
        .returning();
      return NextResponse.json({ package: row });
    }
    case "update_package": {
      const { id, venueId, action: _a, ...updates } = data;
      // If marking a package as recommended, unflag others first
      if (updates.isRecommended === true) {
        await db
          .update(venueMenuPackages)
          .set({ isRecommended: false })
          .where(eq(venueMenuPackages.venueId, venueId));
      }
      const [row] = await db
        .update(venueMenuPackages)
        .set(updates)
        .where(
          and(
            eq(venueMenuPackages.id, id),
            eq(venueMenuPackages.venueId, venueId),
          ),
        )
        .returning();
      return NextResponse.json({ package: row });
    }
    case "delete_package": {
      await db
        .delete(venueMenuPackages)
        .where(
          and(
            eq(venueMenuPackages.id, data.id),
            eq(venueMenuPackages.venueId, data.venueId),
          ),
        );
      return NextResponse.json({ ok: true });
    }
  }
}
