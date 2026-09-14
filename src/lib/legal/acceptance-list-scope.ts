import { and, eq, isNull } from "drizzle-orm";
import { legalAcceptances } from "@/lib/db/schema";

export type LegalAcceptanceListScope =
  | { kind: "personal"; userId: string }
  | { kind: "organization"; organizationId: number };

/** `null` means absent; `undefined` means present but invalid. */
export function parseLegalListOrganizationId(
  raw: string | null,
): number | null | undefined {
  if (raw == null) return null;
  if (!/^[1-9]\d*$/.test(raw)) return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) return undefined;
  return value;
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
