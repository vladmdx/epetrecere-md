/**
 * Server-only authorization for the partner org → venue → hall chain (ADR 0028).
 *
 * This is the single source of truth for "may this user act on this
 * venue/hall/organization". Every ownership gate should resolve access through
 * the functions here instead of comparing `venues.user_id === users.id`
 * directly, so that:
 *   - a user can administer several venues via organization membership;
 *   - a member of organization A can never reach organization B's venue/hall
 *     (including via a forged id in the request body);
 *   - single-venue accounts created before the 0028 backfill keep working,
 *     because access also falls back to the legacy `venues.user_id` chain.
 *
 * Role hierarchy: owner > admin > manager > staff. Global admins
 * (super_admin/admin) get an explicit, auditable bypass.
 *
 * Never trust an organizationId/venueId/hallId from the client without passing
 * it through one of the `require*Access` resolvers.
 *
 * server-only: must not be imported into client components.
 */
import { auth } from "@clerk/nextjs/server";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  partnerOrganizations,
  partnerOrganizationMembers,
  users,
  venueHalls,
  venues,
} from "@/lib/db/schema";
import { isMultiHallEnabled } from "@/lib/feature-flags";

export type OrgRole = "owner" | "admin" | "manager" | "staff";

/**
 * Central capability matrix for venue work. Route handlers should ask for a
 * capability instead of inventing their own role threshold.
 */
export type VenueCapability =
  | "view_private"
  | "manage_bookings"
  | "manage_calendar"
  | "manage_menu"
  | "manage_profile"
  | "manage_ai"
  | "manage_financials"
  | "request_reviews"
  | "manage_members"
  | "manage_halls";

export type OrganizationCapability =
  | "view_organization"
  | "manage_venues"
  | "manage_billing"
  | "manage_legal"
  | "manage_members";

export const VENUE_CAPABILITY_MIN_ROLE: Record<VenueCapability, OrgRole> = {
  view_private: "staff",
  manage_bookings: "manager",
  manage_calendar: "manager",
  manage_menu: "manager",
  manage_profile: "admin",
  manage_ai: "admin",
  manage_financials: "admin",
  request_reviews: "admin",
  manage_members: "owner",
  manage_halls: "admin",
};

export const ORG_CAPABILITY_MIN_ROLE: Record<OrganizationCapability, OrgRole> = {
  view_organization: "staff",
  manage_venues: "admin",
  manage_billing: "admin",
  manage_legal: "owner",
  manage_members: "owner",
};

/** Members may keep working a draft/pending/rejected org; suspended/archived cut access. */
export const ORG_STATUSES_ALLOWING_ACCESS = [
  "draft",
  "pending",
  "active",
  "rejected",
] as const;

const ROLE_RANK: Record<OrgRole, number> = {
  staff: 1,
  manager: 2,
  admin: 3,
  owner: 4,
};

export type AppUser = {
  id: string;
  role: string;
  isGlobalAdmin: boolean;
};

function toAppUser(row: { id: string; role: string }): AppUser {
  return {
    id: row.id,
    role: row.role,
    isGlobalAdmin: row.role === "admin" || row.role === "super_admin",
  };
}

/** Resolve a trusted application user row inside the caller's transaction. */
export async function getAppUserById(
  userId: string,
  executor: typeof db = db,
): Promise<AppUser | null> {
  const [row] = await executor
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;
  return toAppUser(row);
}

/**
 * Re-resolve and lock an actor inside a sensitive transition transaction.
 * Plain `users.role` updates take the same row lock, so a demotion either
 * commits before this read (and is observed) or waits until the transition
 * has finished.
 */
export async function getLockedAppUserById(
  userId: string,
  executor: typeof db,
): Promise<AppUser | null> {
  const [row] = await executor
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .for("update")
    .limit(1);
  return row ? toAppUser(row) : null;
}

export type AccessError = { ok: false; status: 401 | 403 | 404; error: string };

