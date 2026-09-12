import { NextResponse } from "next/server";
import {
  getCurrentAppUser,
  listAccessibleOrganizations,
} from "@/lib/venue-access";
import { jsonError } from "@/lib/http/json";
import { ensureDraftOrganization } from "@/lib/partner/onboarding";
import { organizationProfileSchema } from "@/lib/partner/validation";
import { db } from "@/lib/db";
import { partnerOrganizations } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

export async function GET() {
  const user = await getCurrentAppUser();
  if (!user) return jsonError("Unauthorized", 401);
  const orgs = await listAccessibleOrganizations(user.id);
  if (orgs.length === 0) return NextResponse.json({ organizations: [] });
  const rows = await db
    .select()
    .from(partnerOrganizations)
    .where(inArray(partnerOrganizations.id, orgs.map((org) => org.id)));
  const withRole = rows.map((row) => ({
    ...row,
    bankDetails: undefined,
    role: orgs.find((org) => org.id === row.id)?.role ?? "staff",
  }));
  return NextResponse.json({ organizations: withRole });
}

const createSchema = organizationProfileSchema.pick({
  type: true,
  displayName: true,
});

export async function POST(req: Request) {
  const user = await getCurrentAppUser();
  if (!user) return jsonError("Unauthorized", 401);
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Validation failed", 400, { details: parsed.error.issues });
  const organization = await ensureDraftOrganization(user, parsed.data);
  return NextResponse.json({ organization: { ...organization, bankDetails: undefined } });
}
