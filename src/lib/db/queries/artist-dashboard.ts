// Partner dashboard — view-specific reads.
//
// These power the redesigned `/dashboard` home (mockup with hero card +
// stat tiles + "Următorul eveniment" + "Cereri recente"). The dashboard
// is the first paint a partner sees after login so everything runs in
// parallel and returns plain objects ready for the client component.
//
// Currently artist-only — venue owners get a separate /dashboard/sala
// page. Same shape can be replicated there later.

import { db } from "@/lib/db";
import {
  artists,
  bookingRequests,
  eventPlans,
  venues,
  venueImages,
} from "@/lib/db/schema";
import { and, asc, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";

export type NextEvent = {
  id: number;
  eventType: string | null;
  clientName: string;
  eventDate: string; // "YYYY-MM-DD"
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  guestCount: number | null;
  /** Venue name if the booking is linked to an event plan that has a
   *  venue booking in the same plan. Else null. */
  venueName: string | null;
  /** Cover image of the linked venue, when one exists. Falls back to a
   *  generic event-themed image in the UI. */
  venueImage: string | null;
  status: string;
};

export type RecentRequest = {
  id: number;
  eventType: string | null;
  clientName: string;
  eventDate: string;
  location: string | null;
  guestCount: number | null;
  status: string;
  createdAt: Date;
};

/**
 * Find the next upcoming booking for this artist that has been at least
 * accepted by them (so we don't surface pending requests as "next event").
 * Returns null when the artist has nothing on the calendar.
 */
export async function getArtistNextEvent(
  artistId: number,
): Promise<NextEvent | null> {
  const todayIso = new Date().toISOString().slice(0, 10);

  const rows = await db
    .select({
      id: bookingRequests.id,
      eventType: bookingRequests.eventType,
      clientName: bookingRequests.clientName,
      eventDate: bookingRequests.eventDate,
      startTime: bookingRequests.startTime,
      endTime: bookingRequests.endTime,
      guestCount: bookingRequests.guestCount,
      status: bookingRequests.status,
      eventPlanId: bookingRequests.eventPlanId,
      planLocation: eventPlans.location,
    })
    .from(bookingRequests)
    .leftJoin(eventPlans, eq(bookingRequests.eventPlanId, eventPlans.id))
    .where(
      and(
        eq(bookingRequests.artistId, artistId),
        inArray(bookingRequests.status, [
          "accepted",
          "confirmed_by_client",
        ]),
        gte(bookingRequests.eventDate, todayIso),
      ),
    )
    .orderBy(asc(bookingRequests.eventDate), asc(bookingRequests.startTime))
    .limit(1);

  const next = rows[0];
  if (!next) return null;

  // If the booking is linked to an event plan, try to find a sibling
  // booking row in the same plan that targeted a venue — that gives us
  // the venue name + cover image to show on the artist's card.
  let venueName: string | null = null;
  let venueImage: string | null = null;
  if (next.eventPlanId) {
    const siblingRows = await db
      .select({
        venueId: bookingRequests.venueId,
        venueName: venues.nameRo,
      })
      .from(bookingRequests)
      .innerJoin(venues, eq(bookingRequests.venueId, venues.id))
      .where(
        and(
          eq(bookingRequests.eventPlanId, next.eventPlanId),
          isNotNull(bookingRequests.venueId),
        ),
      )
      .limit(1);
    const sibling = siblingRows[0];
    if (sibling?.venueId) {
      venueName = sibling.venueName;
      const imgRows = await db
        .select({ url: venueImages.url })
        .from(venueImages)
        .where(eq(venueImages.venueId, sibling.venueId))
        .orderBy(asc(venueImages.sortOrder))
        .limit(1);
      venueImage = imgRows[0]?.url ?? null;
    }
  }

  return {
    id: next.id,
    eventType: next.eventType,
    clientName: next.clientName,
    eventDate: next.eventDate,
    startTime: next.startTime,
    endTime: next.endTime,
    location: next.planLocation,
    guestCount: next.guestCount,
    venueName,
    venueImage,
    status: next.status,
  };
}

/**
 * Last N booking requests (any status), sorted by createdAt desc. Powers
 * the "Cereri recente" list at the bottom of the dashboard.
 */
export async function getArtistRecentRequests(
  artistId: number,
  limit = 3,
): Promise<RecentRequest[]> {
  const rows = await db
    .select({
      id: bookingRequests.id,
      eventType: bookingRequests.eventType,
      clientName: bookingRequests.clientName,
      eventDate: bookingRequests.eventDate,
      guestCount: bookingRequests.guestCount,
      status: bookingRequests.status,
      createdAt: bookingRequests.createdAt,
      planLocation: eventPlans.location,
    })
    .from(bookingRequests)
    .leftJoin(eventPlans, eq(bookingRequests.eventPlanId, eventPlans.id))
    .where(eq(bookingRequests.artistId, artistId))
    .orderBy(desc(bookingRequests.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    eventType: r.eventType,
    clientName: r.clientName,
    eventDate: r.eventDate,
    location: r.planLocation,
    guestCount: r.guestCount,
    status: r.status,
    createdAt: r.createdAt,
  }));
}

export type ArtistProfileSnapshot = {
  id: number;
  nameRo: string;
  slug: string;
  photoUrl: string | null;
  isPremium: boolean;
  isVerified: boolean;
  /** Computed 0–100 based on which optional profile fields are filled.
   *  Used to drive the "Completează profilul" progress bar on the hero
   *  card. Updated whenever the artist edits their profile. */
  profileCompletionPct: number;
};

const PROFILE_FIELDS = [
  "nameRo",
  "descriptionRo",
  "photoUrl",
  "priceFrom",
  "location",
  "phone",
  "email",
  "instagram",
] as const;

/**
 * Snapshot of the artist row needed for the hero card. Bundled with a
 * server-computed profile completion percentage based on how many of
 * the optional contact/marketing fields are filled. The `priceHidden`
 * opt-out counts as completion for priceFrom, so artists who chose
 * "request quote" pricing don't get punished.
 */
export async function getArtistProfileSnapshot(
  artistId: number,
): Promise<ArtistProfileSnapshot | null> {
  const rows = await db
    .select({
      id: artists.id,
      nameRo: artists.nameRo,
      slug: artists.slug,
      photoUrl: artists.photoUrl,
      isPremium: artists.isPremium,
      isVerified: artists.isVerified,
      descriptionRo: artists.descriptionRo,
      priceFrom: artists.priceFrom,
      priceHidden: artists.priceHidden,
      location: artists.location,
      phone: artists.phone,
      email: artists.email,
      instagram: artists.instagram,
      facebook: artists.facebook,
    })
    .from(artists)
    .where(eq(artists.id, artistId))
    .limit(1);

  const a = rows[0];
  if (!a) return null;

  const filled = [
    a.nameRo,
    a.descriptionRo,
    a.photoUrl,
    a.priceFrom != null || a.priceHidden,
    a.location,
    a.phone,
    a.email,
    a.instagram || a.facebook,
  ].filter(Boolean).length;
  const profileCompletionPct = Math.round((filled / PROFILE_FIELDS.length) * 100);

  return {
    id: a.id,
    nameRo: a.nameRo,
    slug: a.slug,
    photoUrl: a.photoUrl,
    isPremium: a.isPremium,
    isVerified: a.isVerified,
    profileCompletionPct,
  };
}
