import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { venueImages, venues, users } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";

// Venue gallery images CRUD — mirrors /api/artist-images.
//
// GET is public (powers the venue detail page gallery).
// POST is owner-gated: only the venue owner or an admin can add images.

const createSchema = z.object({
  venueId: z.number().int().positive(),
  url: z.string().url(),
  altRo: z.string().max(500).optional().nullable(),
  altRu: z.string().max(500).optional().nullable(),
  altEn: z.string().max(500).optional().nullable(),
  isCover: z.boolean().default(false),
});

async function requireVenueOwner(venueId: number) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }

  const [appUser] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  // Admins bypass ownership check.
  if (appUser.role === "admin" || appUser.role === "super_admin") {
    return { ok: true as const, userId: appUser.id };
  }

  const [venue] = await db
    .select({ id: venues.id })
    .from(venues)
    .where(and(eq(venues.id, venueId), eq(venues.userId, appUser.id)))
    .limit(1);
  if (!venue) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return { ok: true as const, userId: appUser.id };
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
      url: parsed.data.url,
      altRo: parsed.data.altRo ?? null,
      altRu: parsed.data.altRu ?? null,
      altEn: parsed.data.altEn ?? null,
      isCover: parsed.data.isCover,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
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
