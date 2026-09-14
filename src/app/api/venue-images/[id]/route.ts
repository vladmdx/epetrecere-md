// Per-venue-image ops: PUT for partial update (alt/cover/sortOrder),
// DELETE for hard delete. Mirrors the artist-images sibling.

import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { getCurrentAppUser } from "@/lib/venue-access";
import {
  deleteVenueImage,
  updateVenueImage,
  type VenueImageWriteFailure,
} from "@/lib/partner/venue-image-writes";

const updateSchema = z
  .object({
    altRo: z.string().max(500).nullable().optional(),
    altRu: z.string().max(500).nullable().optional(),
    altEn: z.string().max(500).nullable().optional(),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
    isCover: z.boolean().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "At least one field is required",
  });

function writeFailureResponse(result: VenueImageWriteFailure) {
  return NextResponse.json(
    { error: result.error, code: result.code },
    { status: result.status },
  );
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const imageId = Number(id);
  if (!Number.isInteger(imageId) || imageId <= 0) {
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

  const actor = await getCurrentAppUser();
  if (!actor) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  const result = await updateVenueImage(actor.id, imageId, parsed.data);
  if (!result.ok) return writeFailureResponse(result);
  return NextResponse.json(result.image);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const imageId = Number(id);
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
