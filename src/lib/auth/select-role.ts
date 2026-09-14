/**
 * Transactional role selection state.
 *
 * Clerk authentication stays in the route. This module owns the database
 * decision so concurrent role-picker requests serialize on the application
 * user and cannot create two venue stubs or revive legacy venue authority.
 */
import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
} from "drizzle-orm";

import { db } from "@/lib/db";
import {
  artists,
  partnerOrganizationMembers,
  partnerOrganizations,
  users,
  venues,
} from "@/lib/db/schema";
import { acquireLegalScopeLock } from "@/lib/booking/advisory-locks";
import {
  ORG_STATUSES_ALLOWING_ACCESS,
  type AppUser,
} from "@/lib/venue-access";
import { slugify } from "@/lib/utils/slugify";
import { writeUserPhoneLocked } from "@/lib/auth/user-phone";
import { validatePhone } from "@/lib/phone/validate";

export type SelectedAccountRole = "client" | "artist" | "venue";

type LockedAppUser = AppUser & {
  email: string;
  name: string | null;
  phone: string | null;
  onboardingComplete: boolean;
};

type SelectedVenue = {
  id: number;
  organizationId: number | null;
};

export type SelectRoleDatabaseResult =
  | {
      ok: false;
      status: 403 | 409;
      code:
        | "FORBIDDEN"
        | "PRIVILEGED_ROLE_LOCKED"
        | "ROLE_CONFLICT"
        | "VENUE_STUB_CONFLICT";
      error: string;
    }
  | {
      ok: true;
      user: AppUser;
      role: SelectedAccountRole;
      venueId: number | null;
      organizationId: number | null;
      needsOrganizationAttachment: boolean;
    };

const ROLE_CONFLICT_MESSAGE =
  "Rolul contului este deja stabilit. Folosește un cont separat pentru alt tip de profil.";

async function lockCurrentUser(
  executor: typeof db,
  userId: string,
): Promise<LockedAppUser | null> {
  const [user] = await executor
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      phone: users.phone,
      role: users.role,
      onboardingComplete: users.onboardingComplete,
    })
    .from(users)
    .where(eq(users.id, userId))
    .for("update")
    .limit(1);
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role,
    onboardingComplete: user.onboardingComplete,
    isGlobalAdmin: user.role === "admin" || user.role === "super_admin",
  };
}

function isPrivilegedAccountRole(role: string): boolean {
  return role === "admin" || role === "super_admin" || role === "editor";
}

/**
 * Resolve the venue relationship that is authoritative for role selection.
 *
 * With MULTI_HALL off, this is intentionally the old venues.user_id lookup.
 * With it on, direct ownership is only authoritative for an organization-null
 * legacy draft; organization-backed venues require a live membership in an
 * organization whose lifecycle still permits access.
 */
async function findAuthoritativeVenue(
  executor: typeof db,
  user: AppUser,
  multiHallEnabled: boolean,
): Promise<SelectedVenue | null> {
  const [directVenue] = await executor
    .select({ id: venues.id, organizationId: venues.organizationId })
    .from(venues)
    .where(
      and(
        eq(venues.userId, user.id),
        multiHallEnabled && !user.isGlobalAdmin
          ? isNull(venues.organizationId)
          : undefined,
      ),
    )
    .orderBy(asc(venues.id))
    .limit(1);
  if (directVenue) return directVenue;

  if (!multiHallEnabled) return null;

  const [membershipVenue] = await executor
    .select({ id: venues.id, organizationId: venues.organizationId })
    .from(venues)
    .innerJoin(
      partnerOrganizationMembers,
      and(
        eq(partnerOrganizationMembers.organizationId, venues.organizationId),
        eq(partnerOrganizationMembers.userId, user.id),
        eq(partnerOrganizationMembers.isActive, true),
      ),
    )
    .innerJoin(
      partnerOrganizations,
      eq(partnerOrganizations.id, partnerOrganizationMembers.organizationId),
    )
    .where(
      inArray(partnerOrganizations.status, [
        ...ORG_STATUSES_ALLOWING_ACCESS,
      ]),
    )
    .orderBy(asc(venues.id))
    .limit(1);
  return membershipVenue ?? null;
}

