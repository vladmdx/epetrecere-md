import type { OrgRole } from "@/lib/venue-access";
import { ORG_CAPABILITY_MIN_ROLE } from "@/lib/venue-access";

type OrgRow = {
  id: number;
  type: string;
  displayName: string;
  status: string;
  legalName: string | null;
  idNumber: string | null;
  legalAddress: string | null;
  billingEmail: string | null;
  billingPhone: string | null;
  bankDetails: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
};

const ROLE_RANK: Record<OrgRole, number> = {
  staff: 0,
  manager: 1,
  admin: 2,
  owner: 3,
};

export function organizationRoleHasCapability(
  role: OrgRole,
  capability: keyof typeof ORG_CAPABILITY_MIN_ROLE,
): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[ORG_CAPABILITY_MIN_ROLE[capability]];
}

export type OrganizationCapabilities = Readonly<{
  manageVenues: boolean;
  manageBilling: boolean;
  manageLegal: boolean;
  manageMembers: boolean;
}>;

/** Client-safe capability projection; callers never need to recreate role ranks. */
export function organizationCapabilitiesForRole(
  role: OrgRole,
): OrganizationCapabilities {
  return {
    manageVenues: organizationRoleHasCapability(role, "manage_venues"),
    manageBilling: organizationRoleHasCapability(role, "manage_billing"),
    manageLegal: organizationRoleHasCapability(role, "manage_legal"),
    manageMembers: organizationRoleHasCapability(role, "manage_members"),
  };
}

/** Operational DTO for staff; legal/contract fields only with manage_legal; billing with manage_billing. */
export function redactOrganizationForRole<T extends OrgRow>(org: T, role: OrgRole) {
  const legal = organizationRoleHasCapability(role, "manage_legal")
    ? {
        legalName: org.legalName,
        idNumber: org.idNumber,
        legalAddress: org.legalAddress,
      }
    : {
        legalName: null,
        idNumber: null,
        legalAddress: null,
      };
  const billing = organizationRoleHasCapability(role, "manage_billing")
    ? {
        billingEmail: org.billingEmail,
        billingPhone: org.billingPhone,
        bankDetails: org.bankDetails,
      }
    : {
        billingEmail: null,
        billingPhone: null,
        bankDetails: null,
      };
  return {
    id: org.id,
    type: org.type,
    displayName: org.displayName,
    status: org.status,
    createdAt: org.createdAt,
    updatedAt: org.updatedAt,
    ...legal,
    ...billing,
    role,
    capabilities: organizationCapabilitiesForRole(role),
  };
}