export type VenueAccess = {
  ok: true;
  user: AppUser;
  venueId: number;
  organizationId: number | null;
  /** The membership role granting access, or "owner" for legacy/global-admin. */
  role: OrgRole;
  /** True when access was granted via the legacy venues.user_id chain. */
  viaLegacy: boolean;
  /** True when access was granted via the global-admin bypass. */
  viaAdmin: boolean;
};

export type HallAccess = VenueAccess & { hallId: number };

export type OrgAccess = {
  ok: true;
  user: AppUser;
  organizationId: number;
  role: OrgRole;
  viaAdmin: boolean;
};

/** Resolve the signed-in Clerk session to our internal users row. */
export async function getCurrentAppUser(): Promise<AppUser | null> {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const [row] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    role: row.role,
    isGlobalAdmin: row.role === "admin" || row.role === "super_admin",
  };
}

function meetsRole(actual: OrgRole, minimum: OrgRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[minimum];
}

/** Highest active membership role the user holds in an organization, or null. */
async function membershipRole(
  userId: string,
  organizationId: number,
  executor: typeof db = db,
  lockForUpdate = false,
): Promise<OrgRole | null> {
  const buildQuery = () => executor
    .select({ role: partnerOrganizationMembers.role })
    .from(partnerOrganizationMembers)
    .innerJoin(
      partnerOrganizations,
      eq(partnerOrganizations.id, partnerOrganizationMembers.organizationId),
    )
    .where(
      and(
        eq(partnerOrganizationMembers.userId, userId),
        eq(partnerOrganizationMembers.organizationId, organizationId),
        eq(partnerOrganizationMembers.isActive, true),
        inArray(partnerOrganizations.status, [...ORG_STATUSES_ALLOWING_ACCESS]),
      ),
    );
  const rows = lockForUpdate
    ? await buildQuery().for("update", { of: partnerOrganizationMembers })
    : await buildQuery();
  if (rows.length === 0) return null;
  return rows
    .map((r) => r.role as OrgRole)
    .reduce((best, r) => (ROLE_RANK[r] > ROLE_RANK[best] ? r : best), "staff");
}

/**
 * Pure organization authorization for an already-resolved app user. Kept
 * separate from Clerk `auth()` so it is directly testable against a database.
 */
export async function authorizeOrganizationAccess(
  user: AppUser,
  organizationId: number,
  minimumRole: OrgRole = "staff",
  executor: typeof db = db,
): Promise<OrgAccess | AccessError> {
  if (!Number.isFinite(organizationId)) {
    return { ok: false, status: 404, error: "Invalid organization id" };
  }
  if (user.isGlobalAdmin) {
    return { ok: true, user, organizationId, role: "owner", viaAdmin: true };
  }
  const role = await membershipRole(user.id, organizationId, executor);
  if (!role || !meetsRole(role, minimumRole)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true, user, organizationId, role, viaAdmin: false };
}