async function hasAccessibleOrganizationMembership(
  executor: typeof db,
  userId: string,
): Promise<boolean> {
  const [membership] = await executor
    .select({ id: partnerOrganizationMembers.id })
    .from(partnerOrganizationMembers)
    .innerJoin(
      partnerOrganizations,
      eq(partnerOrganizations.id, partnerOrganizationMembers.organizationId),
    )
    .where(and(
      eq(partnerOrganizationMembers.userId, userId),
      eq(partnerOrganizationMembers.isActive, true),
      inArray(partnerOrganizations.status, [...ORG_STATUSES_ALLOWING_ACCESS]),
    ))
    .limit(1);
  return Boolean(membership);
}

/**
 * Remove only a non-authoritative legacy pointer. The organization relation
 * is never changed. Releasing this unique user_id is necessary so a removed
 * member can start a new venue profile instead of failing the insert.
 */
async function detachStaleOrganizationVenueOwner(
  executor: typeof db,
  user: AppUser,
): Promise<void> {
  if (user.isGlobalAdmin) return;

  const [directOrganizationVenue] = await executor
    .select({ id: venues.id, organizationId: venues.organizationId })
    .from(venues)
    .where(
      and(
        eq(venues.userId, user.id),
        isNotNull(venues.organizationId),
      ),
    )
    .orderBy(asc(venues.id))
    .for("update")
    .limit(1);
  if (!directOrganizationVenue?.organizationId) return;

  const [liveMembership] = await executor
    .select({ id: partnerOrganizationMembers.id })
    .from(partnerOrganizationMembers)
    .innerJoin(
      partnerOrganizations,
      eq(partnerOrganizations.id, partnerOrganizationMembers.organizationId),
    )
    .where(
      and(
        eq(
          partnerOrganizationMembers.organizationId,
          directOrganizationVenue.organizationId,
        ),
        eq(partnerOrganizationMembers.userId, user.id),
        eq(partnerOrganizationMembers.isActive, true),
        inArray(partnerOrganizations.status, [
          ...ORG_STATUSES_ALLOWING_ACCESS,
        ]),
      ),
    )
    .limit(1);
  if (liveMembership) return;

  await executor
    .update(venues)
    .set({ userId: null, updatedAt: new Date() })
    .where(
      and(
        eq(venues.id, directOrganizationVenue.id),
        eq(venues.userId, user.id),
        eq(
          venues.organizationId,
          directOrganizationVenue.organizationId,
        ),
      ),
    );
}

async function createOrReuseVenueStub(
  executor: typeof db,
  user: AppUser,
  baseName: string,
  multiHallEnabled: boolean,
): Promise<SelectedVenue | null> {
  // The user advisory lock serializes correct callers. The retry also handles
  // an older deployment racing us on user_id, plus unrelated users choosing
  // the same display name and therefore the same slug.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const existing = await findAuthoritativeVenue(
      executor,
      user,
      multiHallEnabled,
    );
    if (existing) return existing;

    const baseSlug = slugify(baseName) || "venue";
    const userSuffix = user.id.replaceAll("-", "").slice(0, 12);
    const slug = attempt === 0
      ? baseSlug
      : attempt < 10
        ? `${baseSlug}-${attempt + 1}`
        : `${baseSlug.slice(0, 64)}-${userSuffix}-${attempt - 9}`;
    const [created] = await executor
      .insert(venues)
      .values({
        userId: user.id,
        nameRo: baseName,
        slug,
        phone: "",
        city: "Chișinău",
        isActive: false,
        isFeatured: true,
        facilities: [],
      })
      // Suppress a concurrently claimed slug/user_id, then re-read and retry
      // inside the same transaction instead of surfacing a generic 500.
      .onConflictDoNothing()
      .returning({ id: venues.id, organizationId: venues.organizationId });
    if (created) return created;
  }

  return null;
}

