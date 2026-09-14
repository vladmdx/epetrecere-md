import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { artists, bookingRequests, venues } from "@/lib/db/schema";

type Executor = typeof db;

export type PlanBookingConflict = {
  error: string;
  status: 409;
};

const ACTIVE_PLAN_BOOKING_STATUSES = new Set([
  "pending",
  "accepted",
  "confirmed_by_client",
  "completed",
]);

export class PlanBookingConflictError extends Error {
  readonly status = 409;
  readonly payload: PlanBookingConflict;

  constructor(conflict: PlanBookingConflict) {
    super(conflict.error);
    this.name = "PlanBookingConflictError";
    this.payload = conflict;
  }
}

/** Preserve the existing duplicate/category messages while sharing the exact
 * same decision between the API and concurrency regression tests. */
export async function findArtistPlanBookingConflict(
  executor: Executor,
  eventPlanId: number,
  targetArtistId: number,
): Promise<PlanBookingConflict | null> {
  const existingBookings = await executor
    .select({
      artistId: bookingRequests.artistId,
      status: bookingRequests.status,
    })
    .from(bookingRequests)
    .where(eq(bookingRequests.eventPlanId, eventPlanId));

  // Duplicate target detection is independent from categories. In
  // particular, an uncategorized artist still cannot receive a second request
  // for the same plan.
  const priorBooking = existingBookings.find(
    (booking) => booking.artistId === targetArtistId,
  );
  if (priorBooking) {
    const declined =
      priorBooking.status === "rejected" ||
      priorBooking.status === "cancelled" ||
      priorBooking.status === "expired";
    return {
      error: declined
        ? "Acest artist a refuzat deja cererea ta pentru acest eveniment. Te rugăm să alegi un alt artist."
        : "Ai trimis deja o cerere către acest artist pentru acest eveniment.",
      status: 409,
    };
  }

  // Category membership is mutable. Lock every involved artist in ascending
  // id order so this decision sees one stable set and concurrent requests for
  // other plans cannot form a cross-artist lock cycle.
  const artistIds = [
    ...new Set([
      targetArtistId,
      ...existingBookings
        .map((booking) => booking.artistId)
        .filter((id): id is number => id != null),
    ]),
  ].sort((a, b) => a - b);
  const artistRows = await executor
    .select({
      id: artists.id,
      categoryIds: artists.categoryIds,
      artistName: artists.nameRo,
    })
    .from(artists)
    .where(inArray(artists.id, artistIds))
    .orderBy(asc(artists.id))
    .for("share");
  const artistById = new Map(artistRows.map((artist) => [artist.id, artist]));
  const targetCategoryIds = artistById.get(targetArtistId)?.categoryIds ?? [];

  // Preserve the legacy category-slot behavior: an uncategorized artist does
  // not occupy a category, after the duplicate rule above has been enforced.
  if (targetCategoryIds.length === 0) return null;

  for (const categoryId of targetCategoryIds) {
    const blocker = existingBookings.find(
      (booking) =>
        booking.artistId != null &&
        ACTIVE_PLAN_BOOKING_STATUSES.has(booking.status) &&
        (artistById.get(booking.artistId)?.categoryIds ?? []).includes(
          categoryId,
        ),
    );
    if (blocker) {
      const blockerName =
        blocker.artistId == null
          ? null
          : artistById.get(blocker.artistId)?.artistName;
      return {
        error:
          blocker.status === "pending"
            ? `Așteaptă răspunsul lui ${blockerName ?? "artist"} (până la 24h) înainte de a trimite altă cerere în această categorie.`
            : `Ai deja un artist confirmat (${blockerName ?? "artist"}) în această categorie pentru evenimentul tău.`,
        status: 409,
      };
    }
  }

  return null;
}

/** Preserve the existing one-venue-per-plan duplicate and active-slot copy. */
export async function findVenuePlanBookingConflict(
  executor: Executor,
  eventPlanId: number,
  targetVenueId: number,
): Promise<PlanBookingConflict | null> {
  const existingVenueBookings = await executor
    .select({
      venueId: bookingRequests.venueId,
      status: bookingRequests.status,
      venueName: venues.nameRo,
    })
    .from(bookingRequests)
    .leftJoin(venues, eq(venues.id, bookingRequests.venueId))
    .where(eq(bookingRequests.eventPlanId, eventPlanId));

  const priorVenue = existingVenueBookings.find(
    (booking) => booking.venueId === targetVenueId,
  );
  if (priorVenue) {
    const declined =
      priorVenue.status === "rejected" ||
      priorVenue.status === "cancelled" ||
      priorVenue.status === "expired";
    return {
      error: declined
        ? "Această sală a refuzat deja cererea ta pentru acest eveniment. Te rugăm să alegi o altă sală."
        : "Ai trimis deja o cerere la această sală pentru acest eveniment.",
      status: 409,
    };
  }

  const blocker = existingVenueBookings.find(
    (booking) =>
      booking.venueId != null &&
      ACTIVE_PLAN_BOOKING_STATUSES.has(booking.status),
  );
  if (!blocker) return null;

  return {
    error:
      blocker.status === "pending"
        ? `Așteaptă răspunsul de la ${blocker.venueName ?? "sală"} (până la 72h) înainte de a trimite altă cerere la o sală.`
        : `Ai deja o sală confirmată (${blocker.venueName ?? "sală"}) pentru evenimentul tău.`,
    status: 409,
  };
}
