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
import { collectSubmitMissing } from "./onboarding";
import { organizationHasValidContract } from "./legal";

const PENDING_HALL = sql`exists (
  select 1 from venue_halls vh
  where vh.venue_id = ${venues.id} and vh.status = 'pending'
)`;

const PENDING_ORG = sql`exists (
  select 1 from partner_organizations po
  where po.id = ${venues.organizationId} and po.status = 'pending'
)`;

const LEGACY_INACTIVE = sql`${venues.organizationId} IS NULL AND ${venues.userId} IS NOT NULL AND ${venues.isActive} = false`;

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
    .where(or(PENDING_HALL, PENDING_ORG, LEGACY_INACTIVE))
    .orderBy(venues.createdAt);
}

async function pendingWork(venueId: number) {
  const [venue] = await db.select().from(venues).where(eq(venues.id, venueId)).limit(1);
  if (!venue) return { venue: null, pendingHalls: [] as number[], orgPending: false };
  const halls = await db
    .select({ id: venueHalls.id, status: venueHalls.status })
    .from(venueHalls)
    .where(and(eq(venueHalls.venueId, venueId), eq(venueHalls.status, "pending")));
  let orgPending = false;
  if (venue.organizationId) {
    const [org] = await db
      .select({ status: partnerOrganizations.status })
      .from(partnerOrganizations)
      .where(eq(partnerOrganizations.id, venue.organizationId))
      .limit(1);
    orgPending = org?.status === "pending";
  }
  const legacyPending = venue.organizationId == null && venue.userId != null && !venue.isActive;
  return { venue, pendingHalls: halls.map((h) => h.id), orgPending, legacyPending };
}

export async function approvePartnerVenue(venueId: number): Promise<
  | { ok: true; venue: typeof venues.$inferSelect; emails: Array<{ userId: string; email: string | null }> }
  | { ok: false; error: string; status: number; missing?: string[]; code?: string }
> {
  const missing = await collectSubmitMissing(venueId);
  if (missing.length) {
    return { ok: false, error: "ONBOARDING_INCOMPLETE", status: 400, missing: missing.map((m) => m.path) };
  }
  const snapshot = await pendingWork(venueId);
  if (!snapshot.venue) return { ok: false, error: "Venue not found", status: 404 };
  const venue = snapshot.venue;
  if (!snapshot.pendingHalls.length && !snapshot.orgPending && !snapshot.legacyPending) {
    return { ok: false, error: "booking_changed", status: 409, code: "NOT_PENDING" };
  }
  if (venue.organizationId) {
    if (!(await organizationHasValidContract(venue.organizationId))) {
      return { ok: false, error: "current_signed_contract_required", status: 409, missing: ["contract"] };
    }
  } else if (venue.userId) {
    const missingDocs = await missingRegistrationDocuments(venue.userId, "venue");
    if (missingDocs.length) {
      return { ok: false, error: "current_signed_contract_required", status: 409, missing: missingDocs };
    }
  }

  const updated = await db.transaction(async (tx) => {
    const halls = await tx
      .update(venueHalls)
      .set({ status: "active", updatedAt: new Date() })
      .where(and(eq(venueHalls.venueId, venueId), eq(venueHalls.status, "pending")))
      .returning({ id: venueHalls.id });
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
    const wasActive = venue.isActive;
    const [row] = await tx
      .update(venues)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(venues.id, venueId))
      .returning();
    if (!halls.length && !wasActive && !snapshot.orgPending && !snapshot.legacyPending) {
      return null;
    }
    return row;
  });

  if (!updated) return { ok: false, error: "booking_changed", status: 409, code: "NOT_PENDING" };

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
        dedupeKey: `registration_approved:${venueId}:${recipient.userId}`,
      })),
    ).onConflictDoNothing();
  }
  return { ok: true, venue: updated, emails: recipients };
}

export async function rejectPartnerVenue(venueId: number): Promise<
  | { ok: true; venue: typeof venues.$inferSelect; emails: Array<{ userId: string; email: string | null }> }
  | { ok: false; error: string; status: number; code?: string }
> {
  const snapshot = await pendingWork(venueId);
  if (!snapshot.venue) return { ok: false, error: "Venue not found", status: 404 };
  const venue = snapshot.venue;
  if (!snapshot.pendingHalls.length && !snapshot.orgPending && !snapshot.legacyPending) {
    return { ok: false, error: "booking_changed", status: 409, code: "NOT_PENDING" };
  }

  const updated = await db.transaction(async (tx) => {
    const halls = await tx
      .update(venueHalls)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(and(eq(venueHalls.venueId, venueId), eq(venueHalls.status, "pending")))
      .returning({ id: venueHalls.id });
    const keepVenueActive = venue.isActive;
    if (venue.organizationId && !keepVenueActive) {
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
    const [row] = keepVenueActive
      ? await tx.select().from(venues).where(eq(venues.id, venueId)).limit(1)
      : await tx
          .update(venues)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(venues.id, venueId))
          .returning();
    if (!halls.length && !snapshot.orgPending && !snapshot.legacyPending) return null;
    return row;
  });

  if (!updated) return { ok: false, error: "booking_changed", status: 409, code: "NOT_PENDING" };

  const recipients = await getVenueOwnerRecipients(venueId);
  if (recipients.length) {
    await db.insert(notifications).values(
      recipients.map((recipient) => ({
        userId: recipient.userId,
        type: "registration_rejected",
        title: "Cererea ta a fost refuzată",
        message: "Sala ta nu a fost aprobată. Completează datele și retrimite cererea.",
        actionUrl: isMultiHallEnabled() ? `/dashboard/locatii/${venueId}` : "/dashboard/venue-onboarding",
        dedupeKey: `registration_rejected:${venueId}:${recipient.userId}`,
      })),
    ).onConflictDoNothing();
  }
  return { ok: true, venue: updated, emails: recipients };
}