export type RegistrationRoleClaimFailure = {
  ok: false;
  status: 400 | 403 | 404 | 409;
  code:
    | "ARTIST_ALREADY_REGISTERED"
    | "FORBIDDEN"
    | "INVALID_PHONE"
    | "PHONE_IN_USE"
    | "PRIVILEGED_ROLE_LOCKED"
    | "ROLE_CONFLICT"
    | "USER_NOT_FOUND"
    | "VENUE_ALREADY_REGISTERED";
  error: string;
  profileId?: number;
  /** Safe lost-response replay: the profile and completed role belong to this locked user. */
  replayable?: boolean;
};

type RegistrationRoleClaimSuccess<T> = {
  ok: true;
  value: T;
};

/**
 * Claim the artist role and create its profile in one serialized transaction.
 * The callback must contain database work only; email/AI/referral effects stay
 * outside so a slow provider never holds the account role lock.
 */
export async function claimArtistRegistrationInDatabase<T>(input: {
  userId: string;
  multiHallEnabled: boolean;
  normalizedPhone?: string | null;
  write: (executor: typeof db, user: LockedAppUser) => Promise<T>;
}): Promise<RegistrationRoleClaimFailure | RegistrationRoleClaimSuccess<T>> {
  return db.transaction(async (tx) => {
    const executor = tx as unknown as typeof db;
    await acquireLegalScopeLock(tx, { userId: input.userId });
    const currentUser = await lockCurrentUser(executor, input.userId);
    if (!currentUser) {
      return {
        ok: false as const,
        status: 403 as const,
        code: "FORBIDDEN" as const,
        error: "Forbidden",
      };
    }
    if (isPrivilegedAccountRole(currentUser.role)) {
      return {
        ok: false as const,
        status: 409 as const,
        code: "PRIVILEGED_ROLE_LOCKED" as const,
        error: "Privileged accounts cannot select a partner role.",
      };
    }

    const [artistProfile] = await executor
      .select({ id: artists.id })
      .from(artists)
      .where(eq(artists.userId, currentUser.id))
      .limit(1);
    if (artistProfile) {
      return {
        ok: false as const,
        status: 409 as const,
        code: "ARTIST_ALREADY_REGISTERED" as const,
        error: "Already registered as artist",
        profileId: artistProfile.id,
        replayable: currentUser.role === "artist" && currentUser.onboardingComplete,
      };
    }

    const venueProfile = await findAuthoritativeVenue(
      executor,
      currentUser,
      input.multiHallEnabled,
    );
    const organizationMembership = input.multiHallEnabled
      ? await hasAccessibleOrganizationMembership(executor, currentUser.id)
      : false;
    if (venueProfile || organizationMembership) {
      return {
        ok: false as const,
        status: 409 as const,
        code: "ROLE_CONFLICT" as const,
        error: "Un cont de sală nu poate fi înregistrat și ca artist.",
      };
    }

    if (input.multiHallEnabled) {
      await detachStaleOrganizationVenueOwner(executor, currentUser);
    }
    let effectivePhone = input.normalizedPhone;
    if (effectivePhone === undefined && currentUser.phone) {
      const normalized = validatePhone(currentUser.phone);
      if (!normalized.ok) {
        return {
          ok: false as const,
          status: 400 as const,
          code: "INVALID_PHONE" as const,
          error: normalized.error,
        };
      }
      effectivePhone = normalized.e164;
    }
    if (!effectivePhone) {
      return {
        ok: false as const,
        status: 400 as const,
        code: "INVALID_PHONE" as const,
        error: "Numărul de telefon este obligatoriu.",
      };
    }
    const phoneWrite = await writeUserPhoneLocked(
      executor,
      currentUser.id,
      effectivePhone,
    );
    if (!phoneWrite.ok) {
      return {
        ok: false as const,
        status: phoneWrite.code === "PHONE_IN_USE" ? 409 as const : 404 as const,
        code: phoneWrite.code,
        error: phoneWrite.code === "PHONE_IN_USE"
          ? "Acest număr de telefon este deja folosit de un alt cont."
          : "User not found",
      };
    }
    currentUser.phone = effectivePhone;
    const value = await input.write(executor, currentUser);
    const [updated] = await executor
      .update(users)
      .set({
        role: "artist",
        onboardingComplete: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, currentUser.id))
      .returning({ id: users.id });
    if (!updated) throw new Error("artist_role_claim_user_disappeared");
    return { ok: true as const, value };
  });
}

