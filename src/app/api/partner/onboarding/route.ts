import { NextResponse } from "next/server";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { partnerOrganizations, venueHalls, venueImages } from "@/lib/db/schema";
import { getCurrentAppUser, listAccessibleOrganizations, listAccessibleVenues } from "@/lib/venue-access";
import { jsonError } from "@/lib/http/json";
import { collectSubmitMissing } from "@/lib/partner/onboarding";
import { organizationHasValidContract } from "@/lib/partner/legal";
import { redactOrganizationForRole } from "@/lib/partner/organization-dto";

export async function GET() {
  const user = await getCurrentAppUser();
  if (!user) return jsonError("Unauthorized", 401);
  const organizations = await listAccessibleOrganizations(user.id);
  const venueRows = await listAccessibleVenues(user.id);
  const halls = venueRows.length
    ? await db.select().from(venueHalls)
        .where(inArray(venueHalls.venueId, venueRows.map((venue) => venue.id)))
        .orderBy(asc(venueHalls.venueId), asc(venueHalls.sortOrder), asc(venueHalls.id))
    : [];
  const serializeVenue = async (venue: (typeof venueRows)[number]) => {
    const images = await db.select().from(venueImages)
      .where(eq(venueImages.venueId, venue.id))
      .orderBy(
        asc(venueImages.hallId),
        desc(venueImages.isCover),
        asc(venueImages.sortOrder),
        asc(venueImages.id),
      );
    return {
      ...venue,
      images,
      halls: halls.filter((hall) => hall.venueId === venue.id),
      missing: await collectSubmitMissing(venue.id),
    };
  };
  const payload = [];
  for (const org of organizations) {
    const [full] = await db.select().from(partnerOrganizations).where(eq(partnerOrganizations.id, org.id)).limit(1);
    const orgVenues = venueRows.filter((venue) => venue.organizationId === org.id);
    payload.push({
      organization: full
        ? {
            ...redactOrganizationForRole(full, org.role),
            // Private, authenticated onboarding recovery only. This UUID is
            // never accepted as authorization; live membership gates the row.
            creationRequestId:
              org.role === "owner" && full.creationActorUserId === user.id
                ? full.creationRequestId
                : null,
          }
        : { id: org.id, role: org.role },
      hasValidContract: await organizationHasValidContract(org.id),
      venues: await Promise.all(orgVenues.map(serializeVenue)),
    });
  }
  // A venue created while the kill switch was OFF can legitimately have no
  // organization. Keep it outside every organization DTO until the owner
  // explicitly creates/selects a legal holder; the subsequent save performs
  // the authorized, transactional attachment.
  const unattachedVenueRows = venueRows.filter((venue) => venue.organizationId == null);
  return NextResponse.json({
    drafts: payload,
    unattachedVenues: await Promise.all(unattachedVenueRows.map(serializeVenue)),
  });
}
