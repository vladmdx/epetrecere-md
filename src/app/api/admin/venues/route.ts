import { NextRequest, NextResponse } from "next/server";
import { asc, count, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { partnerOrganizations, venueHalls, venues } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/admin";
import { ADMIN_NO_STORE_HEADERS } from "@/lib/admin/http";
import { adminVenueListConditions } from "@/lib/admin/venue-list-sql";
import {
  mapAdminVenueListItems,
  parseAdminVenueListQuery,
  type AdminVenueHallRow,
  type AdminVenueListRow,
} from "@/lib/admin/venue-list";

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.error },
      { status: gate.status, headers: ADMIN_NO_STORE_HEADERS },
    );
  }

  const parsed = parseAdminVenueListQuery(req.nextUrl.searchParams);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status, headers: ADMIN_NO_STORE_HEADERS },
    );
  }

  const where = adminVenueListConditions(parsed);
  const [totalRow] = await db
    .select({ value: count() })
    .from(venues)
    .leftJoin(partnerOrganizations, eq(partnerOrganizations.id, venues.organizationId))
    .where(where);

  const rows: AdminVenueListRow[] = await db
    .select({
      id: venues.id,
      nameRo: venues.nameRo,
      nameRu: venues.nameRu,
      nameEn: venues.nameEn,
      slug: venues.slug,
      city: venues.city,
      isActive: venues.isActive,
      isFeatured: venues.isFeatured,
      ratingAvg: venues.ratingAvg,
      capacityMin: venues.capacityMin,
      capacityMax: venues.capacityMax,
      pricePerPerson: venues.pricePerPerson,
      organizationId: venues.organizationId,
      orgId: partnerOrganizations.id,
      orgDisplayName: partnerOrganizations.displayName,
      orgLegalName: partnerOrganizations.legalName,
      orgType: partnerOrganizations.type,
      orgStatus: partnerOrganizations.status,
    })
    .from(venues)
    .leftJoin(partnerOrganizations, eq(partnerOrganizations.id, venues.organizationId))
    .where(where)
    .orderBy(asc(venues.nameRo), asc(venues.id))
    .limit(parsed.limit)
    .offset((parsed.page - 1) * parsed.limit);

  const venueIds = rows.map((row) => row.id);
  const hallRows: AdminVenueHallRow[] =
    venueIds.length > 0
      ? await db
          .select({
            id: venueHalls.id,
            venueId: venueHalls.venueId,
            status: venueHalls.status,
            capacityMin: venueHalls.capacityMin,
            capacityMax: venueHalls.capacityMax,
            pricingModel: venueHalls.pricingModel,
            basePrice: venueHalls.basePrice,
            minimumOrder: venueHalls.minimumOrder,
            currency: venueHalls.currency,
          })
          .from(venueHalls)
          .where(inArray(venueHalls.venueId, venueIds))
          .orderBy(asc(venueHalls.sortOrder), asc(venueHalls.id))
      : [];

  const items = mapAdminVenueListItems(rows, hallRows);
  return NextResponse.json(
    {
      items,
      total: Number(totalRow?.value ?? 0),
      page: parsed.page,
      limit: parsed.limit,
    },
    { headers: ADMIN_NO_STORE_HEADERS },
  );
}
