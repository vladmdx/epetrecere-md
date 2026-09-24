/**
 * Idempotent partner onboarding: organization → venue → halls → submit.
 * Draft rows are the durable state; refresh/back/retry reuse them.
 * server-only.
 */
import { and, asc, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import {
  artists,
  bookingRequests,
  notifications,
  partnerOrganizationMembers,
  partnerOrganizations,
  users,
  venueHalls,
  venueImages,
  venues,
} from "@/lib/db/schema";
import { pickUniqueSlug } from "@/lib/utils/slugify";
import { isMultiHallEnabled } from "@/lib/feature-flags";
import {
  ORG_STATUSES_ALLOWING_ACCESS,
  authorizeOrganizationCapabilityLocked,
  getLockedAppUserById,
  type AppUser,
} from "@/lib/venue-access";
import { organizationHasAnyAcceptance, organizationHasValidContract } from "./legal";
import { organizationWriteCapability } from "./organization-write";
import {
  emptyToNull,
  organizationCreateSchema,
  organizationLegalIssues,
  organizationPatchSchema,
  validatePhoneOrError,
  venueDraftSchema,
  type MissingField,
} from "./validation";
import {
  acquireAvailabilityLocks,
  acquireLegalScopeLocks,
} from "@/lib/booking/advisory-locks";
import { localDateInZone } from "@/lib/booking/zoned-interval";
import {
  captureVenueRegistrationSnapshot,
  loadLockedVenueRegistrationSnapshot,
  type VenueRegistrationSnapshot,
  venueRegistrationSnapshotMatches,
} from "./registration-state";
import { writeUserPhoneLocked } from "@/lib/auth/user-phone";
import { hallReviewIssues } from "./hall-review";
import { enqueueRegistrationEmails } from "@/lib/notifications/registration-email";

export type OnboardingStep =
  | "organization"
  | "legal"
  | "contract"
  | "venue"
  | "hall"
  | "submit";

function slugCandidate(name: string): string {
  return name.trim() || "sala";
}

async function uniqueVenueSlug(
  name: string,
  excludeId?: number,
  executor: typeof db = db,
): Promise<string> {
  return pickUniqueSlug(slugCandidate(name), async (candidate) => {
    const [hit] = await executor
      .select({ id: venues.id })
      .from(venues)
      .where(eq(venues.slug, candidate))
      .limit(1);
    return !!hit && hit.id !== excludeId;
  });
}

export function isUsableHallStatus(status: string): boolean {
  return status === "active" || status === "pending";
}

export type OrganizationDraftInput = {
  displayName?: string;
  type?: "individual" | "sole_trader" | "company";
  legalName?: string | null;
  idNumber?: string | null;
  legalAddress?: string | null;
  billingEmail?: string | null;
  billingPhone?: string | null;
  bankDetails?: Record<string, unknown> | null;
};

export class OrganizationDraftUpdateError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
    this.name = "OrganizationDraftUpdateError";
  }
}

async function venueOnboardingAccountConflict(
  user: AppUser,
  executor: typeof db,
): Promise<"PRIVILEGED_ROLE_LOCKED" | "ROLE_CONFLICT" | null> {
  // Global administrators retain their existing administrative bypass. The
  // editor role is not a global admin and, like the role picker, cannot turn
  // itself into an organization owner through a direct API call.
  if (user.isGlobalAdmin) return null;
  if (user.role === "editor") return "PRIVILEGED_ROLE_LOCKED";
  if (user.role === "artist") return "ROLE_CONFLICT";
  const [artist] = await executor
    .select({ id: artists.id })
    .from(artists)
    .where(eq(artists.userId, user.id))
    .limit(1);
  return artist ? "ROLE_CONFLICT" : null;
}

async function organizationAllowsVenueWrites(
  organizationId: number,
  executor: typeof db,
): Promise<boolean> {
  const [organization] = await executor
    .select({ status: partnerOrganizations.status })
    .from(partnerOrganizations)
    .where(eq(partnerOrganizations.id, organizationId))
    .for("update")
    .limit(1);
  return Boolean(
    organization
    && ORG_STATUSES_ALLOWING_ACCESS.includes(
      organization.status as (typeof ORG_STATUSES_ALLOWING_ACCESS)[number],
    ),
  );
}

type OrganizationRow = typeof partnerOrganizations.$inferSelect;
type OrganizationPatch = ReturnType<typeof organizationPatchSchema.parse>;
type OrganizationPatchOutcome =
  | { kind: "updated"; organization: OrganizationRow }
  | { kind: "missing" }
  | { kind: "not_editable" }
  | { kind: "frozen" }
  | { kind: "phone_error"; message: string };

function organizationCreateValues(input?: OrganizationDraftInput) {
  return {
    type: input?.type ?? "company",
    displayName: input?.displayName?.trim() || "Organizație nouă",
    legalName: emptyToNull(input?.legalName),
    idNumber: emptyToNull(input?.idNumber),
    legalAddress: emptyToNull(input?.legalAddress),
    billingEmail: emptyToNull(input?.billingEmail),
    billingPhone: emptyToNull(input?.billingPhone),
    bankDetails: input?.bankDetails ?? null,
  };
}

