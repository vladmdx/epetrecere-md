/**
 * Idempotent partner onboarding: organization → venue → halls → submit.
 * Draft rows are the durable state; refresh/back/retry reuse them.
 * server-only.
 */
import { and, asc, eq, gte, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  bookingRequests,
  partnerOrganizationMembers,
  partnerOrganizations,
  users,
  venueHalls,
  venueImages,
  venues,
} from "@/lib/db/schema";
import { pickUniqueSlug } from "@/lib/utils/slugify";
import { isMultiHallEnabled } from "@/lib/feature-flags";
import {
  authorizeOrganizationCapability,
  countActiveOwners,
  listAccessibleOrganizations,
  type AppUser,
} from "@/lib/venue-access";
import { organizationHasValidContract } from "./legal";
import { organizationWriteCapability } from "./organization-write";
import {
  emptyToNull,
  hallDraftSchema,
  organizationLegalIssues,
  organizationProfileSchema,
  validatePhoneOrError,
  venueDraftSchema,
  type MissingField,
} from "./validation";

export type OnboardingStep =
  | "organization"
  | "legal"
  | "contract"
  | "venue"
  | "hall"
  | "submit";

function slugCandidate(name: string): string {
  return name.trim() || "sala";
}

async function uniqueVenueSlug(name: string, excludeId?: number): Promise<string> {
  return pickUniqueSlug(slugCandidate(name), async (candidate) => {
    const [hit] = await db
      .select({ id: venues.id })
      .from(venues)
      .where(eq(venues.slug, candidate))
      .limit(1);
    return !!hit && hit.id !== excludeId;
  });
}

async function uniqueHallSlug(venueId: number, name: string, excludeId?: number): Promise<string> {
  return pickUniqueSlug(slugCandidate(name), async (candidate) => {
    const [hit] = await db
      .select({ id: venueHalls.id })
      .from(venueHalls)
      .where(and(eq(venueHalls.venueId, venueId), eq(venueHalls.slug, candidate)))
      .limit(1);
    return !!hit && hit.id !== excludeId;
  });
}

const ELIGIBLE_DRAFT_STATUSES = new Set(["draft", "rejected"]);

export async function ensureDraftOrganization(
  user: AppUser,
  input?: { displayName?: string; type?: "individual" | "sole_trader" | "company" },
) {
  const existing = await listAccessibleOrganizations(user.id);
  const reusable = existing.find((org) => ELIGIBLE_DRAFT_STATUSES.has(org.status));

  const loadReusable = async () => {
    if (!reusable) return null;
    const [row] = await db
      .select()
      .from(partnerOrganizations)
      .where(eq(partnerOrganizations.id, reusable.id))
      .limit(1);
    return row ?? null;
  };

  const hasName = input != null && Object.prototype.hasOwnProperty.call(input, "displayName") && input.displayName != null;
  const hasType = input != null && Object.prototype.hasOwnProperty.call(input, "type") && input.type != null;

  if (reusable && !hasName && !hasType) {
    const row = await loadReusable();
    if (row) return row;
  }

  if (reusable && (hasName || hasType)) {
    const access = await authorizeOrganizationCapability(
      user,
      reusable.id,
      organizationWriteCapability(input),
    );
    if (!access.ok) {
      const row = await loadReusable();
      if (row) return row;
    } else {
      const displayName = input?.displayName?.trim() || "Organizație nouă";
      const [updated] = await db
        .update(partnerOrganizations)
        .set({
          ...(hasName ? { displayName } : {}),
          ...(hasType ? { type: input!.type } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(partnerOrganizations.id, reusable.id),
            inArray(partnerOrganizations.status, ["draft", "rejected"]),
          ),
        )
        .returning();
      if (updated) return updated;
      const row = await loadReusable();
      if (row) return row;
    }
  }

  const displayName = input?.displayName?.trim() || "Organizație nouă";
  const [created] = await db
    .insert(partnerOrganizations)
    .values({
      type: input?.type ?? "company",
      displayName,
      status: "draft",
    })
    .returning();
  await db
    .insert(partnerOrganizationMembers)
    .values({
      organizationId: created.id,
      userId: user.id,
      role: "owner",
      isActive: true,
    })
    .onConflictDoNothing();
  return created;
}

export async function saveOrganizationProfile(
  organizationId: number,
  raw: unknown,
) {
  const parsed = organizationProfileSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: "Validation failed", details: parsed.error.issues };
  }
  const data = parsed.data;
  const [current] = await db
    .select()
    .from(partnerOrganizations)
    .where(eq(partnerOrganizations.id, organizationId))
    .limit(1);
  if (!current) return { ok: false as const, error: "Not found", status: 404 as const };

  const signed = await organizationHasValidContract(organizationId);
  const identityChanged =
    signed &&
    ((data.legalName ?? null) !== (current.legalName ?? null) ||
      (data.idNumber ?? null) !== (current.idNumber ?? null) ||
      (data.type ?? current.type) !== current.type);
  if (identityChanged) {
    return {
      ok: false as const,
      error: "LEGAL_HOLDER_CHANGE_REQUIRES_NEW_ORGANIZATION",
      status: 409 as const,
    };
  }

  if (data.billingPhone) {
    const phone = validatePhoneOrError(data.billingPhone);
    if (!phone.ok) {
      return { ok: false as const, error: phone.message, field: "billingPhone", status: 400 as const };
    }
    data.billingPhone = phone.e164;
  }

  const [updated] = await db
    .update(partnerOrganizations)
    .set({
      type: data.type,
      displayName: data.displayName,
      legalName: emptyToNull(data.legalName),
      idNumber: emptyToNull(data.idNumber),
      legalAddress: emptyToNull(data.legalAddress),
      billingEmail: emptyToNull(data.billingEmail),
      billingPhone: emptyToNull(data.billingPhone),
      bankDetails: data.bankDetails ?? current.bankDetails,
      updatedAt: new Date(),
    })
    .where(eq(partnerOrganizations.id, organizationId))
    .returning();
  return { ok: true as const, organization: updated };
}

