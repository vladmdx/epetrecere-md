import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { legalAcceptances, partnerOrganizations } from "@/lib/db/schema";
import { onboardingAgreementStatus } from "@/lib/legal/onboarding-agreement";
import { VENUE_REQUIRED_DOCS, type PartnerIdentity, type PartnerType } from "@/lib/legal";

export function organizationContractIdentityEquals(
  org: {
    type: string;
    legalName: string | null;
    idNumber: string | null;
    legalAddress: string | null;
  },
  identity: {
    partnerType: string;
    legalName: string;
    idNumber: string;
    legalAddress: string;
  },
): boolean {
  return (
    org.type === identity.partnerType &&
    (org.legalName ?? "") === identity.legalName &&
    (org.idNumber ?? "") === identity.idNumber &&
    (org.legalAddress ?? "") === identity.legalAddress
  );
}

export async function resolveOrganizationSigningIdentity(
  organizationId: number,
  clientIdentity: PartnerIdentity,
): Promise<
  | { ok: true; identity: PartnerIdentity }
  | { ok: false; code: "IDENTITY_MISMATCH" | "LEGAL_IDENTITY_INCOMPLETE"; status: 409 }
> {
  const snapshot = await loadOrganizationLegalSnapshot(organizationId);
  if (!snapshot?.legalName || !snapshot.idNumber || !snapshot.legalAddress) {
    return { ok: false, code: "LEGAL_IDENTITY_INCOMPLETE", status: 409 };
  }
  if (!organizationContractIdentityEquals(snapshot, clientIdentity)) {
    return { ok: false, code: "IDENTITY_MISMATCH", status: 409 };
  }
  return {
    ok: true,
    identity: {
      partnerType: snapshot.type as PartnerType,
      legalName: snapshot.legalName,
      idNumber: snapshot.idNumber,
      legalAddress: snapshot.legalAddress,
      representativeName: clientIdentity.representativeName ?? null,
    },
  };
}

export async function organizationHasValidContract(organizationId: number): Promise<boolean> {
  const snapshot = await loadOrganizationLegalSnapshot(organizationId);
  if (!snapshot) return false;
  const rows = await db
    .select()
    .from(legalAcceptances)
    .where(
      and(
        eq(legalAcceptances.organizationId, organizationId),
        eq(legalAcceptances.subjectType, "venue"),
      ),
    );
  const matching = rows.filter((row) =>
    organizationContractIdentityEquals(snapshot, {
      partnerType: row.partnerType ?? snapshot.type,
      legalName: row.legalName ?? "",
      idNumber: row.idNumber ?? "",
      legalAddress: row.legalAddress ?? "",
    }),
  );
  return onboardingAgreementStatus(matching, "venue").status === "resumable";
}

export async function missingOrganizationDocuments(organizationId: number): Promise<string[]> {
  if (await organizationHasValidContract(organizationId)) return [];
  return [...VENUE_REQUIRED_DOCS];
}

export async function organizationContractRows(organizationId: number) {
  return db
    .select()
    .from(legalAcceptances)
    .where(
      and(
        eq(legalAcceptances.organizationId, organizationId),
        isNotNull(legalAcceptances.organizationId),
      ),
    );
}

export async function loadOrganizationLegalSnapshot(organizationId: number) {
  const [org] = await db
    .select({
      id: partnerOrganizations.id,
      type: partnerOrganizations.type,
      legalName: partnerOrganizations.legalName,
      idNumber: partnerOrganizations.idNumber,
      legalAddress: partnerOrganizations.legalAddress,
      billingEmail: partnerOrganizations.billingEmail,
      billingPhone: partnerOrganizations.billingPhone,
    })
    .from(partnerOrganizations)
    .where(eq(partnerOrganizations.id, organizationId))
    .limit(1);
  return org ?? null;
}
