export const ADMIN_ORGANIZATION_SUMMARY_FIELDS = [
  "id",
  "displayName",
  "legalName",
  "type",
  "status",
] as const;

export type AdminOrganizationSummary = {
  id: number;
  displayName: string;
  legalName: string | null;
  type: string;
  status: string;
};

export function mapAdminOrganizationSummary(
  row:
    | {
        id: number;
        displayName: string;
        legalName: string | null;
        type: string;
        status: string;
      }
    | null
    | undefined,
): AdminOrganizationSummary | null {
  if (row == null || !Number.isSafeInteger(row.id) || row.id < 1) return null;
  return {
    id: row.id,
    displayName: row.displayName,
    legalName: row.legalName,
    type: row.type,
    status: row.status,
  };
}
