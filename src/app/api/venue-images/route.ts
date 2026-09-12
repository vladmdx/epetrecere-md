import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { venueImages, venueHalls } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { requireVenueCapability } from "@/lib/venue-access";

// Venue gallery images CRUD — mirrors /api/artist-images.
//
// GET is public (powers the venue detail page gallery).
// POST is owner-gated: only the venue owner or an admin can add images.

const createSchema = z.object({
  venueId: z.number().int().positive(),
  hallId: z.number().int().positive().optional().nullable(),
  url: z.string().url(),
  altRo: z.string().max(500).optional().nullable(),
  altRu: z.string().max(500).optional().nullable(),
  altEn: z.string().max(500).optional().nullable(),
  isCover: z.boolean().default(false),
});

// ADR 0028 — ownership resolved through the org→venue membership chain
// (with legacy venues.user_id fallback + global-admin bypass). Return shape is
// kept so the handlers below are unchanged.
async function requireVenueOwner(venueId: number) {
  const access = await requireVenueCapability(venueId, "manage_profile");
  if (!access.ok) {
    return { ok: false as const, status: access.status, error: access.error };
  }
  return { ok: true as const, userId: access.user.id };
}

// GET /api/venue-images?venue_id=N — public.
export async function GET(req: NextRequest) {
  const venueIdParam = req.nextUrl.searchParams.get("venue_id");
  if (!venueIdParam) {
    return NextResponse.json({ error: "venue_id required" }, { status: 400 });
  }
  const venueId = Number(venueIdParam);
  if (!Number.isFinite(venueId)) {
    return NextResponse.json({ error: "Invalid venue_id" }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(venueImages)
    .where(eq(venueImages.venueId, venueId))
    .orderBy(asc(venueImages.sortOrder), asc(venueImages.id));

  return NextResponse.json(rows);
}

// POST /api/venue-images — owner-only.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const owner = await requireVenueOwner(parsed.data.venueId);
  if (!owner.ok) {
    return NextResponse.json({ error: owner.error }, { status: owner.status });
  }

  if (parsed.data.hallId) {
    const [hall] = await db
      .select({ id: venueHalls.id, venueId: venueHalls.venueId })
      .from(venueHalls)
      .where(eq(venueHalls.id, parsed.data.hallId))
      .limit(1);
    if (!hall || hall.venueId !== parsed.data.venueId) {
      return NextResponse.json({ error: "Hall does not belong to this venue" }, { status: 403 });
    }
  }

  // Ensure only one cover image at a time.
  if (parsed.data.isCover) {
    await db
      .update(venueImages)
      .set({ isCover: false })
      .where(eq(venueImages.venueId, parsed.data.venueId));
  }

  const [created] = await db
    .insert(venueImages)
    .values({
      venueId: parsed.data.venueId,
      hallId: parsed.data.hallId ?? null,
      url: parsed.data.url,
      altRo: parsed.data.altRo ?? null,
      altRu: parsed.data.altRu ?? null,
      altEn: parsed.data.altEn ?? null,
      isCover: parsed.data.isCover,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}

// PUT /api/venue-images — bulk reorder. Body: { venueId, items: [{id, sortOrder}] }.
// Owner-only. Used by the drag-drop gallery manager to persist a new order.
const reorderSchema = z.object({
  venueId: z.number().int().positive(),
  items: z.array(
    z.object({
      id: z.number().int().positive(),
      sortOrder: z.number().int().min(0).max(10_000),
    }),
  ),
});

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const owner = await requireVenueOwner(parsed.data.venueId);
  if (!owner.ok) {
    return NextResponse.json({ error: owner.error }, { status: owner.status });
  }

  // Apply updates sequentially — small sets (< 50 rows), so a Promise.all is
  // fine and avoids a transaction dependency we don't otherwise need.
  await Promise.all(
    parsed.data.items.map((it) =>
      db
        .update(venueImages)
        .set({ sortOrder: it.sortOrder })
        .where(
          and(
            eq(venueImages.id, it.id),
            eq(venueImages.venueId, parsed.data.venueId),
          ),
        ),
    ),
  );

  return NextResponse.json({ success: true });
}

// DELETE /api/venue-images?id=N — owner-only.
export async function DELETE(req: NextRequest) {
  const idParam = req.nextUrl.searchParams.get("id");
  if (!idParam) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const imageId = Number(idParam);
  const [img] = await db
    .select({ id: venueImages.id, venueId: venueImages.venueId })
    .from(venueImages)
    .where(eq(venueImages.id, imageId))
    .limit(1);

  if (!img) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const owner = await requireVenueOwner(img.venueId);
  if (!owner.ok) {
    return NextResponse.json({ error: owner.error }, { status: owner.status });
  }

  await db.delete(venueImages).where(eq(venueImages.id, imageId));
  return NextResponse.json({ success: true });
}
