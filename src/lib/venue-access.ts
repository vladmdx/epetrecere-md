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
  partnerOrganizationMembers,
  users,
  venueHalls,
  venues,
} from "@/lib/db/schema";
import { isMultiHallEnabled } from "@/lib/feature-flags";

export type OrgRole = "owner" | "admin" | "manager" | "staff";

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
): Promise<OrgRole | null> {
  const rows = await db
    .select({ role: partnerOrganizationMembers.role })
    .from(partnerOrganizationMembers)
    .where(
      and(
        eq(partnerOrganizationMembers.userId, userId),
        eq(partnerOrganizationMembers.organizationId, organizationId),
        eq(partnerOrganizationMembers.isActive, true),
      ),
    );
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
): Promise<OrgAccess | AccessError> {
  if (!Number.isFinite(organizationId)) {
    return { ok: false, status: 404, error: "Invalid organization id" };
  }
  if (user.isGlobalAdmin) {
    return { ok: true, user, organizationId, role: "owner", viaAdmin: true };
  }
  const role = await membershipRole(user.id, organizationId);
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
): Promise<VenueAccess | AccessError> {
  if (!Number.isFinite(venueId)) {
    return { ok: false, status: 404, error: "Invalid venue id" };
  }
  const [venue] = await db
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
    const role = await membershipRole(user.id, venue.organizationId);
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
    .where(
      and(
        eq(partnerOrganizationMembers.userId, userId),
        eq(partnerOrganizationMembers.isActive, true),
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
 * Deterministic primary venue id for dashboard server pages that today assume a
 * single venue. Returns the lowest accessible venue id, or null. Routes through
 * the membership resolver (flag-gated) instead of `venues.user_id`. Multi-venue
 * selection UI arrives in a later phase; until then this is stable, not "first
 * row arbitrary".
 */
export async function getPrimaryAccessibleVenueId(
  userId: string,
): Promise<number | null> {
  const ids = await listAccessibleVenueIds(userId);
  if (ids.length === 0) return null;
  return ids.slice().sort((a, b) => a - b)[0];
}

/**
 * The user ids that should receive owner-facing notifications for a venue.
 * Resolves the real recipients rather than "the first venue's user":
 *   - MULTI_HALL on + organization set → active owner/admin members;
 *   - otherwise → the legacy venues.user_id (when present).
 * Always includes the legacy owner as a safety net so no notification is lost
 * during the transition.
 */
export async function getVenueOwnerUserIds(venueId: number): Promise<string[]> {
  const [venue] = await db
    .select({ organizationId: venues.organizationId, userId: venues.userId })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  if (!venue) return [];

  const recipients = new Set<string>();
  if (isMultiHallEnabled() && venue.organizationId != null) {
    const members = await db
      .select({ userId: partnerOrganizationMembers.userId })
      .from(partnerOrganizationMembers)
      .where(
        and(
          eq(partnerOrganizationMembers.organizationId, venue.organizationId),
          eq(partnerOrganizationMembers.isActive, true),
          inArray(partnerOrganizationMembers.role, ["owner", "admin"]),
        ),
      );
    for (const m of members) recipients.add(m.userId);
  }
  if (venue.userId) recipients.add(venue.userId);
  return [...recipients];
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
