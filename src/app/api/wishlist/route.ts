// Wishlist API — authenticated users save/remove artist or venue from
// their personal list. Primary key (userId, entityType, entityId) means
// POST is idempotent (second add = no-op, returns 200 either way).
//
// GET    /api/wishlist                 → full list enriched with entity name + slug
// POST   /api/wishlist  { entityType, entityId }  → add
// DELETE /api/wishlist?entityType=artist&entityId=5 → remove

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  users,
  artists,
  venues,
  wishlistItems,
} from "@/lib/db/schema";

async function resolveUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  return u ?? null;
}

// ─── GET ──────────────────────────────────────────────────
export async function GET() {
  const user = await resolveUser();
  if (!user) return NextResponse.json({ items: [] });

  const rows = await db
    .select({
      entityType: wishlistItems.entityType,
      entityId: wishlistItems.entityId,
      createdAt: wishlistItems.createdAt,
    })
    .from(wishlistItems)
    .where(eq(wishlistItems.userId, user.id))
    .orderBy(desc(wishlistItems.createdAt));

  // Enrich with name + slug via batched queries (avoid N+1)
  const artistIds = rows
    .filter((r) => r.entityType === "artist")
    .map((r) => r.entityId);
  const venueIds = rows
    .filter((r) => r.entityType === "venue")
    .map((r) => r.entityId);

  const [artistRows, venueRows] = await Promise.all([
    artistIds.length
      ? db
          .select({
            id: artists.id,
            nameRo: artists.nameRo,
            slug: artists.slug,
            coverImageUrl: artists.photoUrl,
            priceFrom: artists.priceFrom,
            city: artists.location,
          })
          .from(artists)
          .where(inArray(artists.id, artistIds))
      : Promise.resolve([]),
    venueIds.length
      ? db
          .select({
            id: venues.id,
            nameRo: venues.nameRo,
            slug: venues.slug,
            city: venues.city,
            pricePerPerson: venues.pricePerPerson,
          })
          .from(venues)
          .where(inArray(venues.id, venueIds))
      : Promise.resolve([]),
  ]);

  const artistMap = new Map(artistRows.map((a) => [a.id, a]));
  const venueMap = new Map(venueRows.map((v) => [v.id, v]));

  const items = rows
    .map((r) => {
      if (r.entityType === "artist") {
        const a = artistMap.get(r.entityId);
        if (!a) return null;
        return {
          entityType: "artist" as const,
          entityId: r.entityId,
          name: a.nameRo,
          slug: a.slug,
          coverImageUrl: a.coverImageUrl,
          priceFrom: a.priceFrom,
          city: a.city,
          addedAt: r.createdAt,
        };
      }
      const v = venueMap.get(r.entityId);
      if (!v) return null;
      return {
        entityType: "venue" as const,
        entityId: r.entityId,
        name: v.nameRo,
        slug: v.slug,
        coverImageUrl: null,
        priceFrom: v.pricePerPerson,
        city: v.city,
        addedAt: r.createdAt,
      };
    })
    .filter(Boolean);

  return NextResponse.json({ items });
}

// ─── POST ─────────────────────────────────────────────────
const addSchema = z.object({
  entityType: z.enum(["artist", "venue"]),
  entityId: z.number().int().positive(),
});

export async function POST(req: NextRequest) {
  const user = await resolveUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  // Verify entity exists (prevents building a wishlist of orphan IDs)
  if (parsed.data.entityType === "artist") {
    const [a] = await db
      .select({ id: artists.id })
      .from(artists)
      .where(eq(artists.id, parsed.data.entityId))
      .limit(1);
    if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 });
  } else {
    const [v] = await db
      .select({ id: venues.id })
      .from(venues)
      .where(eq(venues.id, parsed.data.entityId))
      .limit(1);
    if (!v) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // onConflictDoNothing: composite PK already exists → idempotent add
  await db
    .insert(wishlistItems)
    .values({
      userId: user.id,
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
    })
    .onConflictDoNothing();

  return NextResponse.json({ success: true });
}

// ─── DELETE ───────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const user = await resolveUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entityType = req.nextUrl.searchParams.get("entityType");
  const entityId = Number(req.nextUrl.searchParams.get("entityId"));
  if (
    (entityType !== "artist" && entityType !== "venue") ||
    !Number.isFinite(entityId)
  ) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  await db
    .delete(wishlistItems)
    .where(
      and(
        eq(wishlistItems.userId, user.id),
        eq(wishlistItems.entityType, entityType),
        eq(wishlistItems.entityId, entityId),
      ),
    );

  return NextResponse.json({ success: true });
}
