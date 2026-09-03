// Returns a JSON preview of the booking contract data for the sign
// contract dialog. Access-gated the same as the PDF endpoint.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, venues, artists, bookingRequests } from "@/lib/db/schema";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const bookingId = Number(id);
  if (!Number.isFinite(bookingId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [row] = await db
    .select({
      booking: bookingRequests,
      artistName: artists.nameRo,
      venueName: venues.nameRo,
    })
    .from(bookingRequests)
    .leftJoin(artists, eq(artists.id, bookingRequests.artistId))
    .leftJoin(venues, eq(venues.id, bookingRequests.venueId))
    .where(eq(bookingRequests.id, bookingId))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Access check — client or vendor
  const [u] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const b = row.booking;
  let hasAccess = false;
  if (b.clientUserId === u.id) hasAccess = true;
  else if (u.email && b.clientEmail === u.email) hasAccess = true;
  else if (b.artistId) {
    const [a] = await db
      .select({ userId: artists.userId })
      .from(artists)
      .where(eq(artists.id, b.artistId))
      .limit(1);
    if (a?.userId === u.id) hasAccess = true;
  } else if (b.venueId) {
    const [v] = await db
      .select({ userId: venues.userId })
      .from(venues)
      .where(eq(venues.id, b.venueId))
      .limit(1);
    if (v?.userId === u.id) hasAccess = true;
  }

  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!["confirmed_by_client", "completed"].includes(b.status)) {
    return NextResponse.json({ error: "booking_confirmation_required" }, { status: 403 });
  }

  const vendorKind: "artist" | "sala" = b.artistId ? "artist" : "sala";
  const vendorName = b.artistId
    ? row.artistName ?? "Artist"
    : row.venueName ?? "Sală";

  return NextResponse.json({
    clientName: b.clientName,
    clientPhone: b.clientPhone,
    clientEmail: b.clientEmail,
    vendorName,
    vendorKind,
    eventDate: b.eventDate,
    eventType: b.eventType,
    startTime: b.startTime,
    endTime: b.endTime,
    guestCount: b.guestCount,
    agreedPrice: b.agreedPrice,
    message: b.message,
  });
}
