import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { partnerOrganizations, venues } from "@/lib/db/schema";
import { requireOrganizationCapability } from "@/lib/venue-access";
import { jsonAccess, jsonError } from "@/lib/http/json";
import { saveOrganizationProfile } from "@/lib/partner/onboarding";
import { organizationHasValidContract, organizationContractRows } from "@/lib/partner/legal";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const organizationId = Number((await ctx.params).id);
  const access = await requireOrganizationCapability(organizationId, "view_organization");
  if (!access.ok) return jsonAccess(access);
  const [org] = await db.select().from(partnerOrganizations).where(eq(partnerOrganizations.id, organizationId)).limit(1);
  if (!org) return jsonError("Not found", 404);
  const orgVenues = await db.select({
    id: venues.id, nameRo: venues.nameRo, slug: venues.slug, isActive: venues.isActive, city: venues.city,
  }).from(venues).where(eq(venues.organizationId, organizationId));
  const contracts = await organizationContractRows(organizationId);
  const billing = access.role === "owner" || access.role === "admin"
    ? { billingEmail: org.billingEmail, billingPhone: org.billingPhone, bankDetails: org.bankDetails }
    : { billingEmail: null, billingPhone: null, bankDetails: null };
  return NextResponse.json({
    organization: {
      ...org,
      ...billing,
      bankDetails: billing.bankDetails,
      hasValidContract: await organizationHasValidContract(organizationId),
    },
    venues: orgVenues,
    contracts: contracts.map((row) => ({
      id: row.id,
      documentSlug: row.documentSlug,
      documentVersion: row.documentVersion,
      packVersion: row.packVersion,
      acceptedAt: row.acceptedAt,
      copyUrl: `/api/legal/accept/${row.id}/copy`,
      pdfUrl: `/api/legal/accept/${row.id}/pdf`,
    })),
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const organizationId = Number((await ctx.params).id);
  const body = await req.json().catch(() => null);
  const wantsBilling = Boolean(body && (body.billingEmail || body.billingPhone || body.bankDetails));
  const wantsLegal = Boolean(body && (body.legalName || body.idNumber || body.legalAddress || body.type));
  const capability = wantsLegal ? "manage_legal" : wantsBilling ? "manage_billing" : "manage_venues";
  const access = await requireOrganizationCapability(organizationId, capability);
  if (!access.ok) return jsonAccess(access);
  const saved = await saveOrganizationProfile(organizationId, body);
  if (!saved.ok) return jsonError(saved.error, saved.status ?? 400, saved);
  return NextResponse.json({ organization: { ...saved.organization, bankDetails: access.role === "owner" || access.role === "admin" ? saved.organization?.bankDetails : undefined } });
}
