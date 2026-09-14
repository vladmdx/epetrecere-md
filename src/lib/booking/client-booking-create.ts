import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  isValidBookingPhone,
  normalizeBookingPhone,
} from "@epetrecere/shared";
import { db } from "@/lib/db";
import {
  artists,
  bookingRequests,
  categories,
  eventPlans,
  offerRequests,
  partnerOrganizationMembers,
  partnerOrganizations,
  venues,
} from "@/lib/db/schema";
import { isMultiHallEnabled } from "@/lib/feature-flags";
import { ORG_STATUSES_ALLOWING_ACCESS } from "@/lib/venue-access";
import { acquireArtistAvailabilityLocks } from "./advisory-locks";
import { currentChisinauDate } from "./booking-create-date";
import {
  bookingCreationPayloadHash,
  bookingCreationScopeHash,
} from "./booking-create-idempotency";
import {
  type BookingCreationActor,
  type BookingCreationWriteResult,
  type BookingRequestWriteTx,
  withBookingRequestCreation,
} from "./booking-request-write";
import {
  findArtistPlanBookingConflict,
  findVenuePlanBookingConflict,
  PlanBookingConflictError,
} from "./plan-booking-constraints";
import {
  publicVenueReservationScope,
  withVenueAvailabilityWriteInTransaction,
} from "./venue-booking-write";
import type { AvailabilityResult } from "./availability";
import {
  AiBookingProposalError,
  consumeAiBookingProposal,
  verifyConsumedAiBookingProposalReplay,
} from "./ai-booking-proposal";
import {
  aiBookingPayloadFingerprint,
  buildAiBookingPayload,
} from "./ai-booking-payload";

export type ValidatedClientBookingInput = {
  artistId?: number;
  venueId?: number;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  eventDate: string;
  startTime?: string;
  endTime?: string;
  eventType?: string;
  guestCount?: number;
  message?: string;
  eventPlanId?: number;
  agreedPrice?: number;
  packageId?: number;
  hallId?: number;
  reservationScope?: "hall" | "venue";
};

export type CreateClientBookingRequestInput = {
  booking: ValidatedClientBookingInput;
  /** Trusted application user resolved from Clerk by the HTTP/AI adapter. */
  actorUserId: string | null;
  /** Raw Clerk id is hashed in-memory and is never persisted. */
  clerkId: string | null;
  /** Validated, lower-case UUID or null for legacy v1 behavior. */
  idempotencyKey: string | null;
  /** Optional AI constraint, revalidated under row locks in the transaction. */
  requiredArtistCategoryId?: number;
  /** Raw one-time proposal token; consumed atomically only by the AI adapter. */
  aiProposalToken?: string;
};

export class ArtistAvailabilityWriteError extends Error {
  readonly result: AvailabilityResult;

  constructor(result: AvailabilityResult) {
    super("artist_unavailable");
    this.name = "ArtistAvailabilityWriteError";
    this.result = result;
  }
}

/**
 * Deliberately does not distinguish a missing artist from an inactive one.
 * Both targets are unavailable to public and AI booking writers.
 */
export class BookingTargetUnavailableError extends Error {
  readonly status = 404;
  readonly code = "BOOKING_TARGET_NOT_FOUND";

  constructor() {
    super("Partenerul nu este disponibil.");
    this.name = "BookingTargetUnavailableError";
  }
}

export class BookingClientIdentityError extends Error {
  readonly status = 400;
  readonly code = "CLIENT_PHONE_REQUIRED";

  constructor() {
    super(
      "Adaugă un număr de telefon de contact valid înainte de a trimite rezervarea.",
    );
    this.name = "BookingClientIdentityError";
  }
}

export class BookingPartnerAccountError extends Error {
  readonly status = 403;

  constructor() {
    super(
      "Conturile de partener nu pot trimite cereri de rezervare. Folosește un cont de client.",
    );
    this.name = "BookingPartnerAccountError";
  }
}

export class BookingEventDateWriteError extends Error {
  readonly status = 400;
  readonly code = "EVENT_DATE_IN_PAST";

  constructor() {
    super("Event date cannot be in the past");
    this.name = "BookingEventDateWriteError";
  }
}

export class PublicVenueScopeWriteError extends Error {
  readonly code: "PUBLIC_VENUE_SCOPE_FORBIDDEN" | "HALL_REQUIRED";
  readonly status: number;