export async function saveVenueDraft(user: AppUser, raw: unknown) {
  const parsed = venueDraftSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: "Validation failed", details: parsed.error.issues, status: 400 as const };
  }
  const data = parsed.data;
  const phone = validatePhoneOrError(data.phone);
  if (!phone.ok) {
    return { ok: false as const, error: phone.message, field: "phone", status: 400 as const };
  }

  const [otherPhone] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.phone, phone.e164)))
    .limit(1);
  if (otherPhone && otherPhone.id !== user.id) {
    return {
      ok: false as const,
      code: "phone_in_use" as const,
      error: "Acest număr de telefon este deja folosit de un alt cont.",
      field: "phone",
      status: 409 as const,
    };
  }

  const optionalUrl = (value?: string | null) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  };

  if (data.venueId) {
    const [existing] = await db
      .select()
      .from(venues)
      .where(eq(venues.id, data.venueId))
      .limit(1);
    if (!existing || existing.organizationId !== data.organizationId) {
      return { ok: false as const, error: "Forbidden", status: 403 as const };
    }
    const [updated] = await db
      .update(venues)
      .set({
        nameRo: data.name,
        nameRu: emptyToNull(data.nameRu),
        nameEn: emptyToNull(data.nameEn),
        descriptionRo: emptyToNull(data.descriptionRo),
        descriptionRu: emptyToNull(data.descriptionRu),
        descriptionEn: emptyToNull(data.descriptionEn),
        phone: phone.e164,
        email: emptyToNull(data.email),
        city: data.city,
        address: data.address,
        lat: data.lat ?? existing.lat,
        lng: data.lng ?? existing.lng,
        website: optionalUrl(data.websiteUrl),
        menuUrl: optionalUrl(data.menuUrl),
        menuPdfUrl: optionalUrl(data.menuPdfUrl),
        virtualTourUrl: optionalUrl(data.virtualTourUrl),
        workingHours: data.workingHours ?? existing.workingHours,
        updatedAt: new Date(),
      })
      .where(eq(venues.id, existing.id))
      .returning();
    await replaceVenueImages(existing.id, null, data.imageUrls);
    await db.update(users).set({ phone: phone.e164, updatedAt: new Date() }).where(eq(users.id, user.id));
    return { ok: true as const, venue: updated };
  }

  const existingForOrg = await db
    .select()
    .from(venues)
    .where(and(eq(venues.organizationId, data.organizationId), eq(venues.nameRo, data.name)))
    .limit(1);
  if (existingForOrg[0] && !existingForOrg[0].isActive) {
    return saveVenueDraft(user, { ...data, venueId: existingForOrg[0].id });
  }

  const slug = await uniqueVenueSlug(data.name);
  const [owned] = await db
    .select({ id: venues.id })
    .from(venues)
    .where(eq(venues.userId, user.id))
    .limit(1);
  const [created] = await db
    .insert(venues)
    .values({
      userId: owned ? null : user.id,
      organizationId: data.organizationId,
      nameRo: data.name,
      nameRu: emptyToNull(data.nameRu),
      nameEn: emptyToNull(data.nameEn),
      slug,
      phone: phone.e164,
      email: emptyToNull(data.email),
      city: data.city,
      address: data.address,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      website: optionalUrl(data.websiteUrl),
      menuUrl: optionalUrl(data.menuUrl),
      menuPdfUrl: optionalUrl(data.menuPdfUrl),
      virtualTourUrl: optionalUrl(data.virtualTourUrl),
      workingHours: data.workingHours ?? null,
      isActive: false,
      isFeatured: true,
      facilities: [],
    })
    .returning();
  await replaceVenueImages(created.id, null, data.imageUrls);
  await db.update(users).set({ phone: phone.e164, updatedAt: new Date() }).where(eq(users.id, user.id));
  return { ok: true as const, venue: created };
}

