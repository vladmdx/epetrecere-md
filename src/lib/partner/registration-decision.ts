/**
 * Organization-aware partner registration queue and decisions.
 * Extra venues keep venues.user_id NULL; the queue and notifications
 * must follow the organization, not the legacy owner column.
 */
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  notifications,
  partnerOrganizations,
  venueHalls,
  venues,
} from "@/lib/db/schema";
import { missingRegistrationDocuments } from "@/lib/legal/registration-gate";
import { isMultiHallEnabled } from "@/lib/feature-flags";
import { getVenueOwnerRecipients } from "@/lib/venue-access";
import { organizationHasValidContract } from "./legal";

const PENDING_HALL = sql`exists (
  select 1 from venue_halls vh
  where vh.venue_id = ${venues.id} and vh.status = 'pending'
)`;

const PENDING_ORG = sql`exists (
  select 1 from partner_organizations po
  where po.id = ${venues.organizationId} and po.status = 'pending'
)`;

export async function listPendingPartnerVenues() {
  return db
    .select({
      id: venues.id,
      name: venues.nameRo,
      email: venues.email,
      phone: venues.phone,
      city: venues.city,
      address: venues.address,
      description: venues.descriptionRo,
      capacityMin: venues.capacityMin,
      capacityMax: venues.capacityMax,
      website: venues.website,
      menuUrl: venues.menuUrl,
      menuPdfUrl: venues.menuPdfUrl,
      virtualTourUrl: venues.virtualTourUrl,
      workingHours: venues.workingHours,
      lat: venues.lat,
      lng: venues.lng,
      createdAt: venues.createdAt,
      userId: venues.userId,
      organizationId: venues.organizationId,
      slug: venues.slug,
      isActive: venues.isActive,
    })
    .from(venues)
    .where(
      and(
        eq(venues.isActive, false),
        or(sql`${venues.userId} IS NOT NULL`, PENDING_HALL, PENDING_ORG),
      ),
    )
    .orderBy(venues.createdAt);
}

export async function approvePartnerVenue(venueId: number): Promise<
  | { ok: true; venue: typeof venues.$inferSelect; emails: Array<{ userId: string; email: string | null }> }
  | { ok: false; error: string; status: number; missing?: string[] }
> {
  const [venue] = await db.select().from(venues).where(eq(venues.id, venueId)).limit(1);
  if (!venue) return { ok: false, error: "Venue not found", status: 404 };
  if (venue.organizationId) {
    if (!(await organizationHasValidContract(venue.organizationId))) {
      return { ok: false, error: "current_signed_contract_required", status: 409, missing: ["contract"] };
    }
  } else if (venue.userId) {
    const missing = await missingRegistrationDocuments(venue.userId, "venue");
    if (missing.length) {
      return { ok: false, error: "current_signed_contract_required", status: 409, missing };
    }
  }

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(venues)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(venues.id, venueId))
      .returning();
    await tx
      .update(venueHalls)
      .set({ status: "active", updatedAt: new Date() })
      .where(and(eq(venueHalls.venueId, venueId), eq(venueHalls.status, "pending")));
    if (venue.organizationId) {
      await tx
        .update(partnerOrganizations)
        .set({ status: "active", updatedAt: new Date() })
        .where(
          and(
            eq(partnerOrganizations.id, venue.organizationId),
            eq(partnerOrganizations.status, "pending"),
          ),
        );
    }
    return row;
  });

  const recipients = await getVenueOwnerRecipients(venueId);
  const dashboardPath = isMultiHallEnabled()
    ? `/dashboard/locatii/${venueId}`
    : "/dashboard/sala";
  if (recipients.length) {
    await db.insert(notifications).values(
      recipients.map((recipient) => ({
        userId: recipient.userId,
        type: "registration_approved",
        title: "Sala ta a fost aprobată! 🎉",
        message: "Sala ta este acum vizibilă pe ePetrecere.md. Bine ai venit!",
        actionUrl: dashboardPath,
      })),
    );
  }
  return { ok: true, venue: updated ?? venue, emails: recipients };
}

export async function rejectPartnerVenue(venueId: number): Promise<
  | { ok: true; venue: typeof venues.$inferSelect; emails: Array<{ userId: string; email: string | null }> }
  | { ok: false; error: string; status: number }
> {
  const [venue] = await db.select().from(venues).where(eq(venues.id, venueId)).limit(1);
  if (!venue) return { ok: false, error: "Venue not found", status: 404 };

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(venues)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(venues.id, venueId))
      .returning();
    await tx
      .update(venueHalls)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(
        and(
          eq(venueHalls.venueId, venueId),
          inArray(venueHalls.status, ["pending", "draft"]),
        ),
      );
    if (venue.organizationId) {
      await tx
        .update(partnerOrganizations)
        .set({ status: "rejected", updatedAt: new Date() })
        .where(
          and(
            eq(partnerOrganizations.id, venue.organizationId),
            eq(partnerOrganizations.status, "pending"),
          ),
        );
    }
    return row;
  });

  const recipients = await getVenueOwnerRecipients(venueId);
  if (recipients.length) {
    await db.insert(notifications).values(
      recipients.map((recipient) => ({
        userId: recipient.userId,
        type: "registration_rejected",
        title: "Cererea ta a fost refuzată",
        message: "Sala ta nu a fost aprobată. Completează datele și retrimite cererea.",
        actionUrl: isMultiHallEnabled() ? `/dashboard/locatii/${venueId}` : "/dashboard/venue-onboarding",
      })),
    );
  }
  return { ok: true, venue: updated ?? venue, emails: recipients };
}