async function reopenLegacyVenueForMultiHallOnboarding(
  executor: typeof db,
  venueId: number,
  userId: string | null,
): Promise<boolean> {
  // A kill-switch OFF submission can already be pending when it is first
  // attached after MULTI_HALL turns ON. Reopen only its generated
  // legacy-default hall: the multi-hall form must be able to add the now-
  // required capacity/details and submit a fresh review generation.
  const reopened = await executor
    .update(venueHalls)
    .set({ status: "draft", updatedAt: new Date() })
    .where(and(
      eq(venueHalls.venueId, venueId),
      eq(venueHalls.isLegacyDefault, true),
      eq(venueHalls.status, "pending"),
    ))
    .returning({ id: venueHalls.id });
  const [legacyHall] = await executor
    .select({ status: venueHalls.status })
    .from(venueHalls)
    .where(and(
      eq(venueHalls.venueId, venueId),
      eq(venueHalls.isLegacyDefault, true),
    ))
    .limit(1);
  // OFF-era rejection did not consistently reset this legacy user bit. Once
  // the venue is attached, check-role no longer has the organization-null
  // safety mask, so every non-active/no-Hall legacy state must remain in
  // onboarding until it is corrected and submitted again.
  if (userId && legacyHall?.status !== "active") {
    await executor
      .update(users)
      .set({ onboardingComplete: false, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }
  return reopened.length > 0;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function organizationCreatePayloadHash(input: OrganizationDraftInput): string {
  return createHash("sha256")
    .update(canonicalJson({ version: 1, ...organizationCreateValues(input) }))
    .digest("hex");
}

async function findOwnedReusableOrganizationIds(
  userId: string,
  executor: typeof db = db,
): Promise<number[]> {
  const memberships = await executor
    .select({ organizationId: partnerOrganizationMembers.organizationId })
    .from(partnerOrganizationMembers)
    .innerJoin(
      partnerOrganizations,
      eq(partnerOrganizations.id, partnerOrganizationMembers.organizationId),
    )
    .where(and(
      eq(partnerOrganizationMembers.userId, userId),
      eq(partnerOrganizationMembers.role, "owner"),
      eq(partnerOrganizationMembers.isActive, true),
      inArray(partnerOrganizations.status, ["draft", "rejected"]),
    ))
    .orderBy(asc(partnerOrganizations.id));
  return memberships.map((membership) => membership.organizationId);
}

async function loadOwnedReusableOrganization(
  userId: string,
  organizationId: number,
  executor: typeof db,
): Promise<OrganizationRow | null> {
  const [membership] = await executor
    .select({ organizationId: partnerOrganizationMembers.organizationId })
    .from(partnerOrganizationMembers)
    .innerJoin(
      partnerOrganizations,
      eq(partnerOrganizations.id, partnerOrganizationMembers.organizationId),
    )
    .where(and(
      eq(partnerOrganizationMembers.userId, userId),
      eq(partnerOrganizationMembers.organizationId, organizationId),
      eq(partnerOrganizationMembers.role, "owner"),
      eq(partnerOrganizationMembers.isActive, true),
      inArray(partnerOrganizations.status, ["draft", "rejected"]),
    ))
    .limit(1);
  if (!membership) return null;
  const [organization] = await executor
    .select()
    .from(partnerOrganizations)
    .where(eq(partnerOrganizations.id, organizationId))
    .for("update")
    .limit(1);
  return organization ?? null;
}

async function applyOrganizationPatchLocked(
  executor: typeof db,
  organizationId: number,
  data: OrganizationPatch,
  present: (key: string) => boolean,
  options: { allowedStatuses?: readonly string[] },
): Promise<OrganizationPatchOutcome> {
  const [current] = await executor
    .select()
    .from(partnerOrganizations)
    .where(eq(partnerOrganizations.id, organizationId))
    .for("update")
    .limit(1);
  if (!current) return { kind: "missing" };
  if (options.allowedStatuses && !options.allowedStatuses.includes(current.status)) {
    return { kind: "not_editable" };
  }

  const signed = await organizationHasAnyAcceptance(organizationId, executor);
  const nextType = present("type") ? data.type ?? current.type : current.type;
  const nextLegalName = present("legalName") ? emptyToNull(data.legalName) : current.legalName;
  const nextIdNumber = present("idNumber") ? emptyToNull(data.idNumber) : current.idNumber;
  const nextLegalAddress = present("legalAddress")
    ? emptyToNull(data.legalAddress)
    : current.legalAddress;
  if (
    signed &&
    (nextType !== current.type ||
      (nextLegalName ?? null) !== (current.legalName ?? null) ||
      (nextIdNumber ?? null) !== (current.idNumber ?? null) ||
      (nextLegalAddress ?? null) !== (current.legalAddress ?? null))
  ) {
    return { kind: "frozen" };
  }

  let billingPhone = data.billingPhone;
  if (present("billingPhone") && billingPhone) {
    const phone = validatePhoneOrError(billingPhone);
    if (!phone.ok) return { kind: "phone_error", message: phone.message };
    billingPhone = phone.e164;
  }

  const set: Partial<typeof partnerOrganizations.$inferInsert> = { updatedAt: new Date() };
  if (present("type") && data.type) set.type = data.type;
  if (present("displayName") && data.displayName) set.displayName = data.displayName;
  if (present("legalName")) set.legalName = emptyToNull(data.legalName);
  if (present("idNumber")) set.idNumber = emptyToNull(data.idNumber);
  if (present("legalAddress")) set.legalAddress = emptyToNull(data.legalAddress);
  if (present("billingEmail")) set.billingEmail = emptyToNull(data.billingEmail);
  if (present("billingPhone")) set.billingPhone = emptyToNull(billingPhone);
  if (present("bankDetails")) set.bankDetails = data.bankDetails ?? current.bankDetails;

  const [organization] = await executor
    .update(partnerOrganizations)
    .set(set)
    .where(eq(partnerOrganizations.id, organizationId))
    .returning();
  return organization ? { kind: "updated", organization } : { kind: "missing" };
}

function organizationPatchFailure(outcome: Exclude<OrganizationPatchOutcome, { kind: "updated" }>) {
  if (outcome.kind === "missing") {
    return { ok: false as const, error: "Not found", status: 404 as const };
  }
  if (outcome.kind === "not_editable") {
    return { ok: false as const, error: "ORGANIZATION_NOT_EDITABLE", status: 409 as const };
  }
  if (outcome.kind === "frozen") {
    return {
      ok: false as const,
      error: "LEGAL_HOLDER_CHANGE_REQUIRES_NEW_ORGANIZATION",
      status: 409 as const,
    };
  }
  return {
    ok: false as const,
    error: outcome.message,
    field: "billingPhone" as const,
    status: 400 as const,
  };
}

/**
 * Bootstrap/resume used only when a venue role is selected for the first time.
 * It never treats form input as a PATCH: one eligible OWNER draft is returned
 * byte-for-byte as persisted, zero creates one, and ambiguity is explicit.
 */
export async function bootstrapDraftOrganization(
  user: AppUser,
  input?: OrganizationDraftInput,
) {
  return db.transaction(async (tx) => {
    const executor = tx as unknown as typeof db;
    // Creating an owner membership is an authorization mutation too. Use the
    // same user-first lock order as signing, transfers and account deletion so
    // a stale request cannot grant ownership after the user was deleted.
    await acquireLegalScopeLocks(tx, { userIds: [user.id] });
    const currentUser = await getLockedAppUserById(user.id, executor);
    if (!currentUser) {
      throw new OrganizationDraftUpdateError("FORBIDDEN", 403);
    }
    const accountConflict = await venueOnboardingAccountConflict(currentUser, executor);
    if (accountConflict) {
      throw new OrganizationDraftUpdateError(accountConflict, 409);
    }

    const reusableIds = await findOwnedReusableOrganizationIds(currentUser.id, executor);
    if (reusableIds.length > 1) {
      throw new OrganizationDraftUpdateError("ORGANIZATION_SELECTION_REQUIRED", 409);
    }
    const reusableId = reusableIds[0];
    if (reusableId != null) {
      await acquireLegalScopeLocks(tx, { organizationIds: [reusableId] });
      const reusable = await loadOwnedReusableOrganization(
        currentUser.id,
        reusableId,
        executor,
      );
      if (reusable) {
        return reusable;
      }
    }

    const values = organizationCreateValues(input);
    const [created] = await executor
      .insert(partnerOrganizations)
      .values({
        ...values,
        status: "draft",
      })
      .returning();
    await acquireLegalScopeLocks(tx, { organizationIds: [created.id] });
    await executor.insert(partnerOrganizationMembers).values({
      organizationId: created.id,
      userId: currentUser.id,
      role: "owner",
      isActive: true,
    });
    return created;
  });
}

/** Backwards-compatible name; intentionally has bootstrap/resume semantics. */
export const ensureDraftOrganization = bootstrapDraftOrganization;

/**
 * Explicit, keyed organization creation. The stored hash represents the
 * normalized original POST payload and is never recomputed from mutable
 * profile columns, so a retry still resolves after the profile was edited.
 * `creationActorUserId` scopes idempotency only; membership is the authority.
 */
export async function createDraftOrganization(user: AppUser, raw: unknown) {
  const parsed = organizationCreateSchema.safeParse(raw);
  if (!parsed.success) {
    throw new OrganizationDraftUpdateError("Validation failed", 400);
  }

  const { organizationCreateRequestId, ...profile } = parsed.data;
  if (profile.billingPhone) {
    const phone = validatePhoneOrError(profile.billingPhone);
    if (!phone.ok) {
      throw new OrganizationDraftUpdateError(phone.message, 400);
    }
    profile.billingPhone = phone.e164;
  }
  const values = organizationCreateValues(profile);
  const creationRequestHash = organizationCreatePayloadHash(values);

  return db.transaction(async (tx) => {
    const executor = tx as unknown as typeof db;
    await acquireLegalScopeLocks(tx, { userIds: [user.id] });
    const currentUser = await getLockedAppUserById(user.id, executor);
    if (!currentUser) {
      throw new OrganizationDraftUpdateError("FORBIDDEN", 403);
    }
    const accountConflict = await venueOnboardingAccountConflict(currentUser, executor);
    if (accountConflict) {
      throw new OrganizationDraftUpdateError(accountConflict, 409);
    }

    const resolvePrior = async () => {
      // Discover the row id without a row lock, then enter the canonical
      // user -> organization advisory-lock order before locking either the
      // organization or its authority proof. The actor/key is only a replay
      // scope: it never grants access by itself.
      const [candidate] = await executor
        .select({ id: partnerOrganizations.id })
        .from(partnerOrganizations)
        .where(and(
          eq(partnerOrganizations.creationActorUserId, currentUser.id),
          eq(partnerOrganizations.creationRequestId, organizationCreateRequestId),
        ))
        .limit(1);
      if (!candidate) return null;

      await acquireLegalScopeLocks(tx, { organizationIds: [candidate.id] });
      const [prior] = await executor
        .select()
        .from(partnerOrganizations)
        .where(and(
          eq(partnerOrganizations.id, candidate.id),
          eq(partnerOrganizations.creationActorUserId, currentUser.id),
          eq(partnerOrganizations.creationRequestId, organizationCreateRequestId),
        ))
        .for("update")
        .limit(1);
      if (!prior) return null;
      if (!ORG_STATUSES_ALLOWING_ACCESS.includes(
        prior.status as (typeof ORG_STATUSES_ALLOWING_ACCESS)[number],
      )) {
        throw new OrganizationDraftUpdateError("FORBIDDEN", 403);
      }

      const [liveOwner] = await executor
        .select({ id: partnerOrganizationMembers.id })
        .from(partnerOrganizationMembers)
        .where(and(
          eq(partnerOrganizationMembers.organizationId, prior.id),
          eq(partnerOrganizationMembers.userId, currentUser.id),
          eq(partnerOrganizationMembers.role, "owner"),
          eq(partnerOrganizationMembers.isActive, true),
        ))
        .for("update")
        .limit(1);
      if (!liveOwner) {
        throw new OrganizationDraftUpdateError("FORBIDDEN", 403);
      }
      if (prior.creationRequestHash !== creationRequestHash) {
        throw new OrganizationDraftUpdateError("IDEMPOTENCY_KEY_REUSED", 409);
      }
      return prior;
    };

    const prior = await resolvePrior();
    if (prior) return prior;

    const [created] = await executor
      .insert(partnerOrganizations)
      .values({
        ...values,
        creationActorUserId: currentUser.id,
        creationRequestId: organizationCreateRequestId,
        creationRequestHash,
        status: "draft",
      })
      // The user lock serializes current writers. The unique index plus this
      // conflict-safe retry also covers a rolling deployment or lost response.
      .onConflictDoNothing()
      .returning();
    if (!created) {
      const concurrent = await resolvePrior();
      if (concurrent) return concurrent;
      throw new OrganizationDraftUpdateError("ORGANIZATION_CREATE_CONFLICT", 409);
    }

    await acquireLegalScopeLocks(tx, { organizationIds: [created.id] });
    await executor.insert(partnerOrganizationMembers).values({
      organizationId: created.id,
      userId: currentUser.id,
      role: "owner",
      isActive: true,
    });
    return created;
  });
}

export async function saveOrganizationProfile(
  user: AppUser,
  organizationId: number,
  raw: unknown,
  options: { allowedStatuses?: readonly string[] } = {},
) {
  const record = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
  const parsed = organizationPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: "Validation failed", details: parsed.error.issues };
  }
  const data = parsed.data;
  const present = (key: string) => Object.prototype.hasOwnProperty.call(record, key);
  const capability = organizationWriteCapability(raw);
  const updated = await db.transaction(async (tx) => {
    const executor = tx as unknown as typeof db;
    await acquireLegalScopeLocks(tx, {
      userIds: [user.id],
      organizationIds: [organizationId],
    });
    const currentUser = await getLockedAppUserById(user.id, executor);
    if (!currentUser) return { kind: "forbidden" as const };
    const access = await authorizeOrganizationCapabilityLocked(
      currentUser,
      organizationId,
      capability,
      executor,
    );
    if (!access.ok) return { kind: "forbidden" as const };
    const outcome = await applyOrganizationPatchLocked(
      executor,
      organizationId,
      data,
      present,
      options,
    );
    return { kind: "authorized" as const, outcome, role: access.role };
  });

  if (updated.kind === "forbidden") {
    return {
      ok: false as const,
      code: "FORBIDDEN" as const,
      error: "Forbidden",
      status: 403 as const,
    };
  }
  if (updated.outcome.kind !== "updated") {
    return organizationPatchFailure(updated.outcome);
  }
  return {
    ok: true as const,
    organization: updated.outcome.organization,
    role: updated.role,
  };
}

export async function saveVenueDraft(user: AppUser, raw: unknown) {
  const parsed = venueDraftSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: "Validation failed", details: parsed.error.issues, status: 400 as const };
  }
  const data = parsed.data;
  const phone = validatePhoneOrError(data.phone);
  if (!phone.ok) {
    return { ok: false as const, error: phone.message, field: "phone", status: 400 as const };
  }

  const multiHallEnabled = isMultiHallEnabled();
  const optionalUrl = (value?: string | null) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  };

  const createIntent = data.createIntent === true;
  const createRequestId = createIntent ? data.createRequestId ?? null : null;
  const imageUrls = data.imageUrls ?? [];
  const creationPayloadHash = createIntent
    ? createHash("sha256")
        .update(JSON.stringify({
          version: 1,
          organizationId: data.organizationId,
          nameRo: data.name,
          nameRu: emptyToNull(data.nameRu),
          nameEn: emptyToNull(data.nameEn),
          descriptionRo: emptyToNull(data.descriptionRo),
          descriptionRu: emptyToNull(data.descriptionRu),
          descriptionEn: emptyToNull(data.descriptionEn),
          phone: phone.e164,
          email: emptyToNull(data.email),
          city: data.city,
          address: data.address,
          lat: data.lat ?? null,
          lng: data.lng ?? null,
          website: optionalUrl(data.websiteUrl),
          menuUrl: optionalUrl(data.menuUrl),
          menuPdfUrl: optionalUrl(data.menuPdfUrl),
          virtualTourUrl: optionalUrl(data.virtualTourUrl),
          workingHours: data.workingHours ?? null,
          imageUrls,
        }))
        .digest("hex")
    : null;
  const saved = await db.transaction(async (tx) => {
    const executor = tx as unknown as typeof db;

    // Membership mutations use this same user → organization lock order.
    // Re-authorizing inside the lock prevents a removed/demoted member from
    // finishing a draft write with authority captured before the removal.
    await acquireLegalScopeLocks(tx, {
      userIds: [user.id],
      organizationIds: [data.organizationId],
    });
    const currentUser = await getLockedAppUserById(user.id, executor);
    if (!currentUser) {
      return { ok: false as const, error: "Forbidden", status: 403 as const };
    }
    const accountConflict = await venueOnboardingAccountConflict(currentUser, executor);
    if (accountConflict) {
      return {
        ok: false as const,
        code: accountConflict,
        error: accountConflict === "ROLE_CONFLICT"
          ? "Rolul contului este deja stabilit. Folosește un cont separat pentru alt tip de profil."
          : "Conturile editor nu pot crea sau modifica profiluri de local.",
        status: 409 as const,
      };
    }
    if (!multiHallEnabled) {
      const phoneWrite = await writeUserPhoneLocked(
        executor,
        currentUser.id,
        phone.e164,
      );
      if (!phoneWrite.ok) {
        return {
          ok: false as const,
          code: phoneWrite.code === "PHONE_IN_USE"
            ? "phone_in_use" as const
            : "USER_NOT_FOUND" as const,
          error: phoneWrite.code === "PHONE_IN_USE"
            ? "Acest număr de telefon este deja folosit de un alt cont."
            : "User not found",
          field: "phone",
          status: phoneWrite.code === "PHONE_IN_USE" ? 409 as const : 404 as const,
        };
      }
    }
    if (!(await organizationAllowsVenueWrites(data.organizationId, executor))) {
      return {
        ok: false as const,
        code: "ORGANIZATION_NOT_EDITABLE" as const,
        error: "ORGANIZATION_NOT_EDITABLE",
        status: 409 as const,
      };
    }
    if (multiHallEnabled) {
      const organizationAccess = await authorizeOrganizationCapabilityLocked(
        currentUser,
        data.organizationId,
        "manage_venues",
        executor,
      );
      if (!organizationAccess.ok) {
        return { ok: false as const, error: "Forbidden", status: 403 as const };
      }
    }

    const resolvePriorSubmission = async () => {
      if (!createIntent || !createRequestId || !creationPayloadHash) return null;
      const [priorSubmission] = await executor
        .select()
        .from(venues)
        .where(and(
          eq(venues.organizationId, data.organizationId),
          eq(venues.onboardingSubmissionId, createRequestId),
        ))
        .limit(1);
      if (!priorSubmission) return null;
      if (priorSubmission.onboardingSubmissionHash !== creationPayloadHash) {
        return {
          ok: false as const,
          code: "IDEMPOTENCY_KEY_REUSED" as const,
          error: "IDEMPOTENCY_KEY_REUSED",
          status: 409 as const,
        };
      }
      return { ok: true as const, venue: priorSubmission, reopenedLegacyHall: false };
    };

    if (createIntent) {
      // venueDraftSchema requires the UUID, but retain a defensive runtime
      // check because this is the durable write boundary.
      if (!createRequestId || !creationPayloadHash) {
        return {
          ok: false as const,
          error: "Validation failed",
          status: 400 as const,
        };
      }
      const priorSubmission = await resolvePriorSubmission();
      if (priorSubmission) {
        return priorSubmission;
      }
    }

    let existing: typeof venues.$inferSelect | undefined;
    if (data.venueId) {
      [existing] = await executor
        .select()
        .from(venues)
        .where(eq(venues.id, data.venueId))
        .for("update")
        .limit(1);
    } else if (!createIntent) {
      // user_id remains unique during the expand phase. If it points at an
      // organization-backed venue, the checks below still require the exact
      // organization and (with the flag on) a live capability.
      [existing] = await executor
        .select()
        .from(venues)
        .where(eq(venues.userId, currentUser.id))
        .for("update")
        .limit(1);
    }

    if (existing) {
      const attachingLegacyVenue = existing.organizationId == null;
      if (existing.organizationId != null && existing.organizationId !== data.organizationId) {
        return { ok: false as const, error: "Forbidden", status: 403 as const };
      }
      if (
        existing.organizationId == null &&
        !currentUser.isGlobalAdmin &&
        existing.userId !== currentUser.id
      ) {
        return { ok: false as const, error: "Forbidden", status: 403 as const };
      }
      if (
        !multiHallEnabled &&
        existing.organizationId != null &&
        !currentUser.isGlobalAdmin &&
        existing.userId !== currentUser.id
      ) {
        return { ok: false as const, error: "Forbidden", status: 403 as const };
      }

      // The ownership/organization predicate belongs in the UPDATE itself,
      // not only in the preceding SELECT. A forged id or a row changed while
      // the request was waiting therefore updates zero rows instead of being
      // attached to the caller's organization.
      const ownershipCondition = existing.organizationId == null
        ? currentUser.isGlobalAdmin
          ? and(eq(venues.id, existing.id), isNull(venues.organizationId))
          : and(
              eq(venues.id, existing.id),
              isNull(venues.organizationId),
              eq(venues.userId, currentUser.id),
            )
        : multiHallEnabled || currentUser.isGlobalAdmin
          ? and(
              eq(venues.id, existing.id),
              eq(venues.organizationId, data.organizationId),
            )
          : and(
              eq(venues.id, existing.id),
              eq(venues.organizationId, data.organizationId),
              eq(venues.userId, currentUser.id),
            );
      const [updated] = await executor
        .update(venues)
        .set({
          organizationId: existing.organizationId ?? data.organizationId,
          nameRo: data.name,
          nameRu: data.nameRu === undefined ? existing.nameRu : emptyToNull(data.nameRu),
          nameEn: data.nameEn === undefined ? existing.nameEn : emptyToNull(data.nameEn),
          descriptionRo: data.descriptionRo === undefined
            ? existing.descriptionRo
            : emptyToNull(data.descriptionRo),
          descriptionRu: data.descriptionRu === undefined
            ? existing.descriptionRu
            : emptyToNull(data.descriptionRu),
          descriptionEn: data.descriptionEn === undefined
            ? existing.descriptionEn
            : emptyToNull(data.descriptionEn),
          phone: phone.e164,
          email: data.email === undefined ? existing.email : emptyToNull(data.email),
          city: data.city,
          address: data.address,
          lat: data.lat ?? existing.lat,
          lng: data.lng ?? existing.lng,
          website: data.websiteUrl === undefined ? existing.website : optionalUrl(data.websiteUrl),
          menuUrl: data.menuUrl === undefined ? existing.menuUrl : optionalUrl(data.menuUrl),
          menuPdfUrl: data.menuPdfUrl === undefined ? existing.menuPdfUrl : optionalUrl(data.menuPdfUrl),
          virtualTourUrl: data.virtualTourUrl === undefined
            ? existing.virtualTourUrl
            : optionalUrl(data.virtualTourUrl),
          workingHours: data.workingHours ?? existing.workingHours,
          updatedAt: new Date(),
        })
        .where(ownershipCondition)
        .returning();
      if (!updated) {
        return { ok: false as const, error: "Forbidden", status: 403 as const };
      }
      const reopenedLegacyHall = attachingLegacyVenue
        ? await reopenLegacyVenueForMultiHallOnboarding(
          executor,
          updated.id,
          existing.userId,
        )
        : false;
      if (data.imageUrls !== undefined) {
        await replaceVenueImages(updated.id, null, imageUrls, executor);
      }
      return { ok: true as const, venue: updated, reopenedLegacyHall };
    }

    if (data.venueId) {
      // Do not turn a stale/forged explicit id into an implicit create.
      return { ok: false as const, error: "Forbidden", status: 403 as const };
    }

    // The slug is globally unique. Different users/organizations do not share
    // a legal-scope lock, so SELECT-then-INSERT alone can still race. Insert
    // with ON CONFLICT DO NOTHING and re-evaluate the candidate in a bounded
    // loop; PostgreSQL keeps the transaction usable and RETURNING tells us
    // which contender won without catching 23505 in an aborted transaction.
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const owned = createIntent
        ? undefined
        : (await executor
            .select({ id: venues.id })
            .from(venues)
            .where(eq(venues.userId, currentUser.id))
            .limit(1))[0];
      const slug = await uniqueVenueSlug(data.name, undefined, executor);
      const [created] = await executor
        .insert(venues)
        .values({
          // Explicit "Add venue" rows are organization-owned only. The
          // legacy user pointer belongs solely to the role-picker stub/legacy
          // first-venue path and must never grant one co-owner a back door to
          // an additional venue in the same organization.
          userId: createIntent ? null : owned ? null : currentUser.id,
          organizationId: data.organizationId,
          onboardingSubmissionId: createRequestId,
          onboardingSubmissionHash: creationPayloadHash,
          nameRo: data.name,
          nameRu: emptyToNull(data.nameRu),
          nameEn: emptyToNull(data.nameEn),
          descriptionRo: emptyToNull(data.descriptionRo),
          descriptionRu: emptyToNull(data.descriptionRu),
          descriptionEn: emptyToNull(data.descriptionEn),
          slug,
          phone: phone.e164,
          email: emptyToNull(data.email),
          city: data.city,
          address: data.address,
          lat: data.lat ?? null,
          lng: data.lng ?? null,
          website: optionalUrl(data.websiteUrl),
          menuUrl: optionalUrl(data.menuUrl),
          menuPdfUrl: optionalUrl(data.menuPdfUrl),
          virtualTourUrl: optionalUrl(data.virtualTourUrl),
          workingHours: data.workingHours ?? null,
          isActive: false,
          isFeatured: true,
          facilities: [],
        })
        .onConflictDoNothing()
        .returning();
      if (created) {
        await replaceVenueImages(created.id, null, imageUrls, executor);
        return { ok: true as const, venue: created, reopenedLegacyHall: false };
      }

      // An empty RETURNING can also mean the organization-scoped idempotency
      // index won in another request. Recover that exact row (or reject a key
      // reused with another payload) before trying a new slug.
      const priorSubmission = await resolvePriorSubmission();
      if (priorSubmission) return priorSubmission;
    }

    return {
      ok: false as const,
      code: "VENUE_CREATE_CONFLICT" as const,
      error: "VENUE_CREATE_CONFLICT",
      status: 409 as const,
    };
  });

  return saved;
}