/** Pure venue authorization for an already-resolved app user. */
export async function authorizeVenueAccess(
  user: AppUser,
  venueId: number,
  minimumRole: OrgRole = "staff",
  executor: typeof db = db,
  lockMembership = false,
): Promise<VenueAccess | AccessError> {
  if (!Number.isFinite(venueId)) {
    return { ok: false, status: 404, error: "Invalid venue id" };
  }
  const [venue] = await executor
    .select({ id: venues.id, organizationId: venues.organizationId, userId: venues.userId })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  if (!venue) return { ok: false, status: 404, error: "Venue not found" };

  if (user.isGlobalAdmin) {
    return {
      ok: true,
      user,
      venueId: venue.id,
      organizationId: venue.organizationId,
      role: "owner",
      viaLegacy: false,
      viaAdmin: true,
    };
  }

  // When MULTI_HALL is on AND the venue belongs to an organization, access is
  // membership-only. The legacy venues.user_id fallback is intentionally NOT
  // consulted here (ADR 0028, correction #1): a disabled, removed or demoted
  // member must not recover owner access through the old ownership column.
  if (isMultiHallEnabled() && venue.organizationId != null) {
    if (lockMembership) {
      // Sensitive writers already hold the venue row. Lock its organization
      // next, matching registration snapshot order, so a direct suspension
      // cannot commit after authorization but before the protected write.
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
        return { ok: false, status: 403, error: "Forbidden" };
      }
    }
    const role = await membershipRole(
      user.id,
      venue.organizationId,
      executor,
      lockMembership,
    );
    if (role && meetsRole(role, minimumRole)) {
      return {
        ok: true,
        user,
        venueId: venue.id,
        organizationId: venue.organizationId,
        role,
        viaLegacy: false,
        viaAdmin: false,
      };
    }
    return { ok: false, status: 403, error: "Forbidden" };
  }

  // Legacy chain: used when MULTI_HALL is off (preserves current behaviour so
  // the rollout is switchable) OR when the venue has no organization yet.
  if (venue.userId && venue.userId === user.id) {
    return {
      ok: true,
      user,
      venueId: venue.id,
      organizationId: venue.organizationId,
      role: "owner",
      viaLegacy: true,
      viaAdmin: false,
    };
  }

  return { ok: false, status: 403, error: "Forbidden" };
}

export async function authorizeVenueCapability(
  user: AppUser,
  venueId: number,
  capability: VenueCapability,
  executor: typeof db = db,
): Promise<VenueAccess | AccessError> {
  return authorizeVenueAccess(
    user,
    venueId,
    VENUE_CAPABILITY_MIN_ROLE[capability],
    executor,
  );
}

/**
 * Re-authorize a venue capability inside a sensitive write transaction.
 *
 * The caller must already hold the actor/organization advisory locks and the
 * venue row lock. The organization row is then locked before the qualifying
 * membership row, making direct suspension/revoke/demotion either visible
 * here or wait until this write commits.
 */
export async function authorizeVenueCapabilityLocked(
  user: AppUser,
  venueId: number,
  capability: VenueCapability,
  executor: typeof db,
): Promise<VenueAccess | AccessError> {
  return authorizeVenueAccess(
    user,
    venueId,
    VENUE_CAPABILITY_MIN_ROLE[capability],
    executor,
    true,
  );
}

export async function authorizeOrganizationCapability(
  user: AppUser,
  organizationId: number,
  capability: OrganizationCapability,
  executor: typeof db = db,
): Promise<OrgAccess | AccessError> {
  return authorizeOrganizationAccess(
    user,
    organizationId,
    ORG_CAPABILITY_MIN_ROLE[capability],
    executor,
  );
}

/**
 * Transactional organization authorization for state transitions. The caller
 * must already hold the actor row/advisory locks. Locking the organization row
 * before the qualifying membership row makes direct suspension, revoke, or
 * demotion updates either visible here or wait until this write commits.
 */
export async function authorizeOrganizationCapabilityLocked(
  user: AppUser,
  organizationId: number,
  capability: OrganizationCapability,
  executor: typeof db,
): Promise<OrgAccess | AccessError> {
  if (!Number.isFinite(organizationId)) {
    return { ok: false, status: 404, error: "Invalid organization id" };
  }

  const [organization] = await executor
    .select({ status: partnerOrganizations.status })
    .from(partnerOrganizations)
    .where(eq(partnerOrganizations.id, organizationId))
    .for("update")
    .limit(1);
  if (!organization) {
    return { ok: false, status: 404, error: "Organization not found" };
  }
  if (
    !ORG_STATUSES_ALLOWING_ACCESS.includes(
      organization.status as (typeof ORG_STATUSES_ALLOWING_ACCESS)[number],
    )
  ) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  if (user.isGlobalAdmin) {
    return { ok: true, user, organizationId, role: "owner", viaAdmin: true };
  }
  const role = await membershipRole(user.id, organizationId, executor, true);
  if (!role || !meetsRole(role, ORG_CAPABILITY_MIN_ROLE[capability])) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true, user, organizationId, role, viaAdmin: false };
}

