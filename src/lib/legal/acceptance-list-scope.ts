import { and, eq, isNull } from "drizzle-orm";
import { legalAcceptances } from "@/lib/db/schema";
import { organizationRoleHasCapability } from "@/lib/partner/organization-dto";
import type { OrgRole } from "@/lib/venue-access";

export type LegalAcceptanceListScope =
  | { kind: "personal"; userId: string }
  | { kind: "organization"; organizationId: number };

export function parseLegalListOrganizationId(raw: string | null): number | null {
  if (raw == null || raw === "") return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

/**
 * Membership snapshot for organization legal list access.
 * Deleted (missing), deactivated, or non-owner ("refused"/demoted) → 403.
 */
export function organizationLegalListAccess(membership: {
  present: boolean;
  isActive: boolean;
  role: OrgRole | null;
} | null): { ok: true } | { ok: false; status: 403 } {
  if (!membership?.present || !membership.isActive || !membership.role) {
    return { ok: false, status: 403 };
  }
  if (!organizationRoleHasCapability(membership.role, "manage_legal")) {
    return { ok: false, status: 403 };
  }
  return { ok: true };
}

export function legalAcceptancesListScope(input: {
  userId: string;
  organizationId: number | null;
  orgAccessOk: boolean;
}): { ok: true; scope: LegalAcceptanceListScope } | { ok: false; status: 403 } {
  if (input.organizationId != null) {
    if (!input.orgAccessOk) return { ok: false, status: 403 };
    return {
      ok: true,
      scope: { kind: "organization", organizationId: input.organizationId },
    };
  }
  return { ok: true, scope: { kind: "personal", userId: input.userId } };
}

export function legalAcceptancesWhere(scope: LegalAcceptanceListScope) {
  if (scope.kind === "organization") {
    return eq(legalAcceptances.organizationId, scope.organizationId);
  }
  return and(
    eq(legalAcceptances.userId, scope.userId),
    isNull(legalAcceptances.organizationId),
  );
}

export function filterLegalAcceptancesForScope<
  T extends { organizationId: number | null; userId?: string | null },
>(rows: T[], scope: LegalAcceptanceListScope): T[] {
  if (scope.kind === "organization") {
    return rows.filter((row) => row.organizationId === scope.organizationId);
  }
  return rows.filter(
    (row) => row.organizationId == null && row.userId === scope.userId,
  );
}