export async function replaceVenueImages(
  venueId: number,
  hallId: number | null,
  urls: string[],
) {
  const existing = await db
    .select({ id: venueImages.id, hallId: venueImages.hallId, url: venueImages.url })
    .from(venueImages)
    .where(eq(venueImages.venueId, venueId));
  const toRemove = existing.filter((row) => (row.hallId ?? null) === hallId);
  if (toRemove.length) {
    await db.delete(venueImages).where(inArray(venueImages.id, toRemove.map((row) => row.id)));
  }
  if (!urls.length) return;
  await db.insert(venueImages).values(
    urls.map((url, index) => ({
      venueId,
      hallId,
      url,
      sortOrder: index,
      isCover: hallId == null && index === 0,
    })),
  );
}

export async function saveHallDraft(raw: unknown) {
  const parsed = hallDraftSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: "Validation failed", details: parsed.error.issues, status: 400 as const };
  }
  const data = parsed.data;
  const [venue] = await db
    .select({ id: venues.id, capacityMin: venues.capacityMin, capacityMax: venues.capacityMax })
    .from(venues)
    .where(eq(venues.id, data.venueId))
    .limit(1);
  if (!venue) return { ok: false as const, error: "Venue not found", status: 404 as const };

  const values = {
    nameRo: data.nameRo,
    nameRu: emptyToNull(data.nameRu),
    nameEn: emptyToNull(data.nameEn),
    descriptionRo: emptyToNull(data.descriptionRo),
    descriptionRu: emptyToNull(data.descriptionRu),
    descriptionEn: emptyToNull(data.descriptionEn),
    capacityMin: data.capacityMin ?? null,
    capacityMax: data.capacityMax ?? null,
    pricingModel: data.pricingModel,
    basePrice: data.basePrice ?? null,
    minimumOrder: data.minimumOrder ?? null,
    currency: data.currency,
    depositType: data.depositType,
    depositValue: data.depositValue ?? null,
    facilities: data.facilities,
    workingHours: data.workingHours ?? null,
    bufferMinutes: data.bufferMinutes ?? null,
    bookingTermsRo: emptyToNull(data.bookingTermsRo),
    bookingTermsRu: emptyToNull(data.bookingTermsRu),
    bookingTermsEn: emptyToNull(data.bookingTermsEn),
    sortOrder: data.sortOrder ?? 0,
    updatedAt: new Date(),
  };

  if (data.hallId) {
    const [existing] = await db
      .select({ id: venueHalls.id, venueId: venueHalls.venueId, status: venueHalls.status })
      .from(venueHalls)
      .where(eq(venueHalls.id, data.hallId))
      .limit(1);
    if (!existing || existing.venueId !== data.venueId) {
      return { ok: false as const, error: "Forbidden", status: 403 as const };
    }
    const [updated] = await db
      .update(venueHalls)
      .set(values)
      .where(eq(venueHalls.id, existing.id))
      .returning();
    await replaceVenueImages(data.venueId, existing.id, data.imageUrls);
    await replaceSeating(existing.id, data.seating);
    return { ok: true as const, hall: updated };
  }

  const [sameName] = await db
    .select()
    .from(venueHalls)
    .where(and(eq(venueHalls.venueId, data.venueId), eq(venueHalls.nameRo, data.nameRo)))
    .limit(1);
  if (sameName) {
    return saveHallDraft({ ...data, hallId: sameName.id });
  }

  const slug = data.slug?.trim() || (await uniqueHallSlug(data.venueId, data.nameRo));
  const [created] = await db
    .insert(venueHalls)
    .values({
      venueId: data.venueId,
      slug,
      status: "draft",
      isLegacyDefault: false,
      ...values,
    })
    .returning();
  await replaceVenueImages(data.venueId, created.id, data.imageUrls);
  await replaceSeating(created.id, data.seating);
  if (venue.capacityMin == null && venue.capacityMax == null) {
    await db
      .update(venues)
      .set({ capacityMin: data.capacityMin, capacityMax: data.capacityMax, updatedAt: new Date() })
      .where(eq(venues.id, data.venueId));
  }
  return { ok: true as const, hall: created };
}