/**
 * Attach the legacy venue stub created by the role picker to an organization.
 * Organization-backed venues are verification-only here: they can never be
 * reparented through the stale legacy `venues.user_id` column.
 */
export async function attachVenueRoleDraftToOrganization(
  user: AppUser,
  venueId: number,
  organizationId: number,
) {
  if (
    !Number.isInteger(venueId) ||
    venueId <= 0 ||
    !Number.isInteger(organizationId) ||
    organizationId <= 0
  ) {
    return { ok: false as const, error: "Forbidden", status: 403 as const };
  }

  return db.transaction(async (tx) => {
    const executor = tx as unknown as typeof db;
    await acquireLegalScopeLocks(tx, {
      userIds: [user.id],
      organizationIds: [organizationId],
    });
    const currentUser = await getLockedAppUserById(user.id, executor);
    if (!currentUser) {
      return { ok: false as const, error: "Forbidden", status: 403 as const };
    }
    const accountConflict = await venueOnboardingAccountConflict(currentUser, executor);
    if (accountConflict) {
      return { ok: false as const, error: accountConflict, status: 409 as const };
    }
    if (!(await organizationAllowsVenueWrites(organizationId, executor))) {
      return {
        ok: false as const,
        error: "ORGANIZATION_NOT_EDITABLE",
        status: 409 as const,
      };
    }

    const [existing] = await executor
      .select({
        id: venues.id,
        userId: venues.userId,
        organizationId: venues.organizationId,
      })
      .from(venues)
      .where(eq(venues.id, venueId))
      .for("update")
      .limit(1);
    if (!existing) {
      return { ok: false as const, error: "Forbidden", status: 403 as const };
    }

    if (existing.organizationId != null && existing.organizationId !== organizationId) {
      return { ok: false as const, error: "Forbidden", status: 403 as const };
    }
    if (
      existing.organizationId == null &&
      !currentUser.isGlobalAdmin &&
      existing.userId !== currentUser.id
    ) {
      return { ok: false as const, error: "Forbidden", status: 403 as const };
    }

    const access = await authorizeOrganizationCapabilityLocked(
      currentUser,
      organizationId,
      "manage_venues",
      executor,
    );
    if (!access.ok) {
      return { ok: false as const, error: "Forbidden", status: 403 as const };
    }

    if (existing.organizationId != null) {
      // Already attached to this exact organization. Live authorization was
      // checked above; importantly, no UPDATE can move it anywhere else.
      return { ok: true as const, venueId: existing.id, organizationId };
    }

    const ownershipCondition = currentUser.isGlobalAdmin
      ? and(eq(venues.id, existing.id), isNull(venues.organizationId))
      : and(
          eq(venues.id, existing.id),
          isNull(venues.organizationId),
          eq(venues.userId, currentUser.id),
        );
    const [attached] = await executor
      .update(venues)
      .set({ organizationId, updatedAt: new Date() })
      .where(ownershipCondition)
      .returning({ id: venues.id });
    if (!attached) {
      return { ok: false as const, error: "Forbidden", status: 403 as const };
    }
    const reopenedLegacyHall = await reopenLegacyVenueForMultiHallOnboarding(
      executor,
      attached.id,
      existing.userId,
    );
    return {
      ok: true as const,
      venueId: attached.id,
      organizationId,
      reopenedLegacyHall,
    };
  });
}

