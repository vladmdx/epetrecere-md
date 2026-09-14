import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { venueImages, venues } from "@/lib/db/schema";
import {
  acquireAvailabilityLocks,
  acquireLegalScopeLocks,
} from "@/lib/booking/advisory-locks";
import {
  authorizeVenueCapabilityLocked,
  getLockedAppUserById,
} from "@/lib/venue-access";

type VenueImageRow = typeof venueImages.$inferSelect;

export type VenueImageCreateInput = {
  venueId: number;
  hallId?: number | null;
  url: string;
  altRo?: string | null;
  altRu?: string | null;
  altEn?: string | null;
  isCover: boolean;
};

export type VenueImageUpdateInput = {
  altRo?: string | null;
  altRu?: string | null;
  altEn?: string | null;
  sortOrder?: number;
  isCover?: boolean;
};

export type VenueImageWriteFailure = {
  ok: false;
  status: 400 | 403 | 404 | 409;
  error: string;
  code: string;
};

type VenueScope = {
  venueId: number;
  organizationId: number | null;
};

type ImageScope = VenueScope & { imageId: number; hallId: number | null };

type LockTransaction = Parameters<typeof acquireLegalScopeLocks>[0];

class VenueImageMutationConflictError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "VenueImageMutationConflictError";
  }
}

function failure(
  status: VenueImageWriteFailure["status"],
  code: string,
  error = code,
): VenueImageWriteFailure {
  return { ok: false, status, error, code };
}

async function loadVenueScope(venueId: number): Promise<VenueScope | null> {
  const [venue] = await db
    .select({ venueId: venues.id, organizationId: venues.organizationId })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  return venue ?? null;
}

async function loadImageScope(imageId: number): Promise<ImageScope | null> {
  const [image] = await db
    .select({
      imageId: venueImages.id,
      venueId: venueImages.venueId,
      hallId: venueImages.hallId,
      organizationId: venues.organizationId,
    })
    .from(venueImages)
    .innerJoin(venues, eq(venues.id, venueImages.venueId))
    .where(eq(venueImages.id, imageId))
    .limit(1);
  return image ?? null;
}

/**
 * Acquire the same hierarchy of locks as registration submit/decisions before
 * trusting authorization or mutable venue state:
 * user advisory -> organization advisory -> venue availability -> actor row
 * -> venue row -> membership row.
 *
 * The unlocked scope read is discovery only. A venue reassignment between
 * discovery and the locked read is rejected, never authorized against the
 * wrong organization.
 */
async function lockAuthorizedVenue(
  tx: LockTransaction,
  executor: typeof db,
  actorUserId: string,
  expected: VenueScope,
): Promise<
  | { ok: true; venue: typeof venues.$inferSelect }
  | VenueImageWriteFailure
> {
  await acquireLegalScopeLocks(tx, {
    userIds: [actorUserId],
    organizationIds: expected.organizationId == null
      ? []
      : [expected.organizationId],
  });
  await acquireAvailabilityLocks(tx, {
    venueId: expected.venueId,
    hallIds: [],
    localDates: [],
    conflictGroupIds: [],
  });

  const actor = await getLockedAppUserById(actorUserId, executor);
  if (!actor) return failure(403, "FORBIDDEN", "Forbidden");

  const [venue] = await executor
    .select()
    .from(venues)
    .where(eq(venues.id, expected.venueId))
    .for("update")
    .limit(1);
  if (!venue) return failure(404, "VENUE_NOT_FOUND", "Venue not found");
  if (venue.organizationId !== expected.organizationId) {
    return failure(409, "VENUE_SCOPE_CHANGED");
  }

  const access = await authorizeVenueCapabilityLocked(
    actor,
    venue.id,
    "manage_profile",
    executor,
  );
  if (!access.ok) {
    return failure(
      access.status === 404 ? 404 : 403,
      access.status === 404 ? "VENUE_NOT_FOUND" : "FORBIDDEN",
      access.error,
    );
  }
  return { ok: true, venue };
}

