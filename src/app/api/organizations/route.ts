import { NextResponse } from "next/server";
import {
  getCurrentAppUser,
  listAccessibleOrganizations,
} from "@/lib/venue-access";
import { jsonError } from "@/lib/http/json";
import {
  ensureDraftOrganization,
  OrganizationDraftUpdateError,
} from "@/lib/partner/onboarding";
import { organizationCreateSchema, validatePhoneOrError } from "@/lib/partner/validation";
import { jsonIfMultiHallDisabled } from "@/lib/partner/multi-hall-gate";
import { redactOrganizationForRole } from "@/lib/partner/organization-dto";
import { db } from "@/lib/db";
import { partnerOrganizations } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import type { OrgRole } from "@/lib/venue-access";

export async function GET() {
  const user = await getCurrentAppUser();
  if (!user) return jsonError("Unauthorized", 401);
  const orgs = await listAccessibleOrganizations(user.id);
  if (orgs.length === 0) return NextResponse.json({ organizations: [] });
  const rows = await db
    .select()
    .from(partnerOrganizations)
    .where(inArray(partnerOrganizations.id, orgs.map((org) => org.id)));
  const withRole = rows.map((row) => {
    const role = (orgs.find((org) => org.id === row.id)?.role ?? "staff") as OrgRole;
    return redactOrganizationForRole(row, role);
  });
  return NextResponse.json({ organizations: withRole });
}

export async function POST(req: Request) {
  const user = await getCurrentAppUser();
  if (!user) return jsonError("Unauthorized", 401);
  const blocked = jsonIfMultiHallDisabled();
  if (blocked) return blocked;
  const body = await req.json().catch(() => null);
  const parsed = organizationCreateSchema.safeParse(body);
  if (!parsed.success) return jsonError("Validation failed", 400, { details: parsed.error.issues });
  if (parsed.data.billingPhone) {
    const phone = validatePhoneOrError(parsed.data.billingPhone);
    if (!phone.ok) return jsonError(phone.message, 400, { field: "billingPhone" });
    parsed.data.billingPhone = phone.e164;
  }
  try {
    const organization = await ensureDraftOrganization(user, parsed.data);
    return NextResponse.json({ organization: redactOrganizationForRole(organization, "owner") });
  } catch (error) {
    if (error instanceof OrganizationDraftUpdateError) {
      return jsonError(error.code, error.status, { code: error.code });
    }
    throw error;
  }
}
