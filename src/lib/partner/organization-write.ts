/**
 * Capability for organization writes is decided by field presence, not
 * truthiness: `{ legalName: "" }` still requires manage_legal.
 */
import type { OrganizationCapability } from "@/lib/venue-access";

export const ORGANIZATION_LEGAL_PATCH_KEYS = [
  "legalName",
  "idNumber",
  "legalAddress",
  "type",
] as const;

export const ORGANIZATION_BILLING_PATCH_KEYS = [
  "billingEmail",
  "billingPhone",
  "bankDetails",
] as const;

export function organizationWriteCapability(body: unknown): OrganizationCapability {
  const record =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  if (ORGANIZATION_LEGAL_PATCH_KEYS.some((key) => Object.prototype.hasOwnProperty.call(record, key))) {
    return "manage_legal";
  }
  if (ORGANIZATION_BILLING_PATCH_KEYS.some((key) => Object.prototype.hasOwnProperty.call(record, key))) {
    return "manage_billing";
  }
  return "manage_venues";
}
