// F-C9 — Returns the vendors (artists + venues) booked by the signed-in
// client. Aggregates from booking_requests and offer_requests joined
// against the artist/venue tables so the client sees one consolidated list
// instead of scattered per-booking rows.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  artists,
  bookingRequests,
  offerRequests,
  users,
  venues,
} from "@/lib/db/schema";

interface VendorEntry {
  kind: "artist" | "venue";
  id: number;
  name: string;
  slug: string | null;
  status: string;
  eventDate: string | null;
  eventType: string | null;
  source: "booking_request" | "offer_request";
  createdAt: string;
}

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [appUser] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  if (!appUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // M0b — booking requests are keyed by client_email since legacy rows
  // predate the clientUserId column. Scope by the user's email plus (if
  // present) clientUserId when that column exists.
  const whereBooking = appUser.email
    ? eq(bookingRequests.clientEmail, appUser.email)
    : undefined;

  const userBookings = whereBooking
    ? await db
        .select()
        .from(bookingRequests)
        .where(whereBooking)
        .orderBy(desc(bookingRequests.createdAt))
    : [];

  const userOffers = appUser.email
    ? await db
        .select()
        .from(offerRequests)
        .where(eq(offerRequests.clientEmail, appUser.email))
        .orderBy(desc(offerRequests.createdAt))
    : [];

  // Resolve artist rows once for every unique id referenced.
  const artistIds = Array.from(
    new Set(
      [
        ...userBookings.map((b) => b.artistId),
        ...userOffers.map((o) => o.artistId),
      ].filter((x): x is number => typeof x === "number" && x > 0),
    ),
  );
  const venueIds = Array.from(
    new Set(
      userOffers
        .map((o) => o.venueId)
        .filter((x): x is number => typeof x === "number" && x > 0),
    ),
  );

  const [artistRows, venueRows] = await Promise.all([
    artistIds.length
      ? db
          .select({
            id: artists.id,
            slug: artists.slug,
            nameRo: artists.nameRo,
          })
          .from(artists)
          .where(inArray(artists.id, artistIds))
      : Promise.resolve([]),
    venueIds.length
      ? db
          .select({
            id: venues.id,
            slug: venues.slug,
            nameRo: venues.nameRo,
          })
          .from(venues)
          .where(inArray(venues.id, venueIds))
      : Promise.resolve([]),
  ]);

  const artistById = new Map(artistRows.map((a) => [a.id, a]));
  const venueById = new Map(venueRows.map((v) => [v.id, v]));

  const vendors: VendorEntry[] = [];

  for (const b of userBookings) {
    const a = artistById.get(b.artistId);
    if (!a) continue;
    vendors.push({
      kind: "artist",
      id: a.id,
      name: a.nameRo,
      slug: a.slug,
      status: b.status,
      eventDate: b.eventDate,
      eventType: b.eventType,
      source: "booking_request",
      createdAt: b.createdAt.toISOString(),
    });
  }

  for (const o of userOffers) {
    if (o.artistId) {
      const a = artistById.get(o.artistId);
      if (a) {
        vendors.push({
          kind: "artist",
          id: a.id,
          name: a.nameRo,
          slug: a.slug,
          status: o.status ?? "new",
          eventDate: o.eventDate,
          eventType: o.eventType,
          source: "offer_request",
          createdAt: o.createdAt.toISOString(),
        });
      }
    }
    if (o.venueId) {
      const v = venueById.get(o.venueId);
      if (v) {
        vendors.push({
          kind: "venue",
          id: v.id,
          name: v.nameRo,
          slug: v.slug,
          status: o.status ?? "new",
          eventDate: o.eventDate,
          eventType: o.eventType,
          source: "offer_request",
          createdAt: o.createdAt.toISOString(),
        });
      }
    }
  }

  // Dedupe: one row per (kind, id) showing the latest status.
  const dedup = new Map<string, VendorEntry>();
  for (const v of vendors) {
    const key = `${v.kind}:${v.id}`;
    const existing = dedup.get(key);
    if (!existing || new Date(v.createdAt) > new Date(existing.createdAt)) {
      dedup.set(key, v);
    }
  }

  return NextResponse.json({
    vendors: Array.from(dedup.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
  });
}
