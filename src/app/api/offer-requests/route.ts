import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { offerRequests, artists, venues } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/admin";

// GET all offer requests — admin only (contains PII)
export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });
  const requests = await db
    .select({
      id: offerRequests.id,
      artistId: offerRequests.artistId,
      artistName: artists.nameRo,
      venueId: offerRequests.venueId,
      venueName: venues.nameRo,
      clientName: offerRequests.clientName,
      clientPhone: offerRequests.clientPhone,
      clientEmail: offerRequests.clientEmail,
      eventType: offerRequests.eventType,
      eventDate: offerRequests.eventDate,
      message: offerRequests.message,
      source: offerRequests.source,
      adminSeen: offerRequests.adminSeen,
      adminComment: offerRequests.adminComment,
      status: offerRequests.status,
      createdAt: offerRequests.createdAt,
    })
    .from(offerRequests)
    .leftJoin(artists, eq(offerRequests.artistId, artists.id))
    .leftJoin(venues, eq(offerRequests.venueId, venues.id))
    .orderBy(desc(offerRequests.createdAt))
    .limit(100);

  return NextResponse.json(requests);
}