export async function replaceVenueImages(
  venueId: number,
  hallId: number | null,
  urls: string[],
  executor: typeof db = db,
) {
  const existing = await executor
    .select({ id: venueImages.id, hallId: venueImages.hallId, url: venueImages.url })
    .from(venueImages)
    .where(eq(venueImages.venueId, venueId))
    .orderBy(asc(venueImages.sortOrder), asc(venueImages.id))
    .for("update");
  const scoped = existing.filter((row) => (row.hallId ?? null) === hallId);

  // Reconcile by URL instead of deleting the complete gallery. Existing IDs
  // and translated alt text remain intact for retained images, while order
  // and cover status follow the explicit client list.
  if (hallId == null && scoped.length > 0) {
    await executor
      .update(venueImages)
      .set({ isCover: false })
      .where(and(eq(venueImages.venueId, venueId), isNull(venueImages.hallId)));
  }
  const availableByUrl = new Map<string, typeof scoped>();
  for (const row of scoped) {
    availableByUrl.set(row.url, [...(availableByUrl.get(row.url) ?? []), row]);
  }
  const retainedIds: number[] = [];
  for (const [sortOrder, url] of urls.entries()) {
    const candidates = availableByUrl.get(url) ?? [];
    const retained = candidates.shift();
    availableByUrl.set(url, candidates);
    if (retained) {
      retainedIds.push(retained.id);
      await executor
        .update(venueImages)
        .set({ sortOrder, isCover: hallId == null && sortOrder === 0 })
        .where(eq(venueImages.id, retained.id));
      continue;
    }
    await executor.insert(venueImages).values({
      venueId,
      hallId,
      url,
      sortOrder,
      isCover: hallId == null && sortOrder === 0,
    });
  }
  const toRemove = scoped.filter((row) => !retainedIds.includes(row.id));
  if (toRemove.length) {
    await executor
      .delete(venueImages)
      .where(inArray(venueImages.id, toRemove.map((row) => row.id)));
  }
}

