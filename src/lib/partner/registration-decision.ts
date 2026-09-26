/**
 * Organization-aware partner registration queue and decisions.
 * Extra venues keep venues.user_id NULL; the queue and notifications
 * must follow the organization, not the legacy owner column.
 */
import { createHash } from "node:crypto";
import { venueApprovalNotice } from "./approval-notice";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  artists,
  bookingRequests,
  notifications,
  partnerOrganizations,
  users,
  venueHalls,
  venueImages,
  venues,
} from "@/lib/db/schema";
import { missingRegistrationDocuments } from "@/lib/legal/registration-gate";
import { isMultiHallEnabled } from "@/lib/feature-flags";
import { jsonIfOrganizationBackedVenueDisabled } from "./multi-hall-gate";
import { getLockedAppUserById, getVenueOwnerRecipients } from "@/lib/venue-access";
import { collectVenueReviewReadiness } from "./onboarding";
import { organizationHasValidContract } from "./legal";
import { validatePhone } from "@/lib/phone/validate";
import {
  acquireAvailabilityLocks,
  acquireLegalScopeLocks,
} from "@/lib/booking/advisory-locks";
import {
  captureVenueRegistrationSnapshot,
  loadLockedVenueRegistrationSnapshot,
  venueRegistrationHasPendingWork,
  venueRegistrationSnapshotMatches,
} from "./registration-state";

type ArtistDecisionResult =
  | {
      ok: true;
      artist: typeof artists.$inferSelect;
      emails: Array<{ userId: string; email: string | null }>;
    }
  | {
      ok: false;
      error: string;
      status: number;
      missing?: string[];
      code?: string;
    };

async function captureArtistDecisionSnapshot(artistId: number) {
  const [artist] = await db
    .select({
      id: artists.id,
      userId: artists.userId,
      rowVersion: sql<string>`xmin::text`,
    })
    .from(artists)
    .where(eq(artists.id, artistId))
    .limit(1);
  return artist ?? null;
}