  constructor(result: {
    code: "PUBLIC_VENUE_SCOPE_FORBIDDEN" | "HALL_REQUIRED";
    status: number;
    error: string;
  }) {
    super(result.error);
    this.name = "PublicVenueScopeWriteError";
    this.code = result.code;
    this.status = result.status;
  }
}

async function assertClientBookingActor(
  tx: BookingRequestWriteTx,
  actor: BookingCreationActor | null,
): Promise<void> {
  if (!actor) return;
  if (actor.role === "admin" || actor.role === "super_admin") return;
  if (actor.role === "artist") throw new BookingPartnerAccountError();

  const [ownedArtist] = await tx
    .select({ id: artists.id })
    .from(artists)
    .where(eq(artists.userId, actor.id))
    .limit(1);
  if (ownedArtist) throw new BookingPartnerAccountError();

  const legacyFilter = isMultiHallEnabled()
    ? and(isNull(venues.organizationId), eq(venues.userId, actor.id))
    : eq(venues.userId, actor.id);
  const [legacyVenue] = await tx
    .select({ id: venues.id })
    .from(venues)
    .where(legacyFilter)
    .limit(1);
  if (legacyVenue) throw new BookingPartnerAccountError();

  if (!isMultiHallEnabled()) return;
  const [membership] = await tx
    .select({ id: partnerOrganizationMembers.id })
    .from(partnerOrganizationMembers)
    .innerJoin(
      partnerOrganizations,
      eq(partnerOrganizations.id, partnerOrganizationMembers.organizationId),
    )
    .where(
      and(
        eq(partnerOrganizationMembers.userId, actor.id),
        eq(partnerOrganizationMembers.isActive, true),
        inArray(partnerOrganizations.status, [...ORG_STATUSES_ALLOWING_ACCESS]),
      ),
    )
    .limit(1);
  if (membership) throw new BookingPartnerAccountError();
}

/**
 * Reusable transactional writer for the public HTTP route and authenticated
 * AI callers. Input must already have passed shape/date validation and contact
 * redaction. No external notification or e-mail is performed here.
 */