async function replaceSeating(
  hallId: number,
  seating: Array<{
    type: "banquet" | "theatre" | "classroom" | "cocktail" | "u_shape" | "custom";
    labelRo?: string | null;
    labelRu?: string | null;
    labelEn?: string | null;
    capacityMin?: number | null;
    capacityMax?: number | null;
    notesRo?: string | null;
    notesRu?: string | null;
    notesEn?: string | null;
  }>,
) {
  const { venueHallSeatingOptions } = await import("@/lib/db/schema");
  await db.delete(venueHallSeatingOptions).where(eq(venueHallSeatingOptions.hallId, hallId));
  if (!seating.length) return;
  await db.insert(venueHallSeatingOptions).values(
    seating.map((option, index) => ({
      hallId,
      type: option.type,
      labelRo: emptyToNull(option.labelRo),
      labelRu: emptyToNull(option.labelRu),
      labelEn: emptyToNull(option.labelEn),
      capacityMin: option.capacityMin ?? null,
      capacityMax: option.capacityMax ?? null,
      notesRo: emptyToNull(option.notesRo),
      notesRu: emptyToNull(option.notesRu),
      notesEn: emptyToNull(option.notesEn),
      sortOrder: index,
    })),
  );
}

export async function collectSubmitMissing(venueId: number): Promise<MissingField[]> {
  const missing: MissingField[] = [];
  const [venue] = await db.select().from(venues).where(eq(venues.id, venueId)).limit(1);
  if (!venue) {
    return [{ step: "venue", field: "venue", message: "venue_required", path: "venue" }];
  }
  if (!venue.organizationId) {
    missing.push({ step: "organization", field: "organizationId", message: "organization_required", path: "organizationId" });
    return missing;
  }
  const [org] = await db
    .select()
    .from(partnerOrganizations)
    .where(eq(partnerOrganizations.id, venue.organizationId))
    .limit(1);
  if (!org) {
    missing.push({ step: "organization", field: "organization", message: "organization_required", path: "organization" });
    return missing;
  }
  if (!org.displayName || org.displayName.trim().length < 2) {
    missing.push({ step: "organization", field: "displayName", message: "display_name_required", path: "displayName" });
  }
  missing.push(
    ...organizationLegalIssues({
      type: org.type,
      legalName: org.legalName,
      idNumber: org.idNumber,
      legalAddress: org.legalAddress,
    }),
  );
  if (!(await organizationHasValidContract(org.id))) {
    missing.push({ step: "contract", field: "contract", message: "current_signed_contract_required", path: "contract" });
  }
  if (!venue.nameRo || venue.nameRo.trim().length < 2) {
    missing.push({ step: "venue", field: "name", message: "venue_name_required", path: "name" });
  }
  if (!venue.address || venue.address.trim().length < 5) {
    missing.push({ step: "venue", field: "address", message: "address_required", path: "address" });
  }
  if (!venue.city) {
    missing.push({ step: "venue", field: "city", message: "city_required", path: "city" });
  }
  const images = await db
    .select({ id: venueImages.id, hallId: venueImages.hallId })
    .from(venueImages)
    .where(eq(venueImages.venueId, venueId));
  if (!images.some((image) => image.hallId == null)) {
    missing.push({ step: "venue", field: "imageUrls", message: "images_required", path: "imageUrls" });
  }
  const halls = await db
    .select()
    .from(venueHalls)
    .where(eq(venueHalls.venueId, venueId))
    .orderBy(asc(venueHalls.sortOrder), asc(venueHalls.id));
  const liveHalls = halls.filter((hall) => hall.status !== "archived");
  if (liveHalls.length === 0) {
    missing.push({ step: "hall", field: "halls", message: "at_least_one_hall", path: "halls" });
  }
  liveHalls.forEach((hall, index) => {
    if (!hall.nameRo) {
      missing.push({ step: "hall", field: `halls.${index}.nameRo`, message: "hall_name_required", path: `halls.${index}.nameRo` });
    }
    if (hall.capacityMin == null || hall.capacityMax == null || hall.capacityMax < hall.capacityMin) {
      missing.push({ step: "hall", field: `halls.${index}.capacityMax`, message: "capacity_required", path: `halls.${index}.capacityMax` });
    }
    const hasTranslation = Boolean(hall.nameRu || hall.descriptionRu) && Boolean(hall.nameEn || hall.descriptionEn);
    if (!hasTranslation && !hall.nameRo) {
      missing.push({ step: "hall", field: `halls.${index}.nameRo`, message: "translations_or_ro_fallback", path: `halls.${index}.nameRo` });
    }
  });
  return missing;
}