/** Pure hall authorization: resolves the hall's venue, then authorizes it. */
export async function authorizeHallAccess(
  user: AppUser,
  hallId: number,
  minimumRole: OrgRole = "staff",
): Promise<HallAccess | AccessError> {
  if (!Number.isFinite(hallId)) {
    return { ok: false, status: 404, error: "Invalid hall id" };
  }
  const [hall] = await db
    .select({ id: venueHalls.id, venueId: venueHalls.venueId })
    .from(venueHalls)
    .where(eq(venueHalls.id, hallId))
    .limit(1);
  if (!hall) return { ok: false, status: 404, error: "Hall not found" };

  const venueAccess = await authorizeVenueAccess(user, hall.venueId, minimumRole);
  if (!venueAccess.ok) return venueAccess;
  return { ...venueAccess, hallId: hall.id };
}

/**
 * Require that the current user can act on `organizationId` with at least
 * `minimumRole`. Global admins bypass.
 */
export async function requireOrganizationAccess(
  organizationId: number,
  minimumRole: OrgRole = "staff",
): Promise<OrgAccess | AccessError> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };
  return authorizeOrganizationAccess(user, organizationId, minimumRole);
}

/**
 * Require that the current user can act on `venueId` with at least
 * `minimumRole`. Access is granted when any of the following hold:
 *   - the user is a global admin (audited bypass);
 *   - the user has a qualifying membership in the venue's organization;
 *   - (legacy) the venue's `user_id` equals the user's id.
 */
export async function requireVenueAccess(
  venueId: number,
  minimumRole: OrgRole = "staff",
): Promise<VenueAccess | AccessError> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };
  return authorizeVenueAccess(user, venueId, minimumRole);
}

export async function requireVenueCapability(
  venueId: number,
  capability: VenueCapability,
): Promise<VenueAccess | AccessError> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };
  return authorizeVenueCapability(user, venueId, capability);
}

export async function requireOrganizationCapability(
  organizationId: number,
  capability: OrganizationCapability,
): Promise<OrgAccess | AccessError> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };
  return authorizeOrganizationCapability(user, organizationId, capability);
}

/**
 * Require access to the venue that owns `hallId`. Guarantees the hall exists
 * and resolves ownership through its venue, so a forged hall id belonging to
 * another organization is rejected with 403/404.
 */
export async function requireHallAccess(
  hallId: number,
  minimumRole: OrgRole = "staff",
): Promise<HallAccess | AccessError> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };
  return authorizeHallAccess(user, hallId, minimumRole);
}

/**
 * All venue ids the user may access: every venue in an organization they are
 * an active member of, plus any legacy venue they directly own. Global admins
 * get every venue.
 */
export async function listAccessibleVenueIds(userId: string): Promise<number[]> {
  const [appUser] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (appUser && (appUser.role === "admin" || appUser.role === "super_admin")) {
    const rows = await db.select({ id: venues.id }).from(venues);
    return rows.map((r) => r.id);
  }

  // MULTI_HALL off → legacy behaviour only (venues the user directly owns).
  if (!isMultiHallEnabled()) {
    const rows = await db
      .select({ id: venues.id })
      .from(venues)
      .where(eq(venues.userId, userId));
    return rows.map((r) => r.id);
  }

  // MULTI_HALL on → venues reachable via active membership, plus legacy-owned
  // venues that have no organization yet (mirrors authorizeVenueAccess: once a
  // venue has an org, only membership grants access).
  const memberships = await db
    .select({ organizationId: partnerOrganizationMembers.organizationId })
    .from(partnerOrganizationMembers)
    .innerJoin(
      partnerOrganizations,
      eq(partnerOrganizations.id, partnerOrganizationMembers.organizationId),
    )
    .where(
      and(
        eq(partnerOrganizationMembers.userId, userId),
        eq(partnerOrganizationMembers.isActive, true),
        inArray(partnerOrganizations.status, [...ORG_STATUSES_ALLOWING_ACCESS]),
      ),
    );
  const orgIds = memberships.map((m) => m.organizationId);
  const legacyOwned = and(isNull(venues.organizationId), eq(venues.userId, userId));

  const rows = await db
    .select({ id: venues.id })
    .from(venues)
    .where(
      orgIds.length > 0
        ? or(inArray(venues.organizationId, orgIds), legacyOwned)
        : legacyOwned,
    );
  return rows.map((r) => r.id);
}

