import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { legalAcceptances, partnerOrganizations } from "@/lib/db/schema";
import { onboardingAgreementStatus } from "@/lib/legal/onboarding-agreement";
import { VENUE_REQUIRED_DOCS } from "@/lib/legal";

export async function organizationHasValidContract(organizationId: number): Promise<boolean> {
  const rows = await db
    .select()
    .from(legalAcceptances)
    .where(
      and(
        eq(legalAcceptances.organizationId, organizationId),
        eq(legalAcceptances.subjectType, "venue"),
      ),
    );
  return onboardingAgreementStatus(rows, "venue").status === "resumable";
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