/**
 * Legacy flag-off venue registration. The existing inactive venue may be
 * updated, but the opposite artist claim and the user onboarding write are
 * decided under the same account lock as the venue write.
 */
export async function claimLegacyVenueRegistrationInDatabase<T>(input: {
  userId: string;
  normalizedPhone?: string | null;
  write: (
    executor: typeof db,
    user: LockedAppUser,
    existingVenue: typeof venues.$inferSelect | null,
  ) => Promise<T>;
}): Promise<RegistrationRoleClaimFailure | RegistrationRoleClaimSuccess<T>> {
  return db.transaction(async (tx) => {
    const executor = tx as unknown as typeof db;
    await acquireLegalScopeLock(tx, { userId: input.userId });
    const currentUser = await lockCurrentUser(executor, input.userId);
    if (!currentUser) {
      return {
        ok: false as const,
        status: 403 as const,
        code: "FORBIDDEN" as const,
        error: "Forbidden",
      };
    }
    if (isPrivilegedAccountRole(currentUser.role)) {
      return {
        ok: false as const,
        status: 409 as const,
        code: "PRIVILEGED_ROLE_LOCKED" as const,
        error: "Privileged accounts cannot select a partner role.",
      };
    }
    const [artistProfile] = await executor
      .select({ id: artists.id })
      .from(artists)
      .where(eq(artists.userId, currentUser.id))
      .limit(1);
    if (artistProfile || currentUser.role === "artist") {
      return {
        ok: false as const,
        status: 409 as const,
        code: "ROLE_CONFLICT" as const,
        error: "Un cont de artist nu poate fi înregistrat și ca sală.",
      };
    }

    const [directVenue] = await executor
      .select()
      .from(venues)
      .where(eq(venues.userId, currentUser.id))
      .orderBy(asc(venues.id))
      .for("update")
      .limit(1);
    // Rollout OFF may still expose an organization-backed migrated venue
    // through the central owner-chain for ordinary profile access, but the
    // legacy registration endpoint must not mutate it into a request that the
    // legacy review queue deliberately cannot show or decide.
    if (directVenue?.organizationId != null) {
      return {
        ok: false as const,
        status: 409 as const,
        code: "VENUE_ALREADY_REGISTERED" as const,
        error: "Venue already registered",
        profileId: directVenue.id,
      };
    }
    const existingVenue = directVenue ?? null;
    if (existingVenue?.isActive) {
      return {
        ok: false as const,
        status: 409 as const,
        code: "VENUE_ALREADY_REGISTERED" as const,
        error: "Venue already registered",
        profileId: existingVenue.id,
      };
    }

    if (input.normalizedPhone !== undefined) {
      const phoneWrite = await writeUserPhoneLocked(
        executor,
        currentUser.id,
        input.normalizedPhone,
      );
      if (!phoneWrite.ok) {
        return {
          ok: false as const,
          status: phoneWrite.code === "PHONE_IN_USE" ? 409 as const : 404 as const,
          code: phoneWrite.code,
          error: phoneWrite.code === "PHONE_IN_USE"
            ? "Acest număr de telefon este deja folosit de un alt cont."
            : "User not found",
        };
      }
    }

    const value = await input.write(
      executor,
      currentUser,
      existingVenue ?? null,
    );
    // A writer contract bug must roll back instead of marking onboarding
    // complete without the venue profile this claim is meant to establish.
    const [claimedVenue] = await executor
      .select({ id: venues.id })
      .from(venues)
      .where(and(
        eq(venues.userId, currentUser.id),
        isNull(venues.organizationId),
      ))
      .orderBy(asc(venues.id))
      .limit(1);
    if (!claimedVenue) throw new Error("legacy_venue_claim_missing_profile");
    const [updated] = await executor
      .update(users)
      .set({ role: "user", onboardingComplete: true, updatedAt: new Date() })
      .where(eq(users.id, currentUser.id))
      .returning({ id: users.id });
    if (!updated) throw new Error("venue_role_claim_user_disappeared");
    return { ok: true as const, value };
  });
}

