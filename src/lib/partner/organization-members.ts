/**
 * Organization membership writes serialized with organization signing.
 *
 * Every mutation takes all affected user locks and then the organization
 * legal-scope lock, and re-authorizes the actor inside that transaction. This makes revoke/demote
 * versus sign deterministic: whichever transaction owns the lock first wins,
 * and the second observes the committed membership state.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  artists,
  partnerOrganizationMembers,
} from "@/lib/db/schema";
import {
  acquireLegalScopeLock,
  acquireLegalScopeLocks,
} from "@/lib/booking/advisory-locks";
import {
  authorizeOrganizationCapabilityLocked,
  countActiveOwners,
  getLockedAppUserById,
  type OrgRole,
} from "@/lib/venue-access";

type Member = typeof partnerOrganizationMembers.$inferSelect;

type LegalLockTransaction = Parameters<typeof acquireLegalScopeLock>[0];

export type OrganizationMemberMutationResult =
  | { ok: true; member?: Member }
  | { ok: false; status: 403 | 404 | 409; error: string; code: string };

/**
 * Lock an account before discovering its memberships, then lock every
 * organization in numeric order. Runtime grants follow the same user→org
 * order, so the returned set remains stable until the transaction ends.
 */
export async function acquireUserMembershipMutationLocks(
  tx: LegalLockTransaction,
  userId: string,
): Promise<number[]> {
  await acquireLegalScopeLocks(tx, { userIds: [userId] });
  const executor = tx as unknown as typeof db;
  const memberships = await executor
    .select({ organizationId: partnerOrganizationMembers.organizationId })
    .from(partnerOrganizationMembers)
    .where(eq(partnerOrganizationMembers.userId, userId));
  const organizationIds = [...new Set(memberships.map((row) => row.organizationId))]
    .sort((a, b) => a - b);
  await acquireLegalScopeLocks(tx, { organizationIds });
  return organizationIds;
}

async function authorizeLockedActor(
  executor: typeof db,
  actorUserId: string,
  organizationId: number,
) {
  const actor = await getLockedAppUserById(actorUserId, executor);
  if (!actor) return null;
  const access = await authorizeOrganizationCapabilityLocked(
    actor,
    organizationId,
    "manage_members",
    executor,
  );
  return access.ok ? access : null;
}

async function accountCanJoinVenueOrganization(
  executor: typeof db,
  userId: string,
): Promise<boolean> {
  const user = await getLockedAppUserById(userId, executor);
  if (!user || user.role === "artist") return false;

  const [artistProfile] = await executor
    .select({ id: artists.id })
    .from(artists)
    .where(eq(artists.userId, userId))
    .limit(1);
  return !artistProfile;
}

const ROLE_CONFLICT_RESULT = {
  ok: false as const,
  status: 409 as const,
  error: "Contul de artist nu poate deveni membru al unei organizații de localuri.",
  code: "ROLE_CONFLICT",
};

export async function upsertOrganizationMember(
  actorUserId: string,
  organizationId: number,
  input: { userId: string; role: OrgRole },
): Promise<OrganizationMemberMutationResult> {
  return db.transaction(async (tx) => {
    const executor = tx as unknown as typeof db;
    await acquireLegalScopeLocks(tx, {
      userIds: [actorUserId, input.userId],
      organizationIds: [organizationId],
    });
    if (!await authorizeLockedActor(executor, actorUserId, organizationId)) {
      return { ok: false as const, status: 403 as const, error: "Forbidden", code: "FORBIDDEN" };
    }
    if (!await getLockedAppUserById(input.userId, executor)) {
      return { ok: false as const, status: 404 as const, error: "User not found", code: "USER_NOT_FOUND" };
    }
    if (!await accountCanJoinVenueOrganization(executor, input.userId)) {
      return ROLE_CONFLICT_RESULT;
    }

    const [existing] = await executor
      .select()
      .from(partnerOrganizationMembers)
      .where(and(
        eq(partnerOrganizationMembers.organizationId, organizationId),
        eq(partnerOrganizationMembers.userId, input.userId),
      ))
      .for("update")
      .limit(1);
    if (existing) {
      if (
        existing.role === "owner" &&
        existing.isActive &&
        input.role !== "owner" &&
        await countActiveOwners(organizationId, executor) <= 1
      ) {
        return {
          ok: false as const,
          status: 409 as const,
          error: "LAST_ORG_OWNER_TRANSFER_REQUIRED",
          code: "LAST_ORG_OWNER_TRANSFER_REQUIRED",
        };
      }
      const [member] = await executor
        .update(partnerOrganizationMembers)
        .set({ role: input.role, isActive: true, updatedAt: new Date() })
        .where(eq(partnerOrganizationMembers.id, existing.id))
        .returning();
      return { ok: true as const, member };
    }
    const [member] = await executor
      .insert(partnerOrganizationMembers)
      .values({
        organizationId,
        userId: input.userId,
        role: input.role,
        isActive: true,
      })
      .returning();
    return { ok: true as const, member };
  });
}