type HallReviewMode = "submit" | "approve";

export async function collectVenueReviewReadiness(
  venueId: number,
  executor: typeof db = db,
  options: { mode?: HallReviewMode; selectedHallIds?: readonly number[] } = {},
): Promise<{ missing: MissingField[]; readyHallIds: number[]; skippedHallIds: number[] }> {
  const missing: MissingField[] = [];
  const [venue] = await executor.select().from(venues).where(eq(venues.id, venueId)).limit(1);
  if (!venue) {
    return { missing: [{ step: "venue", field: "venue", message: "venue_required", path: "venue" }], readyHallIds: [], skippedHallIds: [] };
  }
  if (!venue.organizationId) {
    missing.push({ step: "organization", field: "organizationId", message: "organization_required", path: "organizationId" });
    return { missing, readyHallIds: [], skippedHallIds: [] };
  }
  const [org] = await executor
    .select()
    .from(partnerOrganizations)
    .where(eq(partnerOrganizations.id, venue.organizationId))
    .limit(1);
  if (!org) {
    missing.push({ step: "organization", field: "organization", message: "organization_required", path: "organization" });
    return { missing, readyHallIds: [], skippedHallIds: [] };
  }
  if (!org.displayName || org.displayName.trim().length < 2) {
    missing.push({ step: "organization", field: "displayName", message: "display_name_required", path: "displayName" });
  }
  missing.push(
    ...organizationLegalIssues({
      type: org.type,
      legalName: org.legalName,
      idNumber: org.idNumber,
      legalAddress: org.legalAddress,
    }),
  );
  if (!(await organizationHasValidContract(org.id, executor))) {
    missing.push({ step: "contract", field: "contract", message: "current_signed_contract_required", path: "contract" });
  }
  if (!venue.nameRo || venue.nameRo.trim().length < 2) {
    missing.push({ step: "venue", field: "name", message: "venue_name_required", path: "name" });
  }
  if (!venue.address || venue.address.trim().length < 5) {
    missing.push({ step: "venue", field: "address", message: "address_required", path: "address" });
  }
  if (!venue.city) {
    missing.push({ step: "venue", field: "city", message: "city_required", path: "city" });
  }
  const images = await executor
    .select({ id: venueImages.id, hallId: venueImages.hallId })
    .from(venueImages)
    .where(eq(venueImages.venueId, venueId));
  if (!images.some((image) => image.hallId == null)) {
    missing.push({ step: "venue", field: "imageUrls", message: "images_required", path: "imageUrls" });
  }
  const halls = await executor
    .select()
    .from(venueHalls)
    .where(eq(venueHalls.venueId, venueId))
    .orderBy(asc(venueHalls.sortOrder), asc(venueHalls.id));
  const liveHalls = halls.filter((hall) => hall.status !== "archived");
  if (liveHalls.length === 0) {
    missing.push({ step: "hall", field: "halls", message: "at_least_one_hall", path: "halls" });
  }
  const mode = options.mode ?? "submit";
  const candidates = liveHalls.filter((hall) =>
    mode === "approve" ? hall.status === "pending" :
      hall.status === "draft" || hall.status === "rejected",
  );
  const requested = options.selectedHallIds == null ? null : new Set(options.selectedHallIds);
  const selected = requested == null ? candidates : candidates.filter((hall) => requested.has(hall.id));
  const alreadyReviewedCount = mode === "submit" && requested != null
    ? liveHalls.filter((hall) => requested.has(hall.id) &&
        (hall.status === "pending" || hall.status === "active")).length
    : 0;
  if (requested != null &&
    (requested.size !== options.selectedHallIds?.length ||
      selected.length + alreadyReviewedCount !== requested.size)) {
    missing.push({ step: "hall", field: "halls", message: "hall_selection_invalid", path: "halls" });
  }
  const photoCount = new Map<number, number>();
  for (const image of images) {
    if (image.hallId != null) photoCount.set(image.hallId, (photoCount.get(image.hallId) ?? 0) + 1);
  }
  const readyHallIds: number[] = [];
  const skippedHallIds: number[] = [];
  const candidateMissing: MissingField[] = [];
  const alreadySubmitted = liveHalls.some((hall) =>
    hall.status === "pending" || hall.status === "active");
  selected.forEach((hall) => {
    const index = liveHalls.findIndex((row) => row.id === hall.id);
    const issues = hallReviewIssues({ ...hall, photoCount: photoCount.get(hall.id) ?? 0 });
    if (issues.length) skippedHallIds.push(hall.id);
    else readyHallIds.push(hall.id);
    for (const issue of issues) {
      candidateMissing.push({
        step: "hall", field: `halls.${index}.${issue}`, path: `halls.${index}.${issue}`,
        message: issue === "nameRo" ? "hall_name_required" : issue === "capacityMax" ?
          "capacity_required" : issue === "imageUrls" ? "hall_images_required" : "hall_slug_required",
      });
    }
  });
  // A targeted operation must never silently skip its hall. A whole-local
  // submit, however, may advance the ready halls while incomplete draft halls
  // remain editable and private.
  if (requested != null || mode === "approve" ||
    (readyHallIds.length === 0 && !alreadySubmitted)) {
    missing.push(...candidateMissing);
  }
  if (readyHallIds.length === 0 && alreadyReviewedCount === 0 &&
    (mode === "approve" || !alreadySubmitted)) {
    missing.push({ step: "hall", field: "halls", message: "at_least_one_submittable_hall", path: "halls" });
  }
  return { missing, readyHallIds, skippedHallIds };
}

