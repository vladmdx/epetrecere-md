import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { artists, venues, users, categories, venueImages, artistPackages, legalAcceptances, partnerOrganizations, venueHalls } from "@/lib/db/schema";
import { eq, and, sql, inArray, asc, desc, count, isNull } from "drizzle-orm";
import { attachRegistrationVenueAudit } from "@/lib/admin/registration-queue";
import { mapAdminOrganizationSummary } from "@/lib/admin/organization-summary";
import { sendEmail } from "@/lib/email/send";
import { registrationStatusEmail } from "@/lib/email/templates/registration-status";
import { registrationDecisionSchema } from "@/lib/validation/vendor-profile";
import { revalidateVendorCatalog } from "@/lib/vendors/revalidate";
import {
  approvePartnerArtist,
  approvePartnerVenue,
  listPendingPartnerVenues,
  rejectPartnerArtist,
  rejectPartnerVenue,
} from "@/lib/partner/registration-decision";
import { jsonIfOrganizationBackedVenueDisabled } from "@/lib/partner/multi-hall-gate";
import { adminContractsForVenue } from "@/lib/partner/legal";
import { isMultiHallEnabled } from "@/lib/feature-flags";
import { hallReviewIssues } from "@/lib/partner/hall-review";

async function requireAdmin() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const [user] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) return null;
  return user;
}

