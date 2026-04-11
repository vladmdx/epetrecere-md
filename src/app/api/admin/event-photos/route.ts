import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  eventPhotos,
  eventPlans,
  artists,
  venues,
  users,
} from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/admin";

// M5 — GET /api/admin/event-photos?status=pending|approved|all
//
// Admin moderation queue for user-generated photos. Joins the plan + owner +
// tagged artist/venue so the admin page can show context without N+1s.

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const status = req.nextUrl.searchParams.get("status") ?? "pending";

  const baseQuery = db
    .select({
      photo: eventPhotos,
      planTitle: eventPlans.title,
      planEventType: eventPlans.eventType,
      planEventDate: eventPlans.eventDate,
      uploaderName: users.name,
      uploaderEmail: users.email,
      artistNameRo: artists.nameRo,
      artistSlug: artists.slug,
      venueNameRo: venues.nameRo,
      venueSlug: venues.slug,
    })
    .from(eventPhotos)
    .leftJoin(eventPlans, eq(eventPhotos.planId, eventPlans.id))
    .leftJoin(users, eq(eventPhotos.userId, users.id))
    .leftJoin(artists, eq(eventPhotos.taggedArtistId, artists.id))
    .leftJoin(venues, eq(eventPhotos.taggedVenueId, venues.id))
    .orderBy(desc(eventPhotos.createdAt))
    .limit(200);

  const rows =
    status === "approved"
      ? await baseQuery.where(eq(eventPhotos.isApproved, true))
      : status === "all"
        ? await baseQuery
        : await baseQuery.where(eq(eventPhotos.isApproved, false));

  return NextResponse.json({ photos: rows });
}
