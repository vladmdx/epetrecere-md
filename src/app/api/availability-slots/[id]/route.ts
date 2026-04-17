// Delete a single availability slot — artist-owner only. The slot's
// `booking_request_id` column is allowed to be null; booked slots can
// still be removed manually and the UI warns first.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { artistAvailabilitySlots, artists, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const slotId = Number(id);

  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [slot] = await db
    .select({ artistId: artistAvailabilitySlots.artistId })
    .from(artistAvailabilitySlots)
    .where(eq(artistAvailabilitySlots.id, slotId))
    .limit(1);
  if (!slot) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const [artist] = await db
    .select({ userId: artists.userId })
    .from(artists)
    .where(eq(artists.id, slot.artistId))
    .limit(1);
  if (!artist || artist.userId !== appUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db
    .delete(artistAvailabilitySlots)
    .where(eq(artistAvailabilitySlots.id, slotId));

  return NextResponse.json({ ok: true });
}