async function decidePartnerArtist(
  adminUserId: string,
  artistId: number,
  action: "approve" | "reject",
): Promise<ArtistDecisionResult> {
  const expected = await captureArtistDecisionSnapshot(artistId);
  if (!expected) return { ok: false, error: "Artist not found", status: 404 };
  const decisionKey = createHash("sha256")
    .update(`${artistId}:${expected.rowVersion}`)
    .digest("hex")
    .slice(0, 24);

  const decided = await db.transaction(async (tx) => {
    const executor = tx as unknown as typeof db;
    const participantUserIds = [
      ...new Set([adminUserId, ...(expected.userId ? [expected.userId] : [])]),
    ].sort();
    await acquireLegalScopeLocks(tx, {
      userIds: participantUserIds,
    });

    // Every actor row precedes the vendor parent. Booking creation follows the
    // same user -> artist order, so a rejection cannot hold the artist while
    // waiting to demote its owner. UUID ordering also keeps overlapping admin
    // decisions deterministic.
    const lockedParticipants = await executor
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(inArray(users.id, participantUserIds))
      .orderBy(asc(users.id))
      .for("update");
    const lockedAdmin = lockedParticipants.find(({ id }) => id === adminUserId);
    if (
      !lockedAdmin
      || (lockedAdmin.role !== "admin" && lockedAdmin.role !== "super_admin")
    ) {
      return {
        ok: false as const,
        error: "Forbidden",
        status: 403,
        code: "FORBIDDEN",
      };
    }
    if (
      expected.userId
      && !lockedParticipants.some(({ id }) => id === expected.userId)
    ) {
      return {
        ok: false as const,
        error: "registration_changed",
        status: 409,
        code: "REGISTRATION_CHANGED",
      };
    }

    const [current] = await executor
      .select({
        artist: artists,
        rowVersion: sql<string>`xmin::text`,
      })
      .from(artists)
      .where(eq(artists.id, artistId))
      .for("update")
      .limit(1);
    if (!current) {
      return {
        ok: false as const,
        error: "registration_changed",
        status: 409,
        code: "REGISTRATION_CHANGED",
      };
    }
    if (
      current.rowVersion !== expected.rowVersion
      || current.artist.userId !== expected.userId
    ) {
      return {
        ok: false as const,
        error: "registration_changed",
        status: 409,
        code: "REGISTRATION_CHANGED",
      };
    }
    if (current.artist.isActive || !current.artist.userId) {
      return {
        ok: false as const,
        error: "registration_changed",
        status: 409,
        code: "NOT_PENDING",
      };
    }

    const ownerId = current.artist.userId;
    if (action === "approve") {
      const missing = await missingRegistrationDocuments(ownerId, "artist", executor);
      if (missing.length > 0) {
        return {
          ok: false as const,
          error: "current_signed_contract_required",
          status: 409,
          missing,
          code: "CONTRACT_REQUIRED",
        };
      }
      const [updated] = await executor
        .update(artists)
        .set({ isActive: true, updatedAt: new Date() })
        .where(and(eq(artists.id, artistId), eq(artists.isActive, false)))
        .returning();
      if (!updated) {
        return {
          ok: false as const,
          error: "registration_changed",
          status: 409,
          code: "REGISTRATION_CHANGED",
        };
      }
      await executor
        .insert(notifications)
        .values({
          userId: ownerId,
          type: "registration_approved",
          title: "Profilul tău a fost aprobat! 🎉",
          message: "Profilul tău este acum vizibil pe ePetrecere.md. Bine ai venit!",
          actionUrl: "/dashboard",
          dedupeKey: `registration_approved:artist:${artistId}:${decisionKey}:${ownerId}`,
        })
        .onConflictDoNothing();
      return {
        ok: true as const,
        artist: updated,
        emails: [{ userId: ownerId, email: updated.email }],
      };
    }

    await executor
      .update(users)
      .set({ role: "user", onboardingComplete: false, updatedAt: new Date() })
      .where(eq(users.id, ownerId));
    await executor
      .insert(notifications)
      .values({
        userId: ownerId,
        type: "registration_rejected",
        title: "Cererea ta a fost refuzată",
        message: "Profilul tău nu a fost aprobat. Contactează-ne dacă ai întrebări.",
        actionUrl: "/contact",
        dedupeKey: `registration_rejected:artist:${artistId}:${decisionKey}:${ownerId}`,
      })
      .onConflictDoNothing();
    // Rejection deletes the profile and lets artist_id become NULL. Preserve
    // the vendor identity first so historical/manual bookings and their
    // contracts cannot silently turn into venue bookings after the FK action.
    await executor
      .update(bookingRequests)
      .set({
        artistNameSnapshot: sql`COALESCE(NULLIF(BTRIM(${bookingRequests.artistNameSnapshot}), ''), ${current.artist.nameRo})`,
      })
      .where(eq(bookingRequests.artistId, artistId));
    const [deleted] = await executor
      .delete(artists)
      .where(and(eq(artists.id, artistId), eq(artists.isActive, false)))
      .returning();
    if (!deleted) {
      return {
        ok: false as const,
        error: "registration_changed",
        status: 409,
        code: "REGISTRATION_CHANGED",
      };
    }
    return {
      ok: true as const,
      artist: deleted,
      emails: [{ userId: ownerId, email: deleted.email }],
    };
  });

  return decided;
}

export function approvePartnerArtist(
  adminUserId: string,
  artistId: number,
): Promise<ArtistDecisionResult> {
  return decidePartnerArtist(adminUserId, artistId, "approve");
}

export function rejectPartnerArtist(
  adminUserId: string,
  artistId: number,
): Promise<ArtistDecisionResult> {
  return decidePartnerArtist(adminUserId, artistId, "reject");
}

const LEGACY_PENDING = and(
  isNull(venues.organizationId),
  sql`${venues.userId} IS NOT NULL`,
  eq(venues.isActive, false),
  sql`exists (
    select 1 from venue_halls vh
    where vh.venue_id = ${venues.id}
      and vh.is_legacy_default = true
      and vh.status = 'pending'
  )`,
);

