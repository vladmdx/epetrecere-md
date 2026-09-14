import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { venueImages, venues } from "@/lib/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import {
  authorizeVenueCapability,
  getCurrentAppUser,
} from "@/lib/venue-access";
import {
  createVenueImage,
  deleteVenueImage,
  reorderVenueImages,
  type VenueImageWriteFailure,
} from "@/lib/partner/venue-image-writes";

// Venue gallery images CRUD — mirrors /api/artist-images.
//
// GET is public (powers the venue detail page gallery).
// POST is owner-gated: only the venue owner or an admin can add images.

const createSchema = z.object({
  venueId: z.number().int().positive(),
  // Hall galleries are submitted only through Hall POST/PATCH so active Hall
  // edits enter moderation. Keep `null` for old general-gallery clients, but
  // reject every concrete Hall id here.
  hallId: z.null().optional(),
  url: z.string().url(),
  altRo: z.string().max(500).optional().nullable(),
  altRu: z.string().max(500).optional().nullable(),
  altEn: z.string().max(500).optional().nullable(),
  isCover: z.boolean().default(false),
});

function writeFailureResponse(result: VenueImageWriteFailure) {
  return NextResponse.json(
    { error: result.error, code: result.code },
    { status: result.status },
  );
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

  const [venue] = await db
    .select({ isActive: venues.isActive })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  if (!venue) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!venue.isActive) {
    const actor = await getCurrentAppUser();
    if (!actor) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const access = await authorizeVenueCapability(actor, venueId, "view_private");
    if (!access.ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  const rows = await db
    .select()
    .from(venueImages)
    // This collection powers the venue-level gallery. Hall photos have their
    // own hall endpoint and must never leak into the general gallery manager.
    .where(and(eq(venueImages.venueId, venueId), isNull(venueImages.hallId)))
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

  const actor = await getCurrentAppUser();
  if (!actor) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  const result = await createVenueImage(actor.id, parsed.data);
  if (!result.ok) return writeFailureResponse(result);
  return NextResponse.json(result.image, { status: 201 });
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

  const actor = await getCurrentAppUser();
  if (!actor) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  const result = await reorderVenueImages(actor.id, parsed.data.venueId, parsed.data.items);
  if (!result.ok) return writeFailureResponse(result);

  return NextResponse.json({ success: true });
}

// DELETE /api/venue-images?id=N — owner-only.
export async function DELETE(req: NextRequest) {
  const idParam = req.nextUrl.searchParams.get("id");
  if (!idParam) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const imageId = Number(idParam);
  if (!Number.isInteger(imageId) || imageId <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const actor = await getCurrentAppUser();
  if (!actor) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  const result = await deleteVenueImage(actor.id, imageId);
  if (!result.ok) return writeFailureResponse(result);
  return NextResponse.json({ success: true });
}