export async function collectSubmitMissing(
  venueId: number,
  executor: typeof db = db,
): Promise<MissingField[]> {
  return (await collectVenueReviewReadiness(venueId, executor)).missing;
}

/**
 * One stable identity for a review generation. Submit and approve only move
 * hall statuses forward, so they deliberately preserve hall `updatedAt`;
 * rejection or an actual hall edit changes it and therefore creates a fresh
 * generation. Image row versions cover required venue-image edits without
 * coupling the key to the status-only xmin changes.
 */
function registrationSubmissionKey(snapshot: VenueRegistrationSnapshot): string {
  const stablePreTransitionState = JSON.stringify({
    venueId: snapshot.venue.id,
    halls: snapshot.halls.map((hall) => [hall.id, hall.updatedAt.toISOString()]),
    images: snapshot.images.map((image) => [image.id, image.hallId, image.rowVersion]),
  });
  return createHash("sha256").update(stablePreTransitionState).digest("hex").slice(0, 24);
}

export async function submitVenueForApproval(
  actorUserId: string,
  venueId: number,
  selectedHallIds?: readonly number[],
) {
  const expected = await captureVenueRegistrationSnapshot(venueId);
  if (!expected) {
    return {
      ok: false as const,
      code: "NOT_FOUND" as const,
      error: "Not found",
      status: 404 as const,
    };
  }
  const submissionKey = registrationSubmissionKey(expected);

  return db.transaction(async (tx) => {
    const executor = tx as unknown as typeof db;

    // Membership mutations use this same deterministic user -> organization
    // lock order. Authority is checked again only after these locks are held,
    // so revoke/demote/suspend versus submit has a deterministic winner.
    await acquireLegalScopeLocks(tx, {
      // Attachment can reset the legacy venue owner's onboarding bit even
      // when a different organization admin later submits the venue. Lock and
      // repair both identities so that owner cannot remain redirected forever.
      userIds: [
        actorUserId,
        ...(expected.venue.userId && expected.venue.userId !== actorUserId
          ? [expected.venue.userId]
          : []),
      ],
      organizationIds: expected.venue.organizationId == null
        ? []
        : [expected.venue.organizationId],
    });

    // archive and admin decisions take this same venue lock after their legal
    // locks. No transition may observe a stale hall/registration state.
    await acquireAvailabilityLocks(tx, {
      venueId,
      hallIds: [],
      localDates: [],
      conflictGroupIds: [],
    });

    const actor = await getLockedAppUserById(actorUserId, executor);
    if (!actor) {
      return {
        ok: false as const,
        code: "FORBIDDEN" as const,
        error: "Forbidden",
        status: 403 as const,
      };
    }
    const current = await loadLockedVenueRegistrationSnapshot(venueId, executor);
    if (!current) {
      return {
        ok: false as const,
        code: "NOT_FOUND" as const,
        error: "Not found",
        status: 404 as const,
      };
    }
    if (!venueRegistrationSnapshotMatches(expected, current)) {
      return {
        ok: false as const,
        code: "REGISTRATION_CHANGED" as const,
        error: "REGISTRATION_CHANGED",
        status: 409 as const,
      };
    }
    if (!current.venue.organizationId) {
      return {
        ok: false as const,
        code: "FORBIDDEN" as const,
        error: "Forbidden",
        status: 403 as const,
      };
    }
    // A global admin may see the organization lifecycle even when its
    // capability gate denies writes. Do not expose that state to other actors.
    if (
      actor.isGlobalAdmin &&
      (!current.organization ||
        !ORG_STATUSES_ALLOWING_ACCESS.includes(
          current.organization.status as (typeof ORG_STATUSES_ALLOWING_ACCESS)[number],
        ))
    ) {
      return {
        ok: false as const,
        code: "ORGANIZATION_NOT_SUBMITTABLE" as const,
        error: "ORGANIZATION_NOT_SUBMITTABLE",
        status: 409 as const,
      };
    }
    const access = await authorizeOrganizationCapabilityLocked(
      actor,
      current.venue.organizationId,
      "manage_venues",
      executor,
    );
    if (!access.ok) {
      return {
        ok: false as const,
        code: "FORBIDDEN" as const,
        error: "Forbidden",
        status: 403 as const,
      };
    }

    // Global administrators intentionally bypass membership authorization,
    // but they must not revive an organization whose lifecycle explicitly
    // blocks writes. The organization row is part of the locked snapshot.
    if (
      !current.organization ||
      !ORG_STATUSES_ALLOWING_ACCESS.includes(
        current.organization.status as (typeof ORG_STATUSES_ALLOWING_ACCESS)[number],
      )
    ) {
      return {
        ok: false as const,
        code: "ORGANIZATION_NOT_SUBMITTABLE" as const,
        error: "ORGANIZATION_NOT_SUBMITTABLE",
        status: 409 as const,
      };
    }

    const completionUserIds = [
      actorUserId,
      ...(current.venue.userId && current.venue.userId !== actorUserId
        ? [current.venue.userId]
        : []),
    ];
    const readiness = await collectVenueReviewReadiness(venueId, executor, { selectedHallIds });
    const { missing, skippedHallIds } = readiness;
    const transitioningHallIds = readiness.readyHallIds;
    if (missing.length) {
      return {
        ok: false as const,
        code: "ONBOARDING_INCOMPLETE" as const,
        error: "ONBOARDING_INCOMPLETE",
        missing,
        status: 400 as const,
      };
    }
    if (transitioningHallIds.length === 0) {
      const alreadySubmitted = current.halls.some((hall) => hall.status === "pending") ||
        (current.venue.isActive && current.halls.some((hall) => hall.status === "active"));
      if (!alreadySubmitted) {
        return {
          ok: false as const,
          code: "ONBOARDING_INCOMPLETE" as const,
          error: "ONBOARDING_INCOMPLETE",
          missing: [{
            step: "hall",
            field: "halls",
            message: "at_least_one_submittable_hall",
            path: "halls",
          }],
          status: 400 as const,
        };
      }
      await executor
        .update(users)
        .set({ onboardingComplete: true, updatedAt: new Date() })
        .where(inArray(users.id, completionUserIds));
      return {
        ok: true as const,
        venueId,
        organizationId: current.venue.organizationId,
        submitted: false as const,
        submissionKey,
        submittedHallIds: [] as number[],
        skippedHallIds,
      };
    }
    await executor
      .update(partnerOrganizations)
      .set({ status: "pending", updatedAt: new Date() })
      .where(and(
        eq(partnerOrganizations.id, current.venue.organizationId),
        inArray(partnerOrganizations.status, ["draft", "rejected"]),
      ));
    await executor
      .update(venueHalls)
      // Preserve the edit revision used by registrationSubmissionKey. Only a
      // content edit or rejection starts a new submission generation.
      .set({ status: "pending", reviewReason: null })
      .where(and(
        eq(venueHalls.venueId, venueId),
        inArray(venueHalls.id, transitioningHallIds),
        inArray(venueHalls.status, ["draft", "rejected"]),
      ));
    await executor
      .update(users)
      .set({ onboardingComplete: true, updatedAt: new Date() })
      .where(inArray(users.id, completionUserIds));

    const [venue] = await executor
      .select({ nameRo: venues.nameRo })
      .from(venues)
      .where(eq(venues.id, venueId))
      .limit(1);
    const admins = await executor
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.role, ["admin", "super_admin"]));
    if (admins.length > 0) {
      const insertedNotifications = await executor
        .insert(notifications)
        .values(admins.map((admin) => ({
          userId: admin.id,
          type: "venue_registered",
          title: "Local trimis la aprobare",
          message: `${venue?.nameRo ?? "Local"} (#${venueId}) a fost trimis spre aprobare.`,
          actionUrl: "/admin/cereri-inregistrare",
          dedupeKey: `venue_registered:${venueId}:${submissionKey}:${admin.id}`,
        })))
        .onConflictDoNothing()
        .returning({ id: notifications.id });
      await enqueueRegistrationEmails(executor, insertedNotifications.map((row) => row.id));
    }
    return {
      ok: true as const,
      venueId,
      organizationId: current.venue.organizationId,
      submitted: true as const,
      submissionKey,
      submittedHallIds: transitioningHallIds,
      skippedHallIds,
    };
  });
}

