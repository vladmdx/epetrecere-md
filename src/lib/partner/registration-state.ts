import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  partnerOrganizations,
  venueHalls,
  venueImages,
  venues,
} from "@/lib/db/schema";

type Executor = typeof db;

/**
 * A short-lived compare-and-swap snapshot for registration transitions.
 *
 * PostgreSQL changes `xmin` on every UPDATE, including reject -> pending
 * resubmissions which end in the same visible status as an older submission.
 * Including every hall and venue image also detects required onboarding data
 * added, edited or removed while an operation is waiting for the venue
 * advisory lock. This token is intentionally internal; it is captured
 * immediately before a transition and compared after locking.
 */
export type VenueRegistrationSnapshot = {
  venue: {
    id: number;
    organizationId: number | null;
    userId: string | null;
    timezone: string;
    isActive: boolean;
    rowVersion: string;
  };
  organization: {
    id: number;
    status: string;
    rowVersion: string;
  } | null;
  halls: Array<{
    id: number;
    status: string;
    isLegacyDefault: boolean;
    updatedAt: Date;
    rowVersion: string;
  }>;
  images: Array<{
    id: number;
    hallId: number | null;
    rowVersion: string;
  }>;
  token: string;
};

function tokenFor(
  venue: VenueRegistrationSnapshot["venue"],
  organization: VenueRegistrationSnapshot["organization"],
  halls: VenueRegistrationSnapshot["halls"],
  images: VenueRegistrationSnapshot["images"],
): string {
  return JSON.stringify({
    venue: [
      venue.id,
      venue.organizationId,
      venue.userId,
      venue.timezone,
      venue.isActive,
      venue.rowVersion,
    ],
    organization: organization
      ? [organization.id, organization.status, organization.rowVersion]
      : null,
    halls: halls.map((hall) => [
      hall.id,
      hall.status,
      hall.isLegacyDefault,
      hall.updatedAt,
      hall.rowVersion,
    ]),
    images: images.map((image) => [image.id, image.hallId, image.rowVersion]),
  });
}

export async function loadVenueRegistrationSnapshot(
  venueId: number,
  executor: Executor = db,
): Promise<VenueRegistrationSnapshot | null> {
  const [venue] = await executor
    .select({
      id: venues.id,
      organizationId: venues.organizationId,
      userId: venues.userId,
      timezone: venues.timezone,
      isActive: venues.isActive,
      rowVersion: sql<string>`xmin::text`,
    })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  if (!venue) return null;

  const organization = venue.organizationId == null
    ? null
    : (await executor
        .select({
          id: partnerOrganizations.id,
          status: partnerOrganizations.status,
          rowVersion: sql<string>`xmin::text`,
        })
        .from(partnerOrganizations)
        .where(eq(partnerOrganizations.id, venue.organizationId))
        .limit(1))[0] ?? null;
  const halls = await executor
    .select({
      id: venueHalls.id,
      status: venueHalls.status,
      isLegacyDefault: venueHalls.isLegacyDefault,
      updatedAt: venueHalls.updatedAt,
      rowVersion: sql<string>`xmin::text`,
    })
    .from(venueHalls)
    .where(eq(venueHalls.venueId, venueId))
    .orderBy(asc(venueHalls.id));
  const images = await executor
    .select({
      id: venueImages.id,
      hallId: venueImages.hallId,
      rowVersion: sql<string>`xmin::text`,
    })
    .from(venueImages)
    .where(eq(venueImages.venueId, venueId))
    .orderBy(asc(venueImages.id));

  return {
    venue,
    organization,
    halls,
    images,
    token: tokenFor(venue, organization, halls, images),
  };
}

/**
 * Load and lock the authoritative registration state in hierarchy order.
 *
 * The parent venue is locked first, which also makes FK-backed hall and image
 * creation wait. The organization follows, then all existing halls and venue
 * images are locked by id. An edit that committed before a lock is observed
 * by the xmin token; an edit that starts afterwards waits until the
 * registration transition commits.
 */
export async function loadLockedVenueRegistrationSnapshot(
  venueId: number,
  executor: Executor,
): Promise<VenueRegistrationSnapshot | null> {
  const [venue] = await executor
    .select({
      id: venues.id,
      organizationId: venues.organizationId,
      userId: venues.userId,
      timezone: venues.timezone,
      isActive: venues.isActive,
      rowVersion: sql<string>`xmin::text`,
    })
    .from(venues)
    .where(eq(venues.id, venueId))
    .for("update")
    .limit(1);
  if (!venue) return null;

  const organization = venue.organizationId == null
    ? null
    : (await executor
        .select({
          id: partnerOrganizations.id,
          status: partnerOrganizations.status,
          rowVersion: sql<string>`xmin::text`,
        })
        .from(partnerOrganizations)
        .where(eq(partnerOrganizations.id, venue.organizationId))
        .for("update")
        .limit(1))[0] ?? null;
  const halls = await executor
    .select({
      id: venueHalls.id,
      status: venueHalls.status,
      isLegacyDefault: venueHalls.isLegacyDefault,
      updatedAt: venueHalls.updatedAt,
      rowVersion: sql<string>`xmin::text`,
    })
    .from(venueHalls)
    .where(eq(venueHalls.venueId, venueId))
    .orderBy(asc(venueHalls.id))
    .for("update");
  const images = await executor
    .select({
      id: venueImages.id,
      hallId: venueImages.hallId,
      rowVersion: sql<string>`xmin::text`,
    })
    .from(venueImages)
    .where(eq(venueImages.venueId, venueId))
    .orderBy(asc(venueImages.id))
    .for("update");

  return {
    venue,
    organization,
    halls,
    images,
    token: tokenFor(venue, organization, halls, images),
  };
}

/** Capture all component row versions from one MVCC snapshot. */
export async function captureVenueRegistrationSnapshot(
  venueId: number,
): Promise<VenueRegistrationSnapshot | null> {
  return db.transaction(
    async (tx) => loadVenueRegistrationSnapshot(venueId, tx as unknown as Executor),
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export function venueRegistrationSnapshotMatches(
  expected: VenueRegistrationSnapshot,
  current: VenueRegistrationSnapshot,
): boolean {
  return expected.token === current.token;
}

export function venueRegistrationHasPendingWork(snapshot: VenueRegistrationSnapshot): boolean {
  // Both organization-backed and legacy registrations have an explicit review
  // state on their hall rows. `venues.is_active = false` alone is ambiguous:
  // it also describes a rejected legacy venue, so treating it as pending would
  // make every retry of the same rejection a fresh decision/notification.
  if (snapshot.venue.organizationId != null) {
    return snapshot.halls.some((hall) => hall.status === "pending");
  }
  return snapshot.venue.userId != null &&
    !snapshot.venue.isActive &&
    snapshot.halls.some((hall) => hall.status === "pending" && hall.isLegacyDefault);
}
