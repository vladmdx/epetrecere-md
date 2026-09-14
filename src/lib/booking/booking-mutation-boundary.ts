import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  artists,
  bookingRequests,
  partnerOrganizations,
  users,
  venues,
} from "@/lib/db/schema";
import {
  authorizeVenueCapability,
  authorizeVenueCapabilityLocked,
  ORG_STATUSES_ALLOWING_ACCESS,
  type AppUser,
  type VenueCapability,
} from "@/lib/venue-access";
import {
  acquireArtistAvailabilityLocks,
  acquireLegalScopeLocks,
} from "./advisory-locks";
import { checkArtistAvailability } from "./availability";
import { lockConfirmationVendorParents } from "./confirmation-persist";
import { acquireBookingConfirmationBarrier } from "./effect-outbox";
import { withVenueAvailabilityWriteInTransaction } from "./venue-booking-write";

export type BookingMutationRow = typeof bookingRequests.$inferSelect;
type BookingMutationTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db;

export type BookingMutationPrincipal = "client" | "vendor";

export type BookingMutationAccess =
  | { mode: "client" }
  | {
      mode: "vendor";
      venueCapability: VenueCapability;
    }
  | {
      mode: "client_or_vendor";
      venueCapability: VenueCapability;
    };

type VendorBookingMutationAccess = Exclude<
  BookingMutationAccess,
  { mode: "client" }
>;

function appUserFromRow(row: { id: string; role: string }): AppUser {
  return {
    id: row.id,
    role: row.role,
    isGlobalAdmin: row.role === "admin" || row.role === "super_admin",
  };
}

export class BookingMutationBoundaryError extends Error {
  status: 401 | 403 | 404 | 409;
  code: "unauthorized" | "forbidden" | "booking_changed";

  constructor(
    status: 401 | 403 | 404 | 409,
    code: "unauthorized" | "forbidden" | "booking_changed",
  ) {
    super(code);
    this.name = "BookingMutationBoundaryError";
    this.status = status;
    this.code = code;
  }
}

/** Fields which decide who may mutate a booking and which parents must lock. */
export function bookingMutationTupleMatches(
  current: Pick<
    BookingMutationRow,
    "clientUserId" | "artistId" | "venueId" | "hallId"
  >,
  expected: Pick<
    BookingMutationRow,
    "clientUserId" | "artistId" | "venueId" | "hallId"
  >,
): boolean {
  return current.clientUserId === expected.clientUserId
    && current.artistId === expected.artistId
    && current.venueId === expected.venueId
    && current.hallId === expected.hallId;
}

async function assertVendorAvailableForConfirmation(
  tx: BookingMutationTx,
  expected: BookingMutationRow,
): Promise<void> {
  if (expected.artistId != null) {
    await acquireArtistAvailabilityLocks(tx, expected.artistId, expected.eventDate);
    const availability = await checkArtistAvailability({
      artistId: expected.artistId,
      eventDate: expected.eventDate,
      startTime: expected.startTime,
      endTime: expected.endTime,
      excludeBookingId: expected.id,
      ignorePendingBookings: true,
      executor: tx as unknown as Executor,
    });
    if (!availability.available) {
      const error = new Error("artist_unavailable") as Error & {
        availability: typeof availability;
      };
      error.availability = availability;
      throw error;
    }
    return;
  }

  if (expected.venueId != null) {
    await withVenueAvailabilityWriteInTransaction(
      tx,
      {
        venueId: expected.venueId,
        hallId: expected.hallId,
        guestCount: expected.guestCount,
        eventDate: expected.eventDate,
        startTime: expected.startTime,
        endTime: expected.endTime,
        timezone: expected.timezone,
        reservationScope:
          expected.reservationScope === "venue" ? "venue" : "hall",
        excludeBookingId: expected.id,
        mode: "owner",
      },
      async () => undefined,
    );
  }
}

