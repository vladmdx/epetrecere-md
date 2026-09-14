// Returns a JSON preview of the booking contract data for the sign
// contract dialog. Access-gated the same as the PDF endpoint.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, artists, bookingRequests } from "@/lib/db/schema";
import { requireVenueCapability } from "@/lib/venue-access";
import {
  bookingContractClientMatches,
  bookingContractVendorIdentity,
} from "@/lib/booking/contract-data";

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

  const [b] = await db
    .select()
    .from(bookingRequests)
    .where(eq(bookingRequests.id, bookingId))
    .limit(1);

  if (!b) {
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

  let hasAccess = false;
  if (bookingContractClientMatches(b, u)) hasAccess = true;
  else if (b.artistId) {
    const [a] = await db
      .select({ userId: artists.userId })
      .from(artists)
      .where(eq(artists.id, b.artistId))
      .limit(1);
    if (a?.userId === u.id) hasAccess = true;
  } else if (b.venueId) {
    const access = await requireVenueCapability(b.venueId, "manage_financials");
    if (access.ok) hasAccess = true;
  }

  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!b.clientSignedAt && !["confirmed_by_client", "completed"].includes(b.status)) {
    return NextResponse.json({ error: "booking_confirmation_required" }, { status: 403 });
  }

  const vendor = bookingContractVendorIdentity(b);

  return NextResponse.json({
    clientName: b.clientName,
    clientPhone: b.clientPhone,
    clientEmail: b.clientEmail,
    vendorName: vendor.vendorName,
    vendorKind: vendor.vendorKind,
    venueName: vendor.venueName,
    hallName: vendor.hallName,
    eventDate: b.eventDate,
    eventType: b.eventType,
    startTime: b.startTime,
    endTime: b.endTime,
    guestCount: b.guestCount,
    agreedPrice: b.agreedPrice,
    message: b.message,
  });
}
