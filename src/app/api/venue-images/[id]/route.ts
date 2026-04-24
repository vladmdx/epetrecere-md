// Per-venue-image ops: PUT for partial update (alt/cover/sortOrder),
// DELETE for hard delete. Mirrors the artist-images sibling.

import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { venueImages, venues, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const updateSchema = z.object({
  altRo: z.string().max(500).nullable().optional(),
  altRu: z.string().max(500).nullable().optional(),
  altEn: z.string().max(500).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  isCover: z.boolean().optional(),
});

async function loadOwnedImage(imageId: number) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }

  const [row] = await db
    .select({
      imageId: venueImages.id,
      venueId: venueImages.venueId,
      ownerId: venues.userId,
    })
    .from(venueImages)
    .leftJoin(venues, eq(venues.id, venueImages.venueId))
    .where(eq(venueImages.id, imageId))
    .limit(1);

  if (!row) {
    return { ok: false as const, status: 404, error: "Not found" };
  }

  const [appUser] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  const isAdmin = appUser.role === "admin" || appUser.role === "super_admin";
  if (!isAdmin && row.ownerId !== appUser.id) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return {
    ok: true as const,
    imageId: row.imageId,
    venueId: row.venueId,
  };
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const imageId = Number(id);
  if (!Number.isFinite(imageId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const owner = await loadOwnedImage(imageId);
  if (!owner.ok) {
    return NextResponse.json({ error: owner.error }, { status: owner.status });
  }

  // Cover invariant — only one image per venue can be the cover.
  if (parsed.data.isCover === true) {
    await db
      .update(venueImages)
      .set({ isCover: false })
      .where(eq(venueImages.venueId, owner.venueId));
  }

  await db
    .update(venueImages)
    .set(parsed.data)
    .where(eq(venueImages.id, imageId));

  const [updated] = await db
    .select()
    .from(venueImages)
    .where(eq(venueImages.id, imageId))
    .limit(1);

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const imageId = Number(id);
  if (!Number.isFinite(imageId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const owner = await loadOwnedImage(imageId);
  if (!owner.ok) {
    return NextResponse.json({ error: owner.error }, { status: owner.status });
  }

  await db.delete(venueImages).where(eq(venueImages.id, imageId));
  return NextResponse.json({ success: true });
}