function hallImageMutationFailure(
  hallId: number | null,
): VenueImageWriteFailure | null {
  if (hallId == null) return null;
  return failure(
    400,
    "HALL_IMAGES_USE_HALL_PATCH",
    "Hall images must be changed through the Hall editor",
  );
}

async function lockAllVenueImages(
  executor: typeof db,
  venueId: number,
): Promise<VenueImageRow[]> {
  return executor
    .select()
    .from(venueImages)
    .where(eq(venueImages.venueId, venueId))
    .orderBy(asc(venueImages.id))
    .for("update");
}

export async function createVenueImage(
  actorUserId: string,
  input: VenueImageCreateInput,
): Promise<{ ok: true; image: VenueImageRow } | VenueImageWriteFailure> {
  const expected = await loadVenueScope(input.venueId);
  if (!expected) return failure(404, "VENUE_NOT_FOUND", "Venue not found");

  try {
    return await db.transaction(async (tx) => {
      const executor = tx as unknown as typeof db;
      const authority = await lockAuthorizedVenue(tx, executor, actorUserId, expected);
      if (!authority.ok) return authority;

      const requestedHallId = input.hallId ?? null;
      // Hall photos are moderated Hall content. Letting the generic gallery
      // endpoint mutate them would bypass active -> draft demotion in
      // patchHallDraft and could publish an unreviewed image immediately.
      const blocked = hallImageMutationFailure(requestedHallId);
      if (blocked) return blocked;

      if (input.isCover) {
        await lockAllVenueImages(executor, authority.venue.id);
        await executor
          .update(venueImages)
          .set({ isCover: false })
          .where(and(
            eq(venueImages.venueId, authority.venue.id),
            isNull(venueImages.hallId),
          ));
      }

      const [created] = await executor
        .insert(venueImages)
        .values({
          venueId: authority.venue.id,
          hallId: requestedHallId,
          url: input.url,
          altRo: input.altRo ?? null,
          altRu: input.altRu ?? null,
          altEn: input.altEn ?? null,
          isCover: input.isCover,
        })
        .returning();
      if (!created) throw new VenueImageMutationConflictError("IMAGE_CREATE_CONFLICT");
      return { ok: true as const, image: created };
    });
  } catch (error) {
    if (error instanceof VenueImageMutationConflictError) {
      return failure(409, error.code);
    }
    throw error;
  }
}

export async function updateVenueImage(
  actorUserId: string,
  imageId: number,
  patch: VenueImageUpdateInput,
): Promise<{ ok: true; image: VenueImageRow } | VenueImageWriteFailure> {
  const expected = await loadImageScope(imageId);
  if (!expected) return failure(404, "IMAGE_NOT_FOUND", "Not found");

  try {
    return await db.transaction(async (tx) => {
      const executor = tx as unknown as typeof db;
      const authority = await lockAuthorizedVenue(tx, executor, actorUserId, expected);
      if (!authority.ok) return authority;

      let image: VenueImageRow | undefined;
      if (patch.isCover === true) {
        const rows = await lockAllVenueImages(executor, expected.venueId);
        image = rows.find((row) => row.id === imageId);
      } else {
        [image] = await executor
          .select()
          .from(venueImages)
          .where(eq(venueImages.id, imageId))
          .for("update")
          .limit(1);
      }
      if (!image || image.venueId !== expected.venueId) {
        return failure(409, "IMAGE_SCOPE_CHANGED");
      }
      const blocked = hallImageMutationFailure(image.hallId);
      if (blocked) return blocked;

      if (patch.isCover === true) {
        await executor
          .update(venueImages)
          .set({ isCover: false })
          .where(and(
            eq(venueImages.venueId, expected.venueId),
            isNull(venueImages.hallId),
          ));
      }
      const [updated] = await executor
        .update(venueImages)
        .set(patch)
        .where(and(eq(venueImages.id, imageId), eq(venueImages.venueId, expected.venueId)))
        .returning();
      if (!updated) throw new VenueImageMutationConflictError("IMAGE_UPDATE_CONFLICT");
      return { ok: true as const, image: updated };
    });
  } catch (error) {
    if (error instanceof VenueImageMutationConflictError) {
      return failure(409, error.code);
    }
    throw error;
  }
}

