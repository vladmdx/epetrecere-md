import { NextResponse } from "next/server";
import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { partnerOrganizations, venueHalls, venueImages, venues } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/admin";
import { ADMIN_NO_STORE_HEADERS } from "@/lib/admin/http";
import { parsePositiveIntId } from "@/lib/admin/parse-positive-int";
import {
  mapAdminGeneralImages,
  mapAdminOrganizationForVenue,
  mapAdminVenueHalls,
} from "@/lib/admin/venue-detail";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.error },
      { status: gate.status, headers: ADMIN_NO_STORE_HEADERS },
    );
  }

  const { id: rawId } = await params;
  const id = parsePositiveIntId(rawId);
  if (id == null) {
    return NextResponse.json(
      { error: "Invalid id" },
      { status: 400, headers: ADMIN_NO_STORE_HEADERS },
    );
  }

  const [venue] = await db
    .select({
      id: venues.id,
      nameRo: venues.nameRo,
      nameRu: venues.nameRu,
      nameEn: venues.nameEn,
      slug: venues.slug,
      descriptionRo: venues.descriptionRo,
      descriptionRu: venues.descriptionRu,
      descriptionEn: venues.descriptionEn,
      address: venues.address,
      city: venues.city,
      capacityMin: venues.capacityMin,
      capacityMax: venues.capacityMax,
      pricePerPerson: venues.pricePerPerson,
      phone: venues.phone,
      email: venues.email,
      website: venues.website,
      menuUrl: venues.menuUrl,
      menuPdfUrl: venues.menuPdfUrl,
      virtualTourUrl: venues.virtualTourUrl,
      isActive: venues.isActive,
      isFeatured: venues.isFeatured,
      ratingAvg: venues.ratingAvg,
      ratingCount: venues.ratingCount,
      seoTitleRo: venues.seoTitleRo,
      seoTitleRu: venues.seoTitleRu,
      seoTitleEn: venues.seoTitleEn,
      seoDescRo: venues.seoDescRo,
      seoDescRu: venues.seoDescRu,
      seoDescEn: venues.seoDescEn,
      organizationId: venues.organizationId,
    })
    .from(venues)
    .where(eq(venues.id, id))
    .limit(1);

  if (!venue) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: ADMIN_NO_STORE_HEADERS },
    );
  }

  const [orgRow] =
    venue.organizationId != null
      ? await db
          .select({
            id: partnerOrganizations.id,
            displayName: partnerOrganizations.displayName,
            legalName: partnerOrganizations.legalName,
            type: partnerOrganizations.type,
            status: partnerOrganizations.status,
          })
          .from(partnerOrganizations)
          .where(eq(partnerOrganizations.id, venue.organizationId))
          .limit(1)
      : [null];

  const hallRows = await db
    .select({
      id: venueHalls.id,
      venueId: venueHalls.venueId,
      nameRo: venueHalls.nameRo,
      nameRu: venueHalls.nameRu,
      nameEn: venueHalls.nameEn,
      slug: venueHalls.slug,
      status: venueHalls.status,
      isLegacyDefault: venueHalls.isLegacyDefault,
      capacityMin: venueHalls.capacityMin,
      capacityMax: venueHalls.capacityMax,
      pricingModel: venueHalls.pricingModel,
      basePrice: venueHalls.basePrice,
      minimumOrder: venueHalls.minimumOrder,
      currency: venueHalls.currency,
      depositType: venueHalls.depositType,
      depositValue: venueHalls.depositValue,
      sortOrder: venueHalls.sortOrder,
      updatedAt: venueHalls.updatedAt,
    })
    .from(venueHalls)
    .where(eq(venueHalls.venueId, venue.id))
    .orderBy(asc(venueHalls.sortOrder), asc(venueHalls.id));

  const hallIds = hallRows.map((hall) => hall.id);
  const photoRows =
    hallIds.length > 0
      ? await db
          .select({
            hallId: venueImages.hallId,
            photoCount: count(),
          })
          .from(venueImages)
          .where(inArray(venueImages.hallId, hallIds))
          .groupBy(venueImages.hallId)
      : [];
  const photoCountByHallId = new Map<number, number>();
  for (const row of photoRows) {
    if (row.hallId != null) {
      photoCountByHallId.set(row.hallId, Number(row.photoCount));
    }
  }

  const imageRows = await db
    .select({
      id: venueImages.id,
      venueId: venueImages.venueId,
      hallId: venueImages.hallId,
      url: venueImages.url,
      altRo: venueImages.altRo,
      altRu: venueImages.altRu,
      altEn: venueImages.altEn,
      sortOrder: venueImages.sortOrder,
      isCover: venueImages.isCover,
    })
    .from(venueImages)
    .where(and(eq(venueImages.venueId, venue.id), isNull(venueImages.hallId)))
    .orderBy(asc(venueImages.sortOrder), asc(venueImages.id));

  const { organizationId, ...venueFields } = venue;
  return NextResponse.json(
    {
      ...venueFields,
      organization: mapAdminOrganizationForVenue(organizationId, orgRow),
      halls: mapAdminVenueHalls({
        venueId: venue.id,
        venueSlug: venue.slug,
        venueIsActive: venue.isActive,
        organizationStatus: orgRow?.status ?? null,
        halls: hallRows,
        photoCountByHallId,
      }),
      images: mapAdminGeneralImages(venue.id, imageRows),
    },
    { headers: ADMIN_NO_STORE_HEADERS },
  );
}