const ORGANIZATION_PENDING_HALL = and(
  sql`${venues.organizationId} IS NOT NULL`,
  sql`exists (
    select 1 from venue_halls vh
    where vh.venue_id = ${venues.id}
      and vh.status = 'pending'
  )`,
);

// Under the expanded model, keep valid legacy submissions reviewable while
// rejecting ownerless orphan rows that merely carry a pending default hall.
const PENDING_HALL = or(ORGANIZATION_PENDING_HALL, LEGACY_PENDING);

const RECONCILABLE_ORGANIZATION_STATUSES = [
  "draft",
  "pending",
  "active",
  "rejected",
] as const;

function isReconciliableOrganizationStatus(status: string): boolean {
  return RECONCILABLE_ORGANIZATION_STATUSES.some((candidate) => candidate === status);
}

/** Recompute shared organization visibility after rejecting one venue. */
async function reconcileOrganizationAfterRejection(
  organizationId: number,
  executor: typeof db,
) {
  const [activeVenue] = await executor
    .select({ id: venues.id })
    .from(venues)
    .where(and(eq(venues.organizationId, organizationId), eq(venues.isActive, true)))
    .limit(1);
  const [pendingHall] = activeVenue
    ? []
    : await executor
        .select({ id: venueHalls.id })
        .from(venueHalls)
        .innerJoin(venues, eq(venues.id, venueHalls.venueId))
        .where(and(
          eq(venues.organizationId, organizationId),
          eq(venueHalls.status, "pending"),
        ))
        .limit(1);
  const status = activeVenue ? "active" : pendingHall ? "pending" : "rejected";
  await executor
    .update(partnerOrganizations)
    .set({ status, updatedAt: new Date() })
    .where(and(
      eq(partnerOrganizations.id, organizationId),
      inArray(partnerOrganizations.status, [...RECONCILABLE_ORGANIZATION_STATUSES]),
    ));
}

export async function listPendingPartnerVenues() {
  return db
    .select({
      id: venues.id,
      name: venues.nameRo,
      email: venues.email,
      phone: venues.phone,
      city: venues.city,
      address: venues.address,
      description: venues.descriptionRo,
      capacityMin: venues.capacityMin,
      capacityMax: venues.capacityMax,
      website: venues.website,
      menuUrl: venues.menuUrl,
      menuPdfUrl: venues.menuPdfUrl,
      virtualTourUrl: venues.virtualTourUrl,
      workingHours: venues.workingHours,
      lat: venues.lat,
      lng: venues.lng,
      createdAt: venues.createdAt,
      userId: venues.userId,
      organizationId: venues.organizationId,
      slug: venues.slug,
      isActive: venues.isActive,
    })
    .from(venues)
    // The kill switch must expose the old registration queue only. Once the
    // feature is enabled, pending halls from both models are reviewable.
    .where(isMultiHallEnabled() ? PENDING_HALL : LEGACY_PENDING)
    .orderBy(venues.createdAt);
}

async function collectLegacyApprovalMissing(
  venueId: number,
  executor: typeof db,
): Promise<string[]> {
  const [venue] = await executor
    .select({
      nameRo: venues.nameRo,
      phone: venues.phone,
      city: venues.city,
      address: venues.address,
    })
    .from(venues)
    .where(and(eq(venues.id, venueId), isNull(venues.organizationId)))
    .limit(1);
  if (!venue) return ["venue"];

  const missing: string[] = [];
  if (!venue.nameRo || venue.nameRo.trim().length < 2) missing.push("name");
  if (!venue.phone || !validatePhone(venue.phone).ok) missing.push("phone");
  if (!venue.city || venue.city.trim().length < 2) missing.push("city");
  if (!venue.address || venue.address.trim().length < 5) missing.push("address");
  const [image] = await executor
    .select({ id: venueImages.id })
    .from(venueImages)
    .where(and(eq(venueImages.venueId, venueId), isNull(venueImages.hallId)))
    .limit(1);
  if (!image) missing.push("imageUrls");
  return missing;
}