export async function reorderVenueImages(
  actorUserId: string,
  venueId: number,
  items: Array<{ id: number; sortOrder: number }>,
): Promise<{ ok: true } | VenueImageWriteFailure> {
  const ids = items.map((item) => item.id);
  if (new Set(ids).size !== ids.length) {
    return failure(400, "VALIDATION_FAILED", "Validation failed");
  }
  const expected = await loadVenueScope(venueId);
  if (!expected) return failure(404, "VENUE_NOT_FOUND", "Venue not found");

  try {
    return await db.transaction(async (tx) => {
      const executor = tx as unknown as typeof db;
      const authority = await lockAuthorizedVenue(tx, executor, actorUserId, expected);
      if (!authority.ok) return authority;
      if (items.length === 0) return { ok: true as const };

      const rows = await executor
        .select({
          id: venueImages.id,
          hallId: venueImages.hallId,
        })
        .from(venueImages)
        .where(and(eq(venueImages.venueId, venueId), inArray(venueImages.id, ids)))
        .orderBy(asc(venueImages.id))
        .for("update");
      if (rows.length !== ids.length) {
        return failure(409, "IMAGE_SET_CHANGED");
      }
      if (rows.some((row) => row.hallId != null)) {
        return failure(
          400,
          "HALL_IMAGES_USE_HALL_PATCH",
          "Hall images must be changed through the Hall editor",
        );
      }

      for (const item of items) {
        const updated = await executor
          .update(venueImages)
          .set({ sortOrder: item.sortOrder })
          .where(and(eq(venueImages.id, item.id), eq(venueImages.venueId, venueId)))
          .returning({ id: venueImages.id, sortOrder: venueImages.sortOrder });
        if (
          updated.length !== 1
          || updated[0]?.id !== item.id
          || updated[0]?.sortOrder !== item.sortOrder
        ) {
          throw new VenueImageMutationConflictError("REORDER_CONFLICT");
        }
      }

      return { ok: true as const };
    });
  } catch (error) {
    if (error instanceof VenueImageMutationConflictError) {
      return failure(
        409,
        error.code,
        error.code === "REORDER_CONFLICT" ? "Reorder conflict" : error.code,
      );
    }
    throw error;
  }
}

export async function deleteVenueImage(
  actorUserId: string,
  imageId: number,
): Promise<{ ok: true } | VenueImageWriteFailure> {
  const expected = await loadImageScope(imageId);
  if (!expected) return failure(404, "IMAGE_NOT_FOUND", "Not found");

  return db.transaction(async (tx) => {
    const executor = tx as unknown as typeof db;
    const authority = await lockAuthorizedVenue(tx, executor, actorUserId, expected);
    if (!authority.ok) return authority;

    const [image] = await executor
      .select({
        id: venueImages.id,
        venueId: venueImages.venueId,
        hallId: venueImages.hallId,
      })
      .from(venueImages)
      .where(eq(venueImages.id, imageId))
      .for("update")
      .limit(1);
    if (!image || image.venueId !== expected.venueId) {
      return failure(409, "IMAGE_SCOPE_CHANGED");
    }
    const blocked = hallImageMutationFailure(image.hallId);
    if (blocked) return blocked;

    const deleted = await executor
      .delete(venueImages)
      .where(and(eq(venueImages.id, imageId), eq(venueImages.venueId, expected.venueId)))
      .returning({ id: venueImages.id });
    if (deleted.length !== 1) return failure(409, "IMAGE_DELETE_CONFLICT");
    return { ok: true as const };
  });
}