export type MobileRolePreferenceResult =
  | RegistrationRoleClaimFailure
  | { ok: true; role: "user" | "artist" };

/** Transactional equivalent of the mobile role picker. */
export async function setMobileRolePreferenceInDatabase(input: {
  userId: string;
  role: "user" | "artist";
  multiHallEnabled: boolean;
}): Promise<MobileRolePreferenceResult> {
  return db.transaction(async (tx) => {
    const executor = tx as unknown as typeof db;
    await acquireLegalScopeLock(tx, { userId: input.userId });
    const currentUser = await lockCurrentUser(executor, input.userId);
    if (!currentUser) {
      return {
        ok: false as const,
        status: 404 as const,
        code: "USER_NOT_FOUND" as const,
        error: "user_not_found",
      };
    }
    if (isPrivilegedAccountRole(currentUser.role)) {
      return {
        ok: false as const,
        status: 409 as const,
        code: "PRIVILEGED_ROLE_LOCKED" as const,
        error: "privileged_role_locked",
      };
    }

    const [artistProfile] = await executor
      .select({ id: artists.id })
      .from(artists)
      .where(eq(artists.userId, currentUser.id))
      .limit(1);
    const venueProfile = await findAuthoritativeVenue(
      executor,
      currentUser,
      input.multiHallEnabled,
    );
    const organizationMembership = input.multiHallEnabled
      ? await hasAccessibleOrganizationMembership(executor, currentUser.id)
      : false;
    const incompatible = input.role === "artist"
      ? Boolean(venueProfile) || organizationMembership
      : currentUser.role === "artist" || Boolean(artistProfile);
    if (incompatible) {
      return {
        ok: false as const,
        status: 409 as const,
        code: "ROLE_CONFLICT" as const,
        error: "role_conflict",
      };
    }

    if (input.role === "artist" && input.multiHallEnabled) {
      await detachStaleOrganizationVenueOwner(executor, currentUser);
    }
    const [updated] = await executor
      .update(users)
      .set({ role: input.role, updatedAt: new Date() })
      .where(eq(users.id, currentUser.id))
      .returning({ id: users.id });
    if (!updated) throw new Error("mobile_role_claim_user_disappeared");
    return { ok: true as const, role: input.role };
  });
}