export async function approvePartnerVenue(
  adminUserId: string,
  venueId: number,
  selectedHallIds?: readonly number[],
): Promise<
  | { ok: true; venue: typeof venues.$inferSelect; emails: Array<{ userId: string; email: string | null }>; reviewedHallIds: number[]; remainingPendingHallCount: number; venueBecameActive: boolean }
  | { ok: false; error: string; status: number; missing?: string[]; code?: string }
> {
  const expected = await captureVenueRegistrationSnapshot(venueId);
  if (!expected) return { ok: false, error: "Venue not found", status: 404 };
  const blocked = jsonIfOrganizationBackedVenueDisabled(expected.venue.organizationId);
  if (blocked) {
    return { ok: false, error: "FEATURE_DISABLED", status: 404, code: "FEATURE_DISABLED" };
  }
  const dashboardPath = isMultiHallEnabled()
    ? `/dashboard/locatii/${venueId}`
    : "/dashboard/sala";
  const decisionKey = createHash("sha256").update(expected.token).digest("hex").slice(0, 24);

  const decided = await db.transaction(async (tx) => {
    const executor = tx as unknown as typeof db;
    await acquireLegalScopeLocks(tx, {
      userIds: [
        adminUserId,
        ...(expected.venue.organizationId == null && expected.venue.userId
          ? [expected.venue.userId]
          : []),
      ],
      organizationIds: expected.venue.organizationId == null
        ? []
        : [expected.venue.organizationId],
    });

    await acquireAvailabilityLocks(tx, {
      venueId,
      hallIds: [],
      localDates: [],
      conflictGroupIds: [],
    });

    const admin = await getLockedAppUserById(adminUserId, executor);
    if (!admin?.isGlobalAdmin) {
      return {
        kind: "error" as const,
        result: { ok: false as const, error: "Forbidden", status: 403, code: "FORBIDDEN" },
      };
    }
    const current = await loadLockedVenueRegistrationSnapshot(venueId, executor);
    if (!current) {
      return {
        kind: "error" as const,
        result: { ok: false as const, error: "Venue not found", status: 404 },
      };
    }
    if (!venueRegistrationSnapshotMatches(expected, current)) {
      return {
        kind: "error" as const,
        result: {
          ok: false as const,
          error: "registration_changed",
          status: 409,
          code: "REGISTRATION_CHANGED",
        },
      };
    }
    const currentBlocked = jsonIfOrganizationBackedVenueDisabled(current.venue.organizationId);
    if (currentBlocked) {
      return {
        kind: "error" as const,
        result: {
          ok: false as const,
          error: "FEATURE_DISABLED",
          status: 404,
          code: "FEATURE_DISABLED",
        },
      };
    }
    if (!venueRegistrationHasPendingWork(current)) {
      return {
        kind: "error" as const,
        result: { ok: false as const, error: "booking_changed", status: 409, code: "NOT_PENDING" },
      };
    }
    const pendingHallIds = current.halls
      .filter((hall) => hall.status === "pending" &&
        (current.venue.organizationId != null || hall.isLegacyDefault))
      .map((hall) => hall.id);
    const reviewedHallIds = selectedHallIds == null ? pendingHallIds : [...selectedHallIds];
    if (
      reviewedHallIds.length === 0 ||
      new Set(reviewedHallIds).size !== reviewedHallIds.length ||
      reviewedHallIds.some((id) => !pendingHallIds.includes(id)) ||
      (current.venue.organizationId == null && selectedHallIds != null)
    ) {
      return {
        kind: "error" as const,
        result: { ok: false as const, error: "hall_selection_invalid", status: 409, code: "HALL_SELECTION_INVALID" },
      };
    }
    if (
      current.venue.organizationId != null &&
      (!current.organization || !isReconciliableOrganizationStatus(current.organization.status))
    ) {
      return {
        kind: "error" as const,
        result: {
          ok: false as const,
          error: "ORGANIZATION_NOT_APPROVABLE",
          status: 409,
          code: "ORGANIZATION_NOT_APPROVABLE",
        },
      };
    }

    const missing = current.venue.organizationId == null
      ? await collectLegacyApprovalMissing(venueId, executor)
      : (await collectVenueReviewReadiness(venueId, executor, {
          mode: "approve", selectedHallIds: reviewedHallIds,
        })).missing.map((item) => item.path);
    if (missing.length) {
      return {
        kind: "error" as const,
        result: {
          ok: false as const,
          error: "ONBOARDING_INCOMPLETE",
          status: 400,
          missing,
        },
      };
    }
    if (current.venue.organizationId) {
      if (!(await organizationHasValidContract(current.venue.organizationId, executor))) {
        return {
          kind: "error" as const,
          result: {
            ok: false as const,
            error: "current_signed_contract_required",
            status: 409,
            missing: ["contract"],
          },
        };
      }
    } else if (current.venue.userId) {
      const missingDocs = await missingRegistrationDocuments(current.venue.userId, "venue", executor);
      if (missingDocs.length) {
        return {
          kind: "error" as const,
          result: {
            ok: false as const,
            error: "current_signed_contract_required",
            status: 409,
            missing: missingDocs,
          },
        };
      }
    }

    const [venue] = await executor
      .select()
      .from(venues)
      .where(eq(venues.id, venueId))
      .limit(1);
    if (!venue) {
      return {
        kind: "error" as const,
        result: { ok: false as const, error: "Venue not found", status: 404 },
      };
    }
    await tx
      .update(venueHalls)
      // Keep the submission-generation revision stable across approval. A
      // later rejection or content edit advances venueHalls.updatedAt.
      .set({ status: "active", reviewReason: null })
      .where(and(
        eq(venueHalls.venueId, venueId),
        eq(venueHalls.status, "pending"),
        inArray(venueHalls.id, reviewedHallIds),
        current.venue.organizationId == null
          ? eq(venueHalls.isLegacyDefault, true)
          : undefined,
      ));
    const approvedHalls = await executor
      .select({
        capacityMin: venueHalls.capacityMin,
        capacityMax: venueHalls.capacityMax,
      })
      .from(venueHalls)
      .where(and(
        eq(venueHalls.venueId, venueId),
        eq(venueHalls.status, "active"),
      ));
    const approvedMinimums = approvedHalls
      .map((hall) => hall.capacityMin)
      .filter((value): value is number => value != null);
    const approvedMaximums = approvedHalls
      .map((hall) => hall.capacityMax)
      .filter((value): value is number => value != null);
    if (current.venue.organizationId) {
      await tx
        .update(partnerOrganizations)
        .set({ status: "active", updatedAt: new Date() })
        .where(
          and(
            eq(partnerOrganizations.id, current.venue.organizationId),
            inArray(partnerOrganizations.status, ["draft", "pending", "rejected"]),
          ),
        );
    }
    const [row] = await tx
      .update(venues)
      .set({
        isActive: approvedHalls.length > 0,
        ...(approvedMinimums.length > 0
          ? { capacityMin: Math.min(...approvedMinimums) }
          : {}),
        ...(approvedMaximums.length > 0
          ? { capacityMax: Math.max(...approvedMaximums) }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(venues.id, venueId))
      .returning();
    if (!row) {
      return {
        kind: "error" as const,
        result: { ok: false as const, error: "Venue not found", status: 404 },
      };
    }
    const remainingPendingHallCount = current.halls.filter((hall) =>
      hall.status === "pending" && !reviewedHallIds.includes(hall.id)).length;
    const venueBecameActive = !current.venue.isActive && row.isActive;
    const recipients = await getVenueOwnerRecipients(venueId, executor);
    if (recipients.length) {
      await executor.insert(notifications).values(
        recipients.map((recipient) => ({
          userId: recipient.userId,
          type: "registration_approved" as const,
          ...venueApprovalNotice(venueBecameActive, reviewedHallIds.length, remainingPendingHallCount),
          actionUrl: dashboardPath,
          // A retry of the same decision is idempotent, while a genuine
          // reject -> resubmit -> approve cycle receives a fresh notice.
          dedupeKey: `registration_approved:${venueId}:${decisionKey}:${recipient.userId}`,
        })),
      ).onConflictDoNothing();
    }
    return { kind: "success" as const, venue: row, recipients, reviewedHallIds, remainingPendingHallCount, venueBecameActive };
  });

  if (decided.kind === "error") return decided.result;
  const updated = decided.venue;
  return { ok: true, venue: updated, emails: decided.recipients, reviewedHallIds: decided.reviewedHallIds, remainingPendingHallCount: decided.remainingPendingHallCount, venueBecameActive: decided.venueBecameActive };
}

export async function rejectPartnerVenue(
  adminUserId: string,
  venueId: number,
  selectedHallIds?: readonly number[],
  reviewReason?: string,
): Promise<
  | { ok: true; venue: typeof venues.$inferSelect; emails: Array<{ userId: string; email: string | null }>; reviewedHallIds: number[]; remainingPendingHallCount: number }
  | { ok: false; error: string; status: number; code?: string }
> {
  const expected = await captureVenueRegistrationSnapshot(venueId);
  if (!expected) return { ok: false, error: "Venue not found", status: 404 };
  const blocked = jsonIfOrganizationBackedVenueDisabled(expected.venue.organizationId);
  if (blocked) {
    return { ok: false, error: "FEATURE_DISABLED", status: 404, code: "FEATURE_DISABLED" };
  }
  const actionUrl = isMultiHallEnabled()
    ? `/dashboard/locatii/${venueId}`
    : "/dashboard/venue-onboarding";
  const decisionKey = createHash("sha256").update(expected.token).digest("hex").slice(0, 24);

  const decided = await db.transaction(async (tx) => {
    const executor = tx as unknown as typeof db;
    await acquireLegalScopeLocks(tx, {
      userIds: [
        adminUserId,
        ...(expected.venue.organizationId == null && expected.venue.userId
          ? [expected.venue.userId]
          : []),
      ],
      organizationIds: expected.venue.organizationId == null
        ? []
        : [expected.venue.organizationId],
    });

    await acquireAvailabilityLocks(tx, {
      venueId,
      hallIds: [],
      localDates: [],
      conflictGroupIds: [],
    });

    const admin = await getLockedAppUserById(adminUserId, executor);
    if (!admin?.isGlobalAdmin) {
      return {
        kind: "error" as const,
        result: { ok: false as const, error: "Forbidden", status: 403, code: "FORBIDDEN" },
      };
    }
    const current = await loadLockedVenueRegistrationSnapshot(venueId, executor);
    if (!current) {
      return {
        kind: "error" as const,
        result: { ok: false as const, error: "Venue not found", status: 404 },
      };
    }
    if (!venueRegistrationSnapshotMatches(expected, current)) {
      return {
        kind: "error" as const,
        result: {
          ok: false as const,
          error: "registration_changed",
          status: 409,
          code: "REGISTRATION_CHANGED",
        },
      };
    }
    const currentBlocked = jsonIfOrganizationBackedVenueDisabled(current.venue.organizationId);
    if (currentBlocked) {
      return {
        kind: "error" as const,
        result: {
          ok: false as const,
          error: "FEATURE_DISABLED",
          status: 404,
          code: "FEATURE_DISABLED",
        },
      };
    }
    if (!venueRegistrationHasPendingWork(current)) {
      return {
        kind: "error" as const,
        result: { ok: false as const, error: "booking_changed", status: 409, code: "NOT_PENDING" },
      };
    }
    const pendingHallIds = current.halls
      .filter((hall) => hall.status === "pending" &&
        (current.venue.organizationId != null || hall.isLegacyDefault))
      .map((hall) => hall.id);
    const reviewedHallIds = selectedHallIds == null ? pendingHallIds : [...selectedHallIds];
    if (
      reviewedHallIds.length === 0 ||
      new Set(reviewedHallIds).size !== reviewedHallIds.length ||
      reviewedHallIds.some((id) => !pendingHallIds.includes(id)) ||
      (current.venue.organizationId == null && selectedHallIds != null)
    ) {
      return {
        kind: "error" as const,
        result: { ok: false as const, error: "hall_selection_invalid", status: 409, code: "HALL_SELECTION_INVALID" },
      };
    }
    const effectiveReviewReason = current.venue.organizationId == null
      ? null
      : reviewReason?.trim() || "Sălile au fost refuzate; contactează echipa pentru detalii.";
    if (effectiveReviewReason && effectiveReviewReason.length > 1000) {
      return {
        kind: "error" as const,
        result: { ok: false as const, error: "review_reason_too_long", status: 400, code: "REVIEW_REASON_INVALID" },
      };
    }

    const [venue] = await executor
      .select()
      .from(venues)
      .where(eq(venues.id, venueId))
      .limit(1);
    if (!venue) {
      return {
        kind: "error" as const,
        result: { ok: false as const, error: "Venue not found", status: 404 },
      };
    }
    await tx
      .update(venueHalls)
      .set({ status: "rejected", reviewReason: effectiveReviewReason, updatedAt: new Date() })
      .where(and(
        eq(venueHalls.venueId, venueId),
        eq(venueHalls.status, "pending"),
        inArray(venueHalls.id, reviewedHallIds),
        current.venue.organizationId == null
          ? eq(venueHalls.isLegacyDefault, true)
          : undefined,
      ));
    const [activeHall] = await executor
      .select({ id: venueHalls.id })
      .from(venueHalls)
      .where(and(eq(venueHalls.venueId, venueId), eq(venueHalls.status, "active")))
      .limit(1);
    // An active venue is publishable only while at least one active hall
    // remains. This also repairs older/corrupt active-without-active-hall rows.
    const keepVenueActive = venue.isActive && Boolean(activeHall);
    const [row] = await tx
      .update(venues)
      .set({ isActive: keepVenueActive, updatedAt: new Date() })
      .where(eq(venues.id, venueId))
      .returning();
    if (!row) {
      return {
        kind: "error" as const,
        result: { ok: false as const, error: "Venue not found", status: 404 },
      };
    }
    if (current.venue.organizationId) {
      await reconcileOrganizationAfterRejection(current.venue.organizationId, executor);
    } else if (current.venue.userId) {
      // A rejected legacy registration remains editable, but is no longer a
      // pending request until the owner explicitly resubmits it.
      await executor
        .update(users)
        .set({ onboardingComplete: false, updatedAt: new Date() })
        .where(eq(users.id, current.venue.userId));
    }
    const remainingPendingHallCount = current.halls.filter((hall) =>
      hall.status === "pending" && !reviewedHallIds.includes(hall.id)).length;
    const recipients = await getVenueOwnerRecipients(venueId, executor);
    if (recipients.length) {
      await executor.insert(notifications).values(
        recipients.map((recipient) => ({
          userId: recipient.userId,
          type: "registration_rejected" as const,
          title: "Sălile selectate nu au fost aprobate",
          message: effectiveReviewReason
            ? `Motiv: ${effectiveReviewReason} Corectează sălile și retrimite-le; cele aprobate rămân active.`
            : "Corectează sala și retrimite cererea.",
          actionUrl,
          dedupeKey: `registration_rejected:${venueId}:${decisionKey}:${recipient.userId}`,
        })),
      ).onConflictDoNothing();
    }
    return { kind: "success" as const, venue: row, recipients, reviewedHallIds, remainingPendingHallCount };
  });

  if (decided.kind === "error") return decided.result;
  const updated = decided.venue;
  return { ok: true, venue: updated, emails: decided.recipients, reviewedHallIds: decided.reviewedHallIds, remainingPendingHallCount: decided.remainingPendingHallCount };
}