/** Full venue rows the user may access (ordered by id). */
export async function listAccessibleVenues(userId: string) {
  const ids = await listAccessibleVenueIds(userId);
  if (ids.length === 0) return [];
  return db.select().from(venues).where(inArray(venues.id, ids));
}

/** True when the user is a venue partner (owns/administers at least one). */
export async function isVenuePartner(userId: string): Promise<boolean> {
  const ids = await listAccessibleVenueIds(userId);
  return ids.length > 0;
}


/**
 * The user ids that should receive owner-facing notifications for a venue.
 * Resolves the real recipients rather than "the first venue's user":
 *   - MULTI_HALL on + organization set → active owner/admin members;
 *   - otherwise → the legacy venues.user_id (when present).
 * Once a venue belongs to an organization, the legacy owner is deliberately
 * excluded so a removed or demoted account receives no private notices.
 */
export type VenueNotificationRecipient = { userId: string; email: string | null };

export async function getVenueOwnerRecipients(
  venueId: number,
  executor: typeof db = db,
): Promise<VenueNotificationRecipient[]> {
  const [venue] = await executor
    .select({ organizationId: venues.organizationId, userId: venues.userId })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  if (!venue) return [];

  const recipients = new Map<string, string | null>();
  if (isMultiHallEnabled() && venue.organizationId != null) {
    // Membership-only: the legacy owner must NOT be re-added here (CP3 #2),
    // otherwise a removed/demoted ex-owner would keep receiving owner notices.
    const members = await executor
      .select({ userId: partnerOrganizationMembers.userId, email: users.email })
      .from(partnerOrganizationMembers)
      .innerJoin(users, eq(users.id, partnerOrganizationMembers.userId))
      .innerJoin(
        partnerOrganizations,
        eq(partnerOrganizations.id, partnerOrganizationMembers.organizationId),
      )
      .where(
        and(
          eq(partnerOrganizationMembers.organizationId, venue.organizationId),
          eq(partnerOrganizationMembers.isActive, true),
          inArray(partnerOrganizationMembers.role, ["owner", "admin"]),
          inArray(partnerOrganizations.status, [...ORG_STATUSES_ALLOWING_ACCESS]),
        ),
      );
    for (const m of members) recipients.set(m.userId, m.email);
    return [...recipients].map(([userId, email]) => ({ userId, email }));
  }
  // Flag off, or venue has no organization yet → legacy owner.
  if (venue.userId) {
    const [legacyOwner] = await executor
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, venue.userId))
      .limit(1);
    if (legacyOwner) recipients.set(legacyOwner.id, legacyOwner.email);
  }
  return [...recipients].map(([userId, email]) => ({ userId, email }));
}

export async function getVenueOwnerUserIds(
  venueId: number,
  executor: typeof db = db,
): Promise<string[]> {
  return (await getVenueOwnerRecipients(venueId, executor))
    .map((recipient) => recipient.userId);
}

export type ResolvedSelection =
  | { ok: true; venueId: number }
  | { ok: false; reason: "none" | "ambiguous" | "forbidden"; venueIds: number[] };