export async function archiveHall(actorUserId: string, hallId: number) {
  const [hall] = await db.select().from(venueHalls).where(eq(venueHalls.id, hallId)).limit(1);
  if (!hall) {
    return { ok: false as const, status: 404 as const, error: "Not found", code: "NOT_FOUND" as const };
  }
  const expected = await captureVenueRegistrationSnapshot(hall.venueId);
  if (!expected) {
    return { ok: false as const, status: 404 as const, error: "Not found", code: "NOT_FOUND" as const };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const executor = tx as unknown as typeof db;
      await acquireLegalScopeLocks(tx, {
        userIds: [actorUserId],
        organizationIds: expected.venue.organizationId == null
          ? []
          : [expected.venue.organizationId],
      });

      // The timezone is part of the registration CAS token. If it changes
      // while we wait, the snapshot comparison below aborts this transition.
      const today = localDateInZone(new Date(), expected.venue.timezone);
      await acquireAvailabilityLocks(tx, {
        venueId: hall.venueId,
        hallIds: [hallId],
        localDates: [today],
        conflictGroupIds: [],
      });

      const actor = await getLockedAppUserById(actorUserId, executor);
      if (!actor) {
        return { ok: false as const, status: 403 as const, error: "Forbidden", code: "FORBIDDEN" as const };
      }
      const current = await loadLockedVenueRegistrationSnapshot(hall.venueId, executor);
      if (
        !current ||
        !venueRegistrationSnapshotMatches(expected, current)
      ) {
        return { ok: false as const, status: 409 as const, error: "HALL_CHANGED", code: "HALL_CHANGED" as const };
      }
      if (current.venue.organizationId != null) {
        const access = await authorizeOrganizationCapabilityLocked(
          actor,
          current.venue.organizationId,
          "manage_venues",
          executor,
        );
        if (!access.ok) {
          return { ok: false as const, status: 403 as const, error: "Forbidden", code: "FORBIDDEN" as const };
        }
      } else if (!actor.isGlobalAdmin && current.venue.userId !== actor.id) {
        return { ok: false as const, status: 403 as const, error: "Forbidden", code: "FORBIDDEN" as const };
      }

      const [locked] = await executor
        .select()
        .from(venueHalls)
        .where(and(eq(venueHalls.id, hallId), eq(venueHalls.venueId, hall.venueId)))
        .for("update")
        .limit(1);
      if (!locked) {
        return { ok: false as const, status: 409 as const, error: "HALL_CHANGED", code: "HALL_CHANGED" as const };
      }
      if (locked.status === "archived") {
        return { ok: true as const, hallId };
      }
      const siblings = await executor
        .select({ id: venueHalls.id, status: venueHalls.status })
        .from(venueHalls)
        .where(eq(venueHalls.venueId, locked.venueId));
      if (current.venue.isActive) {
        const active = siblings.filter((row) => row.status === "active");
        if (active.length === 0 || (locked.status === "active" && active.length <= 1)) {
          throw Object.assign(new Error("LAST_USABLE_HALL"), { code: "LAST_USABLE_HALL" });
        }
      } else if (isUsableHallStatus(locked.status)) {
        const usable = siblings.filter((row) => isUsableHallStatus(row.status));
        if (usable.length <= 1) {
          throw Object.assign(new Error("LAST_USABLE_HALL"), { code: "LAST_USABLE_HALL" });
        }
      }
      const [future] = await executor
        .select({ id: bookingRequests.id })
        .from(bookingRequests)
        .where(
          and(
            eq(bookingRequests.venueId, locked.venueId),
            inArray(bookingRequests.status, ["pending", "accepted", "confirmed_by_client"]),
            gte(bookingRequests.eventDate, today),
            or(eq(bookingRequests.hallId, hallId), eq(bookingRequests.reservationScope, "venue")),
          ),
        )
        .limit(1);
      if (future) {
        throw Object.assign(new Error("HALL_HAS_FUTURE_BOOKINGS"), { code: "HALL_HAS_FUTURE_BOOKINGS" });
      }
      const [updated] = await executor
        .update(venueHalls)
        .set({ status: "archived", updatedAt: new Date() })
        .where(and(eq(venueHalls.id, hallId), eq(venueHalls.status, locked.status)))
        .returning({ id: venueHalls.id });
      if (!updated) {
        throw Object.assign(new Error("HALL_CHANGED"), { code: "HALL_CHANGED" });
      }
      return { ok: true as const, hallId };
    });
    return result;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "LAST_USABLE_HALL" || code === "HALL_HAS_FUTURE_BOOKINGS" || code === "HALL_CHANGED") {
      return {
        ok: false as const,
        status: 409 as const,
        error: code,
        code: code as "LAST_USABLE_HALL" | "HALL_HAS_FUTURE_BOOKINGS" | "HALL_CHANGED",
      };
    }
    throw error;
  }
}

export function multiHallWritesEnabled(): boolean {
  return isMultiHallEnabled();
}