// GET — list pending registrations (artists + venues with isActive=false)
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get pending artists (isActive=false, have a userId — registered through onboarding)
  const pendingArtists = await db
    .select({
      id: artists.id,
      name: artists.nameRo,
      email: artists.email,
      phone: artists.phone,
      location: artists.location,
      description: artists.descriptionRo,
      categoryIds: artists.categoryIds,
      photoUrl: artists.photoUrl,
      baseCity: artists.baseCity,
      travelDistanceKm: artists.travelDistanceKm,
      travelSurchargeEnabled: artists.travelSurchargeEnabled,
      travelSurchargeAmount: artists.travelSurchargeAmount,
      priceHidden: artists.priceHidden,
      priceFrom: artists.priceFrom,
      createdAt: artists.createdAt,
      userId: artists.userId,
    })
    .from(artists)
    .where(and(eq(artists.isActive, false), sql`${artists.userId} IS NOT NULL`))
    .orderBy(artists.createdAt);

  // Get pending venues — includes extra org venues even when user_id is NULL.
  const pendingVenues = await listPendingPartnerVenues();

  // Cover images for the pending venues — venues' first uploaded photo.
  const venueIds = pendingVenues.map((v) => v.id);
  const venueImageRows = venueIds.length > 0
    ? await db
        .select({
          venueId: venueImages.venueId,
          url: venueImages.url,
          isCover: venueImages.isCover,
          sortOrder: venueImages.sortOrder,
        })
        .from(venueImages)
        .where(and(inArray(venueImages.venueId, venueIds), isNull(venueImages.hallId)))
        .orderBy(desc(venueImages.isCover), asc(venueImages.sortOrder))
    : [];
  const venueCoverMap = new Map<number, string>();
  for (const row of venueImageRows) {
    if (!venueCoverMap.has(row.venueId)) venueCoverMap.set(row.venueId, row.url);
  }

  const registrationOrgIds = [
    ...new Set(pendingVenues.map((v) => v.organizationId).filter((id): id is number => id != null)),
  ];
  const registrationOrgRows = registrationOrgIds.length
    ? await db
        .select({
          id: partnerOrganizations.id,
          displayName: partnerOrganizations.displayName,
          legalName: partnerOrganizations.legalName,
          type: partnerOrganizations.type,
          status: partnerOrganizations.status,
        })
        .from(partnerOrganizations)
        .where(inArray(partnerOrganizations.id, registrationOrgIds))
    : [];
  const organizationsById = new Map(
    registrationOrgRows
      .map((row) => mapAdminOrganizationSummary(row))
      .filter((row): row is NonNullable<typeof row> => row != null)
      .map((row) => [row.id, row]),
  );

  const registrationHallRows = venueIds.length
    ? await db
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
          sortOrder: venueHalls.sortOrder,
        })
        .from(venueHalls)
        .where(inArray(venueHalls.venueId, venueIds))
        .orderBy(asc(venueHalls.sortOrder), asc(venueHalls.id))
    : [];
  const registrationHallIds = registrationHallRows.map((hall) => hall.id);
  const registrationHallPhotoRows = registrationHallIds.length
    ? await db
        .select({
          hallId: venueImages.hallId,
          photoCount: count(),
        })
        .from(venueImages)
        .where(inArray(venueImages.hallId, registrationHallIds))
        .groupBy(venueImages.hallId)
    : [];
  const photoCountByHallId = new Map<number, number>();
  for (const row of registrationHallPhotoRows) {
    if (row.hallId != null) photoCountByHallId.set(row.hallId, Number(row.photoCount));
  }

  // Get all categories for artist category names
  const allCategories = await db
    .select({ id: categories.id, nameRo: categories.nameRo })
    .from(categories);
  const catMap = new Map(allCategories.map((c) => [c.id, c.nameRo]));

  // Get user info for all pending items
  const userIds = [
    ...pendingArtists.map((a) => a.userId).filter(Boolean),
    ...pendingVenues.map((v) => v.userId).filter(Boolean),
  ] as string[];

  const userRows =
    userIds.length > 0
      ? await db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(inArray(users.id, userIds))
      : [];
  const userMap = new Map(userRows.map((u) => [u.id, u]));
  const signedRows = userIds.length ? await db.select({
    id: legalAcceptances.id,
    userId: legalAcceptances.userId,
    subjectType: legalAcceptances.subjectType,
    documentSlug: legalAcceptances.documentSlug,
    documentTitle: legalAcceptances.documentTitle,
    signatureName: legalAcceptances.signatureName,
    acceptedAt: legalAcceptances.acceptedAt,
  }).from(legalAcceptances).where(inArray(legalAcceptances.userId, userIds))
    .orderBy(desc(legalAcceptances.acceptedAt)) : [];
  const orgIds = pendingVenues.map((v) => v.organizationId).filter((id): id is number => id != null);
  const orgSignedRows = orgIds.length
    ? await db.select({
        id: legalAcceptances.id,
        userId: legalAcceptances.userId,
        organizationId: legalAcceptances.organizationId,
        subjectType: legalAcceptances.subjectType,
        documentSlug: legalAcceptances.documentSlug,
        documentTitle: legalAcceptances.documentTitle,
        signatureName: legalAcceptances.signatureName,
        acceptedAt: legalAcceptances.acceptedAt,
      }).from(legalAcceptances).where(inArray(legalAcceptances.organizationId, orgIds))
        .orderBy(desc(legalAcceptances.acceptedAt))
    : [];
  const contractsFor = (userId: string | null, subjectType: "artist" | "venue") => signedRows
    .filter(row => row.userId === userId && row.subjectType === subjectType)
    .map(row => ({ ...row, copyUrl: `/api/legal/accept/${row.id}/copy` }));
  const contractsForVenue = (venue: { userId: string | null; organizationId: number | null }) =>
    adminContractsForVenue(venue, orgSignedRows, signedRows).map((row) => ({
      ...row,
      copyUrl: `/api/legal/accept/${row.id}/copy`,
    }));
  const artistIds = pendingArtists.map(a => a.id);
  const packageRows = artistIds.length ? await db.select().from(artistPackages)
    .where(inArray(artistPackages.artistId, artistIds)) : [];

  // Combine into unified list
  const result = [
    ...pendingArtists.map((a) => {
      const u = a.userId ? userMap.get(a.userId) : null;
      const catName =
        a.categoryIds && a.categoryIds.length > 0
          ? a.categoryIds.map((id) => catMap.get(id) || `#${id}`).join(", ")
          : null;
      return {
        id: a.id,
        type: "artist" as const,
        name: a.name,
        email: a.email,
        phone: a.phone,
        location: a.location,
        description: a.description,
        categoryName: catName,
        capacity: null,
        photoUrl: a.photoUrl ?? null,
        baseCity: a.baseCity,
        travelDistanceKm: a.travelDistanceKm,
        travelSurchargeEnabled: a.travelSurchargeEnabled,
        travelSurchargeAmount: a.travelSurchargeAmount,
        priceHidden: a.priceHidden,
        priceFrom: a.priceFrom,
        packages: packageRows.filter(p => p.artistId === a.id),
        contracts: contractsFor(a.userId, "artist"),
        createdAt: a.createdAt?.toISOString() ?? new Date().toISOString(),
        userId: a.userId,
        userName: u?.name ?? null,
        userEmail: u?.email ?? null,
      };
    }),
    ...pendingVenues.map((v) => {
      const u = v.userId ? userMap.get(v.userId) : null;
      const cap =
        v.capacityMin && v.capacityMax
          ? `${v.capacityMin}–${v.capacityMax}`
          : v.capacityMax
            ? `până la ${v.capacityMax}`
            : null;
      const audit = attachRegistrationVenueAudit({
        venueId: v.id,
        organizationId: v.organizationId,
        organizationsById,
        halls: registrationHallRows,
        photoCountByHallId,
      });
      return {
        id: v.id,
        type: "venue" as const,
        name: v.name,
        email: v.email,
        phone: v.phone,
        location: v.city ?? null,
        description: v.description,
        categoryName: null,
        capacity: cap,
        photoUrl: venueCoverMap.get(v.id) ?? null,
        address: v.address,
        website: v.website,
        menuUrl: v.menuUrl,
        menuPdfUrl: v.menuPdfUrl,
        virtualTourUrl: v.virtualTourUrl,
        workingHours: v.workingHours,
        lat: v.lat,
        lng: v.lng,
        images: venueImageRows.filter(image => image.venueId === v.id),
        contracts: contractsForVenue(v),
        createdAt: v.createdAt?.toISOString() ?? new Date().toISOString(),
        userId: v.userId,
        organizationId: v.organizationId,
        userName: u?.name ?? null,
        userEmail: u?.email ?? null,
        organization: audit.organization,
        halls: audit.halls.map((hall) => ({
          ...hall,
          reviewIssues: hall.status === "pending" && v.organizationId != null
            ? hallReviewIssues(hall)
            : [],
        })),
        summaries: audit.summaries,
      };
    }),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}