async function authorizeExpectedVendor(
  executor: Executor,
  actor: AppUser,
  expected: BookingMutationRow,
  access: VendorBookingMutationAccess,
  expectedVenueOrganizationId: number | null,
): Promise<void> {
  if (expected.artistId != null) {
    // lockConfirmationVendorParents already holds this row FOR SHARE.
    const [artist] = await executor
      .select({ userId: artists.userId })
      .from(artists)
      .where(eq(artists.id, expected.artistId))
      .limit(1);
    if (!artist || artist.userId !== actor.id) {
      throw new BookingMutationBoundaryError(403, "forbidden");
    }
    return;
  }

  if (expected.venueId != null) {
    // Reject a legacy->organization reparent observed after the optimistic
    // scope read. Never acquire an unplanned organization lock after parents.
    const [venue] = await executor
      .select({ organizationId: venues.organizationId })
      .from(venues)
      .where(eq(venues.id, expected.venueId))
      .limit(1);
    if (!venue || venue.organizationId !== expectedVenueOrganizationId) {
      throw new BookingMutationBoundaryError(409, "booking_changed");
    }
    const authorized = await authorizeVenueCapabilityLocked(
      actor,
      expected.venueId,
      access.venueCapability,
      executor,
    );
    if (!authorized.ok) {
      throw new BookingMutationBoundaryError(
        authorized.status === 404 ? 404 : 403,
        authorized.status === 404 ? "booking_changed" : "forbidden",
      );
    }
    return;
  }

  throw new BookingMutationBoundaryError(403, "forbidden");
}

/**
 * Reject obvious non-owners before taking availability locks. This check is
 * deliberately non-authoritative: membership/profile state is re-read under
 * locks below before the callback may mutate anything.
 */
async function preflightMutationAccess(
  actor: AppUser,
  expected: BookingMutationRow,
  access: BookingMutationAccess,
  principal: BookingMutationPrincipal,
): Promise<void> {
  if (principal === "client") {
    if (access.mode === "vendor") {
      throw new BookingMutationBoundaryError(403, "forbidden");
    }
    return;
  }
  if (access.mode === "client") {
    throw new BookingMutationBoundaryError(403, "forbidden");
  }
  // Corrupt or detached rows never authorize a vendor mutation.
  if ((expected.artistId == null) === (expected.venueId == null)) {
    throw new BookingMutationBoundaryError(409, "booking_changed");
  }
  if (expected.artistId != null) {
    const [artist] = await db
      .select({ userId: artists.userId })
      .from(artists)
      .where(eq(artists.id, expected.artistId))
      .limit(1);
    if (!artist || artist.userId !== actor.id) {
      throw new BookingMutationBoundaryError(403, "forbidden");
    }
    return;
  }
  const authorized = await authorizeVenueCapability(
    actor,
    expected.venueId!,
    access.venueCapability,
  );
  if (!authorized.ok) {
    throw new BookingMutationBoundaryError(
      authorized.status === 404 ? 404 : 403,
      authorized.status === 404 ? "booking_changed" : "forbidden",
    );
  }
}

async function assertLiveBookingVendor(
  executor: Executor,
  expected: BookingMutationRow,
  expectedVenueOrganizationId: number | null,
): Promise<void> {
  if (expected.artistId != null) {
    const [artist] = await executor
      .select({ isActive: artists.isActive, userId: artists.userId })
      .from(artists)
      .where(eq(artists.id, expected.artistId))
      .limit(1);
    if (!artist?.isActive || !artist.userId) {
      throw new BookingMutationBoundaryError(409, "booking_changed");
    }
    return;
  }

  if (expected.venueId != null) {
    const [venue] = await executor
      .select({
        isActive: venues.isActive,
        organizationId: venues.organizationId,
        userId: venues.userId,
      })
      .from(venues)
      .where(eq(venues.id, expected.venueId))
      .limit(1);
    if (
      !venue?.isActive
      || venue.organizationId !== expectedVenueOrganizationId
      || (venue.organizationId == null && venue.userId == null)
    ) {
      throw new BookingMutationBoundaryError(409, "booking_changed");
    }
    if (venue.organizationId != null) {
      const [organization] = await executor
        .select({ status: partnerOrganizations.status })
        .from(partnerOrganizations)
        .where(eq(partnerOrganizations.id, venue.organizationId))
        .for("update")
        .limit(1);
      if (
        !organization
        || !ORG_STATUSES_ALLOWING_ACCESS.includes(
          organization.status as (typeof ORG_STATUSES_ALLOWING_ACCESS)[number],
        )
      ) {
        throw new BookingMutationBoundaryError(409, "booking_changed");
      }
    }
    return;
  }

  throw new BookingMutationBoundaryError(409, "booking_changed");
}

/**
 * Security boundary for booking mutations whose authorization depends on a
 * live account, vendor ownership/membership and the booking tuple.
 *
 * Global order:
 * legal user/org advisory locks -> actor row -> optional availability ->
 * optional delivery barrier -> artist -> venue -> hall -> org/membership ->
 * booking row -> mutation/effects.
 *
 * Account erasure and membership writes own the same legal locks before user
 * rows. Vendor reparent/delete owns the same parent before its booking FK
 * action. The final tuple check converts every losing race into 409 rather
 * than authorizing from the route's optimistic snapshot.
 */