export async function selectRoleInDatabase(input: {
  userId: string;
  role: SelectedAccountRole;
  baseName: string;
  multiHallEnabled: boolean;
}): Promise<SelectRoleDatabaseResult> {
  return db.transaction(async (tx) => {
    const executor = tx as unknown as typeof db;
    await acquireLegalScopeLock(tx, { userId: input.userId });

    // Never trust the user snapshot loaded before entering the serialized
    // section: deletion or a concurrent role selection may have changed it.
    const currentUser = await lockCurrentUser(executor, input.userId);
    if (!currentUser) {
      return {
        ok: false as const,
        status: 403 as const,
        code: "FORBIDDEN" as const,
        error: "Forbidden",
      };
    }
    if (isPrivilegedAccountRole(currentUser.role)) {
      return {
        ok: false as const,
        status: 409 as const,
        code: "PRIVILEGED_ROLE_LOCKED" as const,
        error: "Privileged accounts cannot use the role picker.",
      };
    }

    const [artistProfile] = await executor
      .select({ id: artists.id })
      .from(artists)
      .where(eq(artists.userId, currentUser.id))
      .limit(1);
    const venueProfile = await findAuthoritativeVenue(
      executor,
      currentUser,
      input.multiHallEnabled,
    );
    const organizationMembership = input.multiHallEnabled
      ? await hasAccessibleOrganizationMembership(executor, currentUser.id)
      : false;
    const hasArtistProfile = Boolean(artistProfile) || currentUser.role === "artist";
    const hasVenueProfile = Boolean(venueProfile) || organizationMembership;
    const roleConflict =
      (input.role === "artist" && hasVenueProfile) ||
      (input.role === "venue" && hasArtistProfile) ||
      (input.role === "client" && (hasArtistProfile || hasVenueProfile));
    if (roleConflict) {
      return {
        ok: false as const,
        status: 409 as const,
        code: "ROLE_CONFLICT" as const,
        error: ROLE_CONFLICT_MESSAGE,
      };
    }

    // Only a role selection that is otherwise valid performs this canonical
    // cleanup. A rejected request must not mutate ownership metadata.
    if (input.multiHallEnabled) {
      await detachStaleOrganizationVenueOwner(executor, currentUser);
    }

    if (input.role === "artist") {
      const [updated] = await executor
        .update(users)
        .set({
          role: "artist",
          onboardingComplete: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, currentUser.id))
        .returning({ id: users.id });
      if (!updated) {
        return {
          ok: false as const,
          status: 403 as const,
          code: "FORBIDDEN" as const,
          error: "Forbidden",
        };
      }
      return {
        ok: true as const,
        user: currentUser,
        role: input.role,
        venueId: null,
        organizationId: null,
        needsOrganizationAttachment: false,
      };
    }

    if (input.role === "client") {
      const [updated] = await executor
        .update(users)
        .set({ onboardingComplete: true, updatedAt: new Date() })
        .where(eq(users.id, currentUser.id))
        .returning({ id: users.id });
      if (!updated) {
        return {
          ok: false as const,
          status: 403 as const,
          code: "FORBIDDEN" as const,
          error: "Forbidden",
        };
      }
      return {
        ok: true as const,
        user: currentUser,
        role: input.role,
        venueId: null,
        organizationId: null,
        needsOrganizationAttachment: false,
      };
    }

    const selectedVenue = venueProfile ?? await createOrReuseVenueStub(
      executor,
      currentUser,
      input.baseName.trim() || "Sală nouă",
      input.multiHallEnabled,
    );
    if (!selectedVenue) {
      return {
        ok: false as const,
        status: 409 as const,
        code: "VENUE_STUB_CONFLICT" as const,
        error: "Profilul localului nu a putut fi inițializat. Reîncearcă.",
      };
    }

    // Entering the venue path starts (or resumes) venue onboarding. Keep the
    // flag change under the same account lock so a previously completed
    // client cannot refresh past an unresolved organization selection.
    const [startedOnboarding] = await executor
      .update(users)
      .set({ onboardingComplete: false, updatedAt: new Date() })
      .where(eq(users.id, currentUser.id))
      .returning({ id: users.id });
    if (!startedOnboarding) {
      return {
        ok: false as const,
        status: 403 as const,
        code: "FORBIDDEN" as const,
        error: "Forbidden",
      };
    }

    return {
      ok: true as const,
      user: currentUser,
      role: input.role,
      venueId: selectedVenue.id,
      organizationId: selectedVenue.organizationId,
      needsOrganizationAttachment:
        input.multiHallEnabled && selectedVenue.organizationId == null,
    };
  });
}

export async function completeVenueRoleSelection(input: {
  userId: string;
  venueId: number;
  multiHallEnabled: boolean;
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    const executor = tx as unknown as typeof db;
    await acquireLegalScopeLock(tx, { userId: input.userId });
    const currentUser = await lockCurrentUser(executor, input.userId);
    if (
      !currentUser ||
      currentUser.role === "artist" ||
      isPrivilegedAccountRole(currentUser.role)
    ) return false;
    const currentVenue = await findAuthoritativeVenue(
      executor,
      currentUser,
      input.multiHallEnabled,
    );
    if (currentVenue?.id !== input.venueId) return false;
    // This completes only the role-picker hand-off. Full venue onboarding is
    // completed by submitVenueForApproval; keeping this false makes refresh,
    // sign-out, and a kill-switch transition resume the editable wizard.
    const [updated] = await executor
      .update(users)
      .set({ onboardingComplete: false, updatedAt: new Date() })
      .where(eq(users.id, currentUser.id))
      .returning({ id: users.id });
    return Boolean(updated);
  });
}
