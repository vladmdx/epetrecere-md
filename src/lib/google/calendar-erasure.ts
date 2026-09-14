import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  artists,
  calendarEvents,
  venues,
} from "@/lib/db/schema";

type AccountErasureTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

/** Purge provider summaries copied for an erased Google-account holder.
 * Callers must already hold that user's legal lock and every membership-org
 * legal lock. That is the same fence Google replacement acquires, so this
 * direct DB cleanup wins after any in-flight replacement and cannot be
 * repopulated from the erased credential. Shared organization projections are
 * kept blocked but their summaries become generic, avoiding a false-free gap
 * until remaining contributors rebuild the union. */
export async function purgeGoogleCalendarForAccountErasure(
  tx: AccountErasureTransaction,
  input: { userId: string; organizationIds: readonly number[] },
): Promise<{ deleted: number; scrubbed: number }> {
  const ownedArtists = await tx
    .select({ id: artists.id })
    .from(artists)
    .where(eq(artists.userId, input.userId))
    .orderBy(artists.id)
    .for("share");
  const ownedLegacyVenues = await tx
    .select({ id: venues.id })
    .from(venues)
    .where(and(eq(venues.userId, input.userId), isNull(venues.organizationId)))
    .orderBy(venues.id)
    .for("share");
  const organizationVenues = input.organizationIds.length === 0
    ? []
    : await tx
        .select({ id: venues.id })
        .from(venues)
        .where(inArray(venues.organizationId, [...input.organizationIds]))
        .orderBy(venues.id)
        .for("share");
  const artistIds = ownedArtists.map(({ id }) => id);
  const legacyVenueIds = ownedLegacyVenues.map(({ id }) => id);
  const organizationVenueIds = organizationVenues.map(({ id }) => id);

  const removed = artistIds.length === 0 && legacyVenueIds.length === 0
    ? []
    : await tx
        .delete(calendarEvents)
        .where(and(
          eq(calendarEvents.source, "google_sync"),
          or(
            artistIds.length > 0
              ? and(
                  eq(calendarEvents.entityType, "artist"),
                  inArray(calendarEvents.entityId, artistIds),
                )
              : undefined,
            legacyVenueIds.length > 0
              ? and(
                  eq(calendarEvents.entityType, "venue"),
                  inArray(calendarEvents.entityId, legacyVenueIds),
                )
              : undefined,
          ),
        ))
        .returning({ id: calendarEvents.id });
  const scrubbed = organizationVenueIds.length === 0
    ? []
    : await tx
        .update(calendarEvents)
        .set({ note: "Google: Ocupat" })
        .where(and(
          eq(calendarEvents.source, "google_sync"),
          eq(calendarEvents.entityType, "venue"),
          inArray(calendarEvents.entityId, organizationVenueIds),
        ))
        .returning({ id: calendarEvents.id });
  return { deleted: removed.length, scrubbed: scrubbed.length };
}
