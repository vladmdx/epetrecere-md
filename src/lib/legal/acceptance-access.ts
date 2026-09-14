import { authorizeOrganizationCapability, type AppUser } from "@/lib/venue-access";

export type LegalAcceptanceAccessAnchor = {
  userId: string | null;
  organizationId: number | null;
};

/**
 * A signer keeps access to their own evidence. Organization owners with the
 * legal capability can also retrieve the organization's contract, while a
 * removed member or member of another organization cannot.
 */
export async function canViewLegalAcceptance(
  viewer: AppUser,
  anchor: LegalAcceptanceAccessAnchor,
): Promise<boolean> {
  if (viewer.isGlobalAdmin || anchor.userId === viewer.id) return true;
  if (!anchor.organizationId) return false;
  const access = await authorizeOrganizationCapability(
    viewer,
    anchor.organizationId,
    "manage_legal",
  );
  return access.ok;
}
