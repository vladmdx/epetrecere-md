// Per-venue-image ops: PUT for partial update (alt/cover/sortOrder),
// DELETE for hard delete. Mirrors the artist-images sibling.

import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { venueImages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireVenueCapability } from "@/lib/venue-access";

const updateSchema = z.object({
  altRo: z.string().max(500).nullable().optional(),
  altRu: z.string().max(500).nullable().optional(),
  altEn: z.string().max(500).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  isCover: z.boolean().optional(),
});

// ADR 0028 — resolve the image, then authorize via its venue's membership
// chain (legacy venues.user_id fallback + global-admin bypass inside
// requireVenueAccess). A forged image id from another org is rejected.
async function loadOwnedImage(imageId: number) {
  const [row] = await db
    .select({
      imageId: venueImages.id,
      venueId: venueImages.venueId,
    })
    .from(venueImages)
    .where(eq(venueImages.id, imageId))
    .limit(1);

  if (!row) {
    return { ok: false as const, status: 404, error: "Not found" };
  }

  const access = await requireVenueCapability(row.venueId, "manage_profile");
  if (!access.ok) {
    return { ok: false as const, status: access.status, error: access.error };
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