export async function submitVenueForApproval(venueId: number) {
  const missing = await collectSubmitMissing(venueId);
  if (missing.length) {
    return { ok: false as const, code: "ONBOARDING_INCOMPLETE" as const, missing, status: 400 as const };
  }
  const [venue] = await db.select().from(venues).where(eq(venues.id, venueId)).limit(1);
  if (!venue?.organizationId) {
    return { ok: false as const, code: "ONBOARDING_INCOMPLETE" as const, missing, status: 400 as const };
  }
  await db
    .update(partnerOrganizations)
    .set({ status: "pending", updatedAt: new Date() })
    .where(and(eq(partnerOrganizations.id, venue.organizationId), inArray(partnerOrganizations.status, ["draft", "rejected"])));
  const halls = await db.select({ id: venueHalls.id, status: venueHalls.status }).from(venueHalls).where(eq(venueHalls.venueId, venueId));
  for (const hall of halls) {
    if (hall.status === "draft" || hall.status === "rejected") {
      await db.update(venueHalls).set({ status: "pending", updatedAt: new Date() }).where(eq(venueHalls.id, hall.id));
    }
  }
  // Venue stays inactive until admin approval; pending is expressed by halls/org.
  await db.update(venues).set({ isActive: false, updatedAt: new Date() }).where(eq(venues.id, venueId));
  return { ok: true as const, venueId, organizationId: venue.organizationId };
}

export async function archiveHall(hallId: number) {
  const [hall] = await db.select().from(venueHalls).where(eq(venueHalls.id, hallId)).limit(1);
  if (!hall) {
    return { ok: false as const, status: 404 as const, error: "Not found", code: "NOT_FOUND" as const };
  }
  if (hall.status === "archived") return { ok: true as const, hallId };

  const siblings = await db
    .select({ id: venueHalls.id, status: venueHalls.status })
    .from(venueHalls)
    .where(eq(venueHalls.venueId, hall.venueId));
  const usable = siblings.filter((row) => row.status !== "archived");
  if (usable.length <= 1) {
    return {
      ok: false as const,
      status: 409 as const,
      error: "LAST_USABLE_HALL",
      code: "LAST_USABLE_HALL" as const,
    };
  }

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Chisinau" });
  const [future] = await db
    .select({ id: bookingRequests.id })
    .from(bookingRequests)
    .where(
      and(
        eq(bookingRequests.venueId, hall.venueId),
        inArray(bookingRequests.status, ["pending", "accepted", "confirmed_by_client"]),
        gte(bookingRequests.eventDate, today),
        or(eq(bookingRequests.hallId, hallId), eq(bookingRequests.reservationScope, "venue")),
      ),
    )
    .limit(1);
  if (future) {
    return {
      ok: false as const,
      status: 409 as const,
      error: "HALL_HAS_FUTURE_BOOKINGS",
      code: "HALL_HAS_FUTURE_BOOKINGS" as const,
    };
  }

  await db
    .update(venueHalls)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(venueHalls.id, hallId));
  return { ok: true as const, hallId };
}

export async function transferOrganizationOwner(
  organizationId: number,
  fromUserId: string,
  toUserId: string,
) {
  if (fromUserId === toUserId) {
    return { ok: false as const, error: "SAME_USER", status: 400 as const };
  }
  const [target] = await db
    .select()
    .from(partnerOrganizationMembers)
    .where(
      and(
        eq(partnerOrganizationMembers.organizationId, organizationId),
        eq(partnerOrganizationMembers.userId, toUserId),
      ),
    )
    .limit(1);
  if (!target) {
    await db.insert(partnerOrganizationMembers).values({
      organizationId,
      userId: toUserId,
      role: "owner",
      isActive: true,
    });
  } else {
    await db
      .update(partnerOrganizationMembers)
      .set({ role: "owner", isActive: true, updatedAt: new Date() })
      .where(eq(partnerOrganizationMembers.id, target.id));
  }
  await db
    .update(partnerOrganizationMembers)
    .set({ role: "admin", updatedAt: new Date() })
    .where(
      and(
        eq(partnerOrganizationMembers.organizationId, organizationId),
        eq(partnerOrganizationMembers.userId, fromUserId),
      ),
    );
  if ((await countActiveOwners(organizationId)) < 1) {
    return { ok: false as const, error: "TRANSFER_FAILED", status: 500 as const };
  }
  return { ok: true as const };
}

export function multiHallWritesEnabled(): boolean {
  return isMultiHallEnabled();
}