/**
 * Pick the venue a dashboard request operates on. If `requestedVenueId` is
 * given it must be accessible. Otherwise, a single accessible venue is chosen
 * automatically; when several exist the caller must ask the user to choose
 * (do NOT fall back to "the first venue"), and when none exist the caller
 * redirects to onboarding.
 */
export async function resolveSelectedVenue(
  userId: string,
  requestedVenueId?: number | null,
): Promise<ResolvedSelection> {
  const ids = await listAccessibleVenueIds(userId);
  if (requestedVenueId != null && Number.isFinite(requestedVenueId)) {
    if (ids.includes(requestedVenueId)) return { ok: true, venueId: requestedVenueId };
    return { ok: false, reason: "forbidden", venueIds: ids };
  }
  if (ids.length === 1) return { ok: true, venueId: ids[0] };
  if (ids.length === 0) return { ok: false, reason: "none", venueIds: ids };
  return { ok: false, reason: "ambiguous", venueIds: ids };
}

export type AccessibleOrganization = {
  id: number;
  displayName: string;
  status: string;
  role: OrgRole;
};

/** Organizations the user can administer (active membership, non-cut-off status). */
export async function listAccessibleOrganizations(
  userId: string,
): Promise<AccessibleOrganization[]> {
  const [appUser] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (appUser && (appUser.role === "admin" || appUser.role === "super_admin")) {
    const rows = await db
      .select({
        id: partnerOrganizations.id,
        displayName: partnerOrganizations.displayName,
        status: partnerOrganizations.status,
      })
      .from(partnerOrganizations);
    return rows.map((row) => ({
      id: row.id,
      displayName: row.displayName,
      status: row.status,
      role: "owner" as const,
    }));
  }
  if (!isMultiHallEnabled()) return [];
  const rows = await db
    .select({
      id: partnerOrganizations.id,
      displayName: partnerOrganizations.displayName,
      status: partnerOrganizations.status,
      role: partnerOrganizationMembers.role,
    })
    .from(partnerOrganizationMembers)
    .innerJoin(
      partnerOrganizations,
      eq(partnerOrganizations.id, partnerOrganizationMembers.organizationId),
    )
    .where(
      and(
        eq(partnerOrganizationMembers.userId, userId),
        eq(partnerOrganizationMembers.isActive, true),
        inArray(partnerOrganizations.status, [...ORG_STATUSES_ALLOWING_ACCESS]),
      ),
    );
  const byId = new Map<number, AccessibleOrganization>();
  for (const row of rows) {
    const role = row.role as OrgRole;
    const existing = byId.get(row.id);
    if (!existing || ROLE_RANK[role] > ROLE_RANK[existing.role]) {
      byId.set(row.id, {
        id: row.id,
        displayName: row.displayName,
        status: row.status,
        role,
      });
    }
  }
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

export async function countActiveOwners(
  organizationId: number,
  executor: typeof db = db,
): Promise<number> {
  const rows = await executor
    .select({ userId: partnerOrganizationMembers.userId })
    .from(partnerOrganizationMembers)
    .where(
      and(
        eq(partnerOrganizationMembers.organizationId, organizationId),
        eq(partnerOrganizationMembers.isActive, true),
        eq(partnerOrganizationMembers.role, "owner"),
      ),
    );
  return rows.length;
}

export async function isLastActiveOwner(
  organizationId: number,
  userId: string,
  executor: typeof db = db,
): Promise<boolean> {
  const [row] = await executor
    .select({ role: partnerOrganizationMembers.role, isActive: partnerOrganizationMembers.isActive })
    .from(partnerOrganizationMembers)
    .where(
      and(
        eq(partnerOrganizationMembers.organizationId, organizationId),
        eq(partnerOrganizationMembers.userId, userId),
      ),
    )
    .limit(1);
  if (!row || !row.isActive || row.role !== "owner") return false;
  return (await countActiveOwners(organizationId, executor)) <= 1;
}