// POST — approve or reject a registration
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = registrationDecisionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid registration decision" }, { status: 400 });
  const { id, type, action, hallIds, reviewReason } = parsed.data;

  try {
    let remainingPendingHallCount = 0;
    if (type === "artist") {
      const decided = action === "approve"
        ? await approvePartnerArtist(admin.id, id)
        : await rejectPartnerArtist(admin.id, id);
      if (!decided.ok) {
        return NextResponse.json(
          { error: decided.error, missing: decided.missing, code: decided.code },
          { status: decided.status },
        );
      }
      const artist = decided.artist;
      if (action === "approve") {
        revalidateVendorCatalog("artist", {
          profileSlugs: [artist.slug],
          directory: true,
          homepage: true,
          services: true,
        });
      }
      const emailTargets = [
        ...new Set([
          ...(artist.email ? [artist.email] : []),
          ...decided.emails
            .map((row) => row.email)
            .filter((value): value is string => Boolean(value)),
        ]),
      ];
      const approved = action === "approve";
      for (const email of emailTargets) {
        await sendEmail({
          to: email,
          subject: approved
            ? "Profilul tău pe ePetrecere.md a fost aprobat! 🎉"
            : "Actualizare privind înregistrarea pe ePetrecere.md",
          html: registrationStatusEmail({
            name: artist.nameRo,
            type: "artist",
            approved,
          }),
        }).catch((err) => console.error(
          approved
            ? "[email] Failed to send approval email:"
            : "[email] Failed to send rejection email:",
          err,
        ));
      }
    } else if (type === "venue") {
      const [venue] = await db
        .select({
          id: venues.id,
          nameRo: venues.nameRo,
          slug: venues.slug,
          email: venues.email,
          userId: venues.userId,
          isActive: venues.isActive,
          organizationId: venues.organizationId,
        })
        .from(venues)
        .where(eq(venues.id, id))
        .limit(1);

      if (!venue) {
        return NextResponse.json({ error: "Venue not found" }, { status: 404 });
      }

      const orgBlocked = jsonIfOrganizationBackedVenueDisabled(venue.organizationId);
      if (orgBlocked) return orgBlocked;

      if (venue.organizationId != null && !hallIds?.length) {
        return NextResponse.json(
          { error: "Selectează cel puțin o sală pentru această decizie", code: "HALL_SELECTION_REQUIRED" },
          { status: 400 },
        );
      }
      if (venue.organizationId == null && hallIds != null) {
        return NextResponse.json(
          { error: "Sala legacy nu acceptă selecție multi-sală", code: "HALL_SELECTION_INVALID" },
          { status: 400 },
        );
      }
      if (venue.organizationId != null && action === "reject" && !reviewReason) {
        return NextResponse.json(
          { error: "Scrie motivul refuzului (minimum 10 caractere)", code: "REVIEW_REASON_REQUIRED" },
          { status: 400 },
        );
      }

      let decidedVenue = venue;
      let decisionEmails: Array<{ userId: string; email: string | null }> = [];
      if (action === "approve") {
        const decided = await approvePartnerVenue(admin.id, id, hallIds);
        if (!decided.ok) {
          return NextResponse.json(
            { error: decided.error, missing: decided.missing, code: decided.code },
            { status: decided.status },
          );
        }
        decidedVenue = decided.venue;
        decisionEmails = decided.emails;
        remainingPendingHallCount = decided.remainingPendingHallCount;
      } else {
        const decided = await rejectPartnerVenue(admin.id, id, hallIds, reviewReason);
        if (!decided.ok) {
          return NextResponse.json(
            { error: decided.error, code: decided.code },
            { status: decided.status },
          );
        }
        decidedVenue = decided.venue;
        decisionEmails = decided.emails;
        remainingPendingHallCount = decided.remainingPendingHallCount;
      }

      // Reject may defensively withdraw a previously active-but-corrupt venue.
      // Invalidate both the pre-decision and authoritative post-decision slugs
      // so no cached public card/profile survives that transition.
      if (action === "approve" || venue.isActive || decidedVenue.isActive) {
        revalidateVendorCatalog("venue", {
          profileSlugs: [...new Set([venue.slug, decidedVenue.slug])],
          directory: true,
          homepage: true,
          services: true,
        });
      }

      const emailTargets = [
        ...new Set([
          ...(decidedVenue.email ? [decidedVenue.email] : []),
          ...decisionEmails.map((row) => row.email).filter((value): value is string => Boolean(value)),
        ]),
      ];
      const approved = action === "approve";
      const approvalCtaUrl = approved
        ? `https://epetrecere.md${isMultiHallEnabled()
          ? `/dashboard/locatii/${decidedVenue.id}`
          : "/dashboard/sala"}`
        : undefined;
      for (const email of emailTargets) {
        await sendEmail({
          to: email,
          subject: approved
            ? venue.organizationId != null ? "Sălile selectate au fost aprobate pe ePetrecere.md! 🎉" : "Sala ta pe ePetrecere.md a fost aprobată! 🎉"
            : venue.organizationId != null ? "Actualizare privind sălile trimise la aprobare" : "Actualizare privind înregistrarea pe ePetrecere.md",
          html: registrationStatusEmail({
            name: decidedVenue.nameRo,
            type: "venue",
            approved,
            ctaUrl: venue.organizationId != null
              ? `https://epetrecere.md/dashboard/locatii/${decidedVenue.id}`
              : approvalCtaUrl,
            hallDecision: venue.organizationId != null,
            remainingPendingHallCount,
            rejectionReason: approved ? undefined : reviewReason,
          }),
        }).catch((err) => console.error(
          approved
            ? "[email] Failed to send approval email:"
            : "[email] Failed to send rejection email:",
          err,
        ));
      }
    }

    return NextResponse.json({ success: true, remainingPendingHallCount: type === "venue" ? remainingPendingHallCount : 0 });
  } catch (err) {
    console.error("[registration-requests] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