export async function createClientBookingRequest(
  input: CreateClientBookingRequestInput,
): Promise<BookingCreationWriteResult> {
  const publicScopeResult = input.booking.venueId
    ? publicVenueReservationScope({
        hallId: input.booking.hallId,
        reservationScope: input.booking.reservationScope,
      })
    : null;
  const publicScope = publicScopeResult?.ok ? publicScopeResult : null;

  type PreparedBookingCreation = {
    data: ValidatedClientBookingInput;
    clientUserId: string | null;
    actor: BookingCreationActor | null;
    proposalPayloadFingerprint: string;
  };

  const payloadHashInput = (data: ValidatedClientBookingInput) => ({
    artistId: data.artistId ?? null,
    venueId: data.venueId ?? null,
    eventPlanId: data.eventPlanId ?? null,
    // Stable request intent, not feature-flag-dependent resolution.
    hallId: data.venueId ? (data.hallId ?? null) : null,
    reservationScope: data.venueId
      ? (data.reservationScope ?? "hall" as const)
      : null,
    clientName: data.clientName,
    clientPhone: data.clientPhone,
    clientEmail: data.clientEmail ?? null,
    eventDate: data.eventDate,
    startTime: data.startTime ?? null,
    endTime: data.endTime ?? null,
    eventType: data.eventType ?? null,
    guestCount: data.guestCount ?? null,
    message: data.message ?? null,
    agreedPrice: data.agreedPrice ?? null,
    packageId: data.packageId ?? null,
  });

  if (
    input.aiProposalToken
    && (
      !input.actorUserId
      || !input.idempotencyKey
      || !input.booking.eventPlanId
      || !input.booking.artistId
      || !input.requiredArtistCategoryId
    )
  ) {
    throw new AiBookingProposalError("AI_PROPOSAL_MISMATCH");
  }

  return withBookingRequestCreation<PreparedBookingCreation>(
    {
      actorUserId: input.actorUserId,
      eventPlanId: input.booking.eventPlanId ?? null,
      idempotency: input.idempotencyKey
        ? {
            requestId: input.idempotencyKey,
            scopeHash: bookingCreationScopeHash(input.clerkId),
          }
        : null,
      prepare: (actor) => {
        if (!isValidBookingPhone(input.booking.clientPhone)) {
          throw new BookingClientIdentityError();
        }
        const data = {
          ...input.booking,
          clientName: actor?.name?.trim() || input.booking.clientName,
          clientEmail: actor?.email?.trim() || input.booking.clientEmail,
          // The contact number is explicit per-booking caller intent. The
          // account number only pre-fills clients; it does not overwrite an
          // edited callback number at the transactional boundary.
          clientPhone: normalizeBookingPhone(input.booking.clientPhone),
        };
        return {
          value: {
            data,
            clientUserId: actor?.id ?? null,
            actor,
            proposalPayloadFingerprint: bookingCreationPayloadHash(
              payloadHashInput(data),
            ),
          },
          payloadHash: bookingCreationPayloadHash(payloadHashInput(data), {
            serverManagedClientIdentity: actor != null,
          }),
        };
      },
      authorizeReplay: input.aiProposalToken
        ? async (tx, actor, _prepared, _payloadHash, existing) => {
            if (
              !actor
              || !input.idempotencyKey
              || !input.booking.eventPlanId
              || !input.booking.artistId
              || !input.requiredArtistCategoryId
            ) {
              throw new AiBookingProposalError("AI_PROPOSAL_MISMATCH");
            }
            await verifyConsumedAiBookingProposalReplay(tx, {
              token: input.aiProposalToken!,
              userId: actor.id,
              eventPlanId: input.booking.eventPlanId,
              artistId: input.booking.artistId,
              categoryId: input.requiredArtistCategoryId,
              actionId: input.idempotencyKey,
              booking: existing,
            });
            return "allow_payload_mismatch";
          }
        : undefined,
    },
    async (tx, prepared, creationIdentity) => {
      const { data, clientUserId, actor } = prepared;
      const executor = tx as unknown as typeof db;

      // The wrapper has already completed replay and locked an owned plan.
      if (data.eventDate < currentChisinauDate()) {
        throw new BookingEventDateWriteError();
      }
      await assertClientBookingActor(tx, actor);
      if (!isValidBookingPhone(data.clientPhone)) {
        throw new BookingClientIdentityError();
      }
      if (data.venueId && publicScopeResult && !publicScopeResult.ok) {
        throw new PublicVenueScopeWriteError(publicScopeResult);
      }

      if (data.eventPlanId && data.artistId) {
        const conflict = await findArtistPlanBookingConflict(
          executor,
          data.eventPlanId,
          data.artistId,
        );
        if (conflict) throw new PlanBookingConflictError(conflict);
      }
      if (data.eventPlanId && data.venueId) {
        const conflict = await findVenuePlanBookingConflict(
          executor,
          data.eventPlanId,
          data.venueId,
        );
        if (conflict) throw new PlanBookingConflictError(conflict);
      }

      const {
        eventPlanId: _eventPlanId,
        agreedPrice,
        packageId: _packageId,
        hallId: _hallId,
        reservationScope: _reservationScope,
        ...bookingBase
      } = data;

      const persistOffer = async (
        writeTx: BookingRequestWriteTx,
        booking: typeof bookingRequests.$inferSelect,
      ) => {
        await writeTx.insert(offerRequests).values({
          bookingRequestId: booking.id,
          artistId: data.artistId ?? null,
          venueId: data.venueId ?? null,
          clientName: data.clientName,
          clientPhone: data.clientPhone,
          clientEmail: data.clientEmail ?? null,
          eventType: data.eventType ?? null,
          eventDate: data.eventDate,
          message: data.message ?? null,
          status: "new",
        });
        return booking;
      };

      if (data.venueId && publicScope) {
        return withVenueAvailabilityWriteInTransaction(
          tx,
          {
            venueId: data.venueId,
            hallId: publicScope.hallId,
            guestCount: data.guestCount,
            eventDate: data.eventDate,
            startTime: data.startTime,
            endTime: data.endTime,
            reservationScope: publicScope.reservationScope,
            mode: "public",
          },
          async (availableTx, available) => {
            const [row] = await availableTx
              .insert(bookingRequests)
              .values({
                ...bookingBase,
                eventPlanId: data.eventPlanId ?? null,
                clientUserId,
                agreedPrice: agreedPrice ?? null,
                hallId: available.hallId,
                reservationScope: publicScope.reservationScope,
                startsAt: available.interval?.startsAt ?? null,
                endsAt: available.interval?.endsAt ?? null,
                timezone: available.interval?.timezone ?? null,
                creationScopeHash: creationIdentity.scopeHash,
                creationRequestId: creationIdentity.requestId,
                creationPayloadHash: creationIdentity.payloadHash,
                status: "pending",
              })
              .returning();
            if (!row) throw new Error("booking_insert_failed");
            return persistOffer(availableTx, row);
          },
        );
      }

      if (!data.artistId) throw new Error("booking_target_required");
      await acquireArtistAvailabilityLocks(tx, data.artistId, data.eventDate);

      // Availability alone is not an existence check: its empty-result path is
      // available=true. Freeze the target row and fail closed before inserting.
      const [targetArtist] = await tx
        .select({ id: artists.id, categoryIds: artists.categoryIds })
        .from(artists)
        .where(and(eq(artists.id, data.artistId), eq(artists.isActive, true)))
        .for("share")
        .limit(1);
      if (!targetArtist) throw new BookingTargetUnavailableError();

      if (input.requiredArtistCategoryId != null) {
        const requiredCategoryId = input.requiredArtistCategoryId;
        const [requiredCategory] = await tx
          .select({ id: categories.id })
          .from(categories)
          .where(
            and(
              eq(categories.id, requiredCategoryId),
              inArray(categories.type, ["artist", "service"]),
              eq(categories.isActive, true),
            ),
          )
          .for("share")
          .limit(1);
        if (
          !requiredCategory ||
          !(targetArtist.categoryIds ?? []).includes(requiredCategoryId)
        ) {
          throw new BookingTargetUnavailableError();
        }
      }

      // Parent rows are now locked in the same direction as their DELETE
      // paths (artist/category -> proposal). Only then consume the child
      // proposal. This avoids proposal -> parent deadlocks while preserving
      // rollback-safe, one-time authorization before availability/inserts.
      if (input.aiProposalToken) {
        if (
          !actor
          || !input.idempotencyKey
          || !data.eventPlanId
          || !data.artistId
          || !input.requiredArtistCategoryId
        ) {
          throw new AiBookingProposalError("AI_PROPOSAL_MISMATCH");
        }
        const [currentPlan] = await tx
          .select({
            id: eventPlans.id,
            title: eventPlans.title,
            eventType: eventPlans.eventType,
            eventDate: eventPlans.eventDate,
            guestCountTarget: eventPlans.guestCountTarget,
          })
          .from(eventPlans)
          .where(and(
            eq(eventPlans.id, data.eventPlanId),
            eq(eventPlans.userId, actor.id),
          ))
          .limit(1);
        const currentPayload = currentPlan
          ? buildAiBookingPayload({
              plan: currentPlan,
              actor,
              artistId: data.artistId,
            })
          : null;
        if (
          !currentPayload
          || aiBookingPayloadFingerprint(currentPayload)
            !== prepared.proposalPayloadFingerprint
        ) {
          throw new AiBookingProposalError("AI_PROPOSAL_MISMATCH");
        }
        await consumeAiBookingProposal(tx, {
          token: input.aiProposalToken,
          userId: actor.id,
          eventPlanId: data.eventPlanId,
          artistId: data.artistId,
          categoryId: input.requiredArtistCategoryId,
          payloadFingerprint: prepared.proposalPayloadFingerprint,
          actionId: input.idempotencyKey,
        });
      }

      const { checkArtistAvailability } = await import("./availability");
      const availability = await checkArtistAvailability({
        artistId: data.artistId,
        eventDate: data.eventDate,
        startTime: data.startTime,
        endTime: data.endTime,
        executor,
      });
      if (!availability.available) {
        throw new ArtistAvailabilityWriteError(availability);
      }

      const [row] = await tx
        .insert(bookingRequests)
        .values({
          ...bookingBase,
          eventPlanId: data.eventPlanId ?? null,
          clientUserId,
          agreedPrice: agreedPrice ?? null,
          hallId: null,
          reservationScope: null,
          startsAt: null,
          endsAt: null,
          timezone: null,
          creationScopeHash: creationIdentity.scopeHash,
          creationRequestId: creationIdentity.requestId,
          creationPayloadHash: creationIdentity.payloadHash,
          status: "pending",
        })
        .returning();
      if (!row) throw new Error("booking_insert_failed");
      return persistOffer(tx, row);
    },
  );
}