export async function withBookingMutationBoundary<T>(input: {
  clerkId: string;
  expected: BookingMutationRow;
  access: BookingMutationAccess;
  confirmationAvailability?: boolean;
  confirmationBarrier?: boolean;
  /** Client transitions which require a still-operable counterparty. */
  requireLiveVendor?: boolean;
  mutate: (context: {
    executor: Executor;
    booking: BookingMutationRow;
    actor: AppUser;
    principal: BookingMutationPrincipal;
  }) => Promise<T>;
}): Promise<T> {
  const [candidateActor] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.clerkId, input.clerkId))
    .limit(1);
  if (!candidateActor) {
    throw new BookingMutationBoundaryError(401, "unauthorized");
  }

  const expectedPrincipal: BookingMutationPrincipal =
    input.access.mode === "vendor"
      ? "vendor"
      : candidateActor.id === input.expected.clientUserId
        ? "client"
        : "vendor";
  await preflightMutationAccess(
    appUserFromRow(candidateActor),
    input.expected,
    input.access,
    expectedPrincipal,
  );

  const [expectedVenue] =
    input.expected.venueId != null
      ? await db
          .select({ organizationId: venues.organizationId })
          .from(venues)
          .where(eq(venues.id, input.expected.venueId))
          .limit(1)
      : [];
  const expectedVenueOrganizationId = expectedVenue?.organizationId ?? null;

  return db.transaction(async (tx) => {
    const executor = tx as unknown as Executor;
    await acquireLegalScopeLocks(tx, {
      userIds: [candidateActor.id],
      organizationIds:
        expectedVenueOrganizationId != null
          ? [expectedVenueOrganizationId]
          : [],
    });

    // Re-bind the external session to the same live application row while it
    // is locked. The optimistic lookup is only a legal-lock plan: a Clerk
    // projection change or account erasure may have committed while waiting.
    const [actorRow] = await executor
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(and(
        eq(users.id, candidateActor.id),
        eq(users.clerkId, input.clerkId),
      ))
      .for("update")
      .limit(1);
    if (!actorRow) {
      throw new BookingMutationBoundaryError(401, "unauthorized");
    }
    const actor = appUserFromRow(actorRow);

    // Booking creation also freezes this actor before taking artist/venue
    // availability locks. Hall, schedule and registration writers cannot
    // invert this edge because the shared legal user/org locks above already
    // serialize them with this transaction.
    if (input.confirmationAvailability) {
      await assertVendorAvailableForConfirmation(tx, input.expected);
    }

    if (input.confirmationBarrier) {
      // Dispatch permits use recipient user -> barrier. Take the barrier only
      // after the actor row so cancellation cannot invert that order.
      await acquireBookingConfirmationBarrier(executor, input.expected.id);
    }

    if (!(await lockConfirmationVendorParents(executor, input.expected))) {
      throw new BookingMutationBoundaryError(409, "booking_changed");
    }

    if (input.requireLiveVendor && expectedPrincipal === "client") {
      // Parent rows are already frozen. Account erasure leaves an inactive,
      // ownerless historical profile behind; it must not receive a new client
      // confirmation or counteroffer after the erasure wins.
      await assertLiveBookingVendor(
        executor,
        input.expected,
        expectedVenueOrganizationId,
      );
    }

    if (expectedPrincipal === "vendor") {
      if (input.access.mode === "client") {
        throw new BookingMutationBoundaryError(403, "forbidden");
      }
      await authorizeExpectedVendor(
        executor,
        actor,
        input.expected,
        input.access,
        expectedVenueOrganizationId,
      );
    } else if (input.access.mode === "vendor") {
      // Vendor-only transitions must never become client transitions merely
      // because they share the same route and booking row.
      throw new BookingMutationBoundaryError(403, "forbidden");
    }

    const [current] = await executor
      .select()
      .from(bookingRequests)
      .where(eq(bookingRequests.id, input.expected.id))
      .for("update")
      .limit(1);
    if (!current || !bookingMutationTupleMatches(current, input.expected)) {
      throw new BookingMutationBoundaryError(409, "booking_changed");
    }
    if (expectedPrincipal === "client" && current.clientUserId !== actor.id) {
      throw new BookingMutationBoundaryError(403, "forbidden");
    }

    return input.mutate({
      executor,
      booking: current,
      actor,
      principal: expectedPrincipal,
    });
  });
}