export async function updateOrganizationMember(
  actorUserId: string,
  organizationId: number,
  memberId: number,
  patch: { role?: OrgRole; isActive?: boolean },
): Promise<OrganizationMemberMutationResult> {
  return db.transaction(async (tx) => {
    const executor = tx as unknown as typeof db;
    const [target] = await executor
      .select({ userId: partnerOrganizationMembers.userId })
      .from(partnerOrganizationMembers)
      .where(and(
        eq(partnerOrganizationMembers.id, memberId),
        eq(partnerOrganizationMembers.organizationId, organizationId),
      ))
      .limit(1);
    if (!target) {
      return { ok: false as const, status: 404 as const, error: "Not found", code: "NOT_FOUND" };
    }
    await acquireLegalScopeLocks(tx, {
      userIds: [actorUserId, target.userId],
      organizationIds: [organizationId],
    });
    if (!await authorizeLockedActor(executor, actorUserId, organizationId)) {
      return { ok: false as const, status: 403 as const, error: "Forbidden", code: "FORBIDDEN" };
    }

    const [current] = await executor
      .select()
      .from(partnerOrganizationMembers)
      .where(and(
        eq(partnerOrganizationMembers.id, memberId),
        eq(partnerOrganizationMembers.organizationId, organizationId),
      ))
      .for("update")
      .limit(1);
    if (!current) {
      return { ok: false as const, status: 404 as const, error: "Not found", code: "NOT_FOUND" };
    }

    const nextRole = patch.role ?? (current.role as OrgRole);
    const nextActive = patch.isActive ?? current.isActive;
    if (
      nextActive &&
      !await accountCanJoinVenueOrganization(executor, current.userId)
    ) {
      return ROLE_CONFLICT_RESULT;
    }
    const removesActiveOwner = current.role === "owner" && current.isActive &&
      (nextRole !== "owner" || !nextActive);
    if (removesActiveOwner && await countActiveOwners(organizationId, executor) <= 1) {
      return {
        ok: false as const,
        status: 409 as const,
        error: "LAST_ORG_OWNER_TRANSFER_REQUIRED",
        code: "LAST_ORG_OWNER_TRANSFER_REQUIRED",
      };
    }

    const [member] = await executor
      .update(partnerOrganizationMembers)
      .set({ role: nextRole, isActive: nextActive, updatedAt: new Date() })
      .where(eq(partnerOrganizationMembers.id, current.id))
      .returning();
    return { ok: true as const, member };
  });
}

export async function transferOrganizationOwner(
  organizationId: number,
  fromUserId: string,
  toUserId: string,
): Promise<OrganizationMemberMutationResult> {
  if (fromUserId === toUserId) {
    return { ok: false, error: "SAME_USER", code: "SAME_USER", status: 409 };
  }
  return db.transaction(async (tx) => {
    const executor = tx as unknown as typeof db;
    await acquireLegalScopeLocks(tx, {
      userIds: [fromUserId, toUserId],
      organizationIds: [organizationId],
    });
    if (!await authorizeLockedActor(executor, fromUserId, organizationId)) {
      return { ok: false as const, status: 403 as const, error: "Forbidden", code: "FORBIDDEN" };
    }
    if (!await getLockedAppUserById(toUserId, executor)) {
      return { ok: false as const, status: 404 as const, error: "User not found", code: "USER_NOT_FOUND" };
    }
    if (!await accountCanJoinVenueOrganization(executor, toUserId)) {
      return ROLE_CONFLICT_RESULT;
    }

    const [target] = await executor
      .select()
      .from(partnerOrganizationMembers)
      .where(and(
        eq(partnerOrganizationMembers.organizationId, organizationId),
        eq(partnerOrganizationMembers.userId, toUserId),
      ))
      .for("update")
      .limit(1);
    if (target) {
      await executor
        .update(partnerOrganizationMembers)
        .set({ role: "owner", isActive: true, updatedAt: new Date() })
        .where(eq(partnerOrganizationMembers.id, target.id));
    } else {
      await executor.insert(partnerOrganizationMembers).values({
        organizationId,
        userId: toUserId,
        role: "owner",
        isActive: true,
      });
    }
    await executor
      .update(partnerOrganizationMembers)
      .set({ role: "admin", updatedAt: new Date() })
      .where(and(
        eq(partnerOrganizationMembers.organizationId, organizationId),
        eq(partnerOrganizationMembers.userId, fromUserId),
      ));
    if (await countActiveOwners(organizationId, executor) < 1) {
      throw new Error("organization_owner_transfer_invariant_failed");
    }
    return { ok: true as const };
  });
}
