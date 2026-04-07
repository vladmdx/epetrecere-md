import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { offerRequests, artists } from "@/lib/db/schema";
import { desc, eq, sql } from "drizzle-orm";

// GET all offer requests for admin
export async function GET() {
  const requests = await db
    .select({
      id: offerRequests.id,
      artistId: offerRequests.artistId,
      artistName: artists.nameRo,
      clientName: offerRequests.clientName,
      clientPhone: offerRequests.clientPhone,
      clientEmail: offerRequests.clientEmail,
      eventType: offerRequests.eventType,
      eventDate: offerRequests.eventDate,
      message: offerRequests.message,
      adminSeen: offerRequests.adminSeen,
      adminComment: offerRequests.adminComment,
      status: offerRequests.status,
      createdAt: offerRequests.createdAt,
    })
    .from(offerRequests)
    .leftJoin(artists, eq(offerRequests.artistId, artists.id))
    .orderBy(desc(offerRequests.createdAt))
    .limit(100);

  return NextResponse.json(requests);
}
