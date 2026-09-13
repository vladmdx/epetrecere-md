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
  getAppUserById,
  listAccessibleOrganizations,
  type AppUser,
} from "@/lib/venue-access";
import { organizationHasAnyAcceptance, organizationHasValidContract } from "./legal";
import { organizationWriteCapability } from "./organization-write";
import {
  emptyToNull,
  hallDraftSchema,
  organizationLegalIssues,
  organizationPatchSchema,
  validatePhoneOrError,
  venueDraftSchema,
  type MissingField,
} from "./validation";
import { acquireAvailabilityLocks, acquireLegalScopeLock } from "@/lib/booking/advisory-locks";

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

export type OrganizationDraftInput = {
  displayName?: string;
  type?: "individual" | "sole_trader" | "company";
  legalName?: string | null;
  idNumber?: string | null;
  legalAddress?: string | null;
  billingEmail?: string | null;
  billingPhone?: string | null;
};

export class OrganizationDraftUpdateError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
    this.name = "OrganizationDraftUpdateError";
  }
}

export async function ensureDraftOrganization(
  user: AppUser,
  input?: OrganizationDraftInput,
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

  if (reusable && !input) {
    const row = await loadReusable();
    if (row) return row;
  }

  if (reusable && input) {
    const access = await authorizeOrganizationCapability(
      user,
      reusable.id,
      organizationWriteCapability(input),
    );
    if (!access.ok) {
      const row = await loadReusable();
      if (row) return row;
    } else {
      const saved = await saveOrganizationProfile(reusable.id, input, {
        allowedStatuses: ["draft", "rejected"],
      });
      if (saved.ok && saved.organization) return saved.organization;
      if (!saved.ok && saved.error === "LEGAL_HOLDER_CHANGE_REQUIRES_NEW_ORGANIZATION") {
        throw new OrganizationDraftUpdateError(saved.error, saved.status ?? 409);
      }
      if (!saved.ok && saved.error !== "ORGANIZATION_NOT_EDITABLE") {
        throw new OrganizationDraftUpdateError(saved.error, saved.status ?? 400);
      }
      const row = await loadReusable();
      if (row) return row;
    }
  }

  const displayName = input?.displayName?.trim() || "Organizație nouă";
  return db.transaction(async (tx) => {
    // Creating an owner membership is an authorization mutation too. Use the
    // same user-first lock order as signing, transfers and account deletion so
    // a stale request cannot grant ownership after the user was deleted.
    await acquireLegalScopeLock(tx, { userId: user.id });
    const currentUser = await getAppUserById(user.id, tx as unknown as typeof db);
    if (!currentUser) {
      throw new OrganizationDraftUpdateError("FORBIDDEN", 403);
    }

    // A concurrent first request may have created the draft while this one
    // waited on the user lock. Re-read inside the serialized section so the
    // idempotent API never creates two organizations for the same retry.
    const [concurrentMembership] = await tx
      .select({ organizationId: partnerOrganizationMembers.organizationId })
      .from(partnerOrganizationMembers)
      .innerJoin(
        partnerOrganizations,
        eq(partnerOrganizations.id, partnerOrganizationMembers.organizationId),
      )
      .where(and(
        eq(partnerOrganizationMembers.userId, user.id),
        eq(partnerOrganizationMembers.isActive, true),
        inArray(partnerOrganizations.status, ["draft", "rejected"]),
      ))
      .orderBy(asc(partnerOrganizations.id))
      .limit(1);
    if (concurrentMembership) {
      const [organization] = await tx
        .select()
        .from(partnerOrganizations)
        .where(eq(partnerOrganizations.id, concurrentMembership.organizationId))
        .limit(1);
      if (organization) return organization;
    }

    const [created] = await tx
      .insert(partnerOrganizations)
      .values({
        type: input?.type ?? "company",
        displayName,
        status: "draft",
        legalName: emptyToNull(input?.legalName),
        idNumber: emptyToNull(input?.idNumber),
        legalAddress: emptyToNull(input?.legalAddress),
        billingEmail: emptyToNull(input?.billingEmail),
        billingPhone: emptyToNull(input?.billingPhone),
      })
      .returning();
    await acquireLegalScopeLock(tx, { organizationId: created.id });
    await tx.insert(partnerOrganizationMembers).values({
      organizationId: created.id,
      userId: user.id,
      role: "owner",
      isActive: true,
    });
    return created;
  });
}

export async function saveOrganizationProfile(
  organizationId: number,
  raw: unknown,
  options: { allowedStatuses?: readonly string[] } = {},
) {
  const record = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
  const parsed = organizationPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: "Validation failed", details: parsed.error.issues };
  }
  const data = parsed.data;
  const present = (key: string) => Object.prototype.hasOwnProperty.call(record, key);

  try {
    const updated = await db.transaction(async (tx) => {
      await acquireLegalScopeLock(tx, { organizationId });
      const [current] = await tx
        .select()
        .from(partnerOrganizations)
        .where(eq(partnerOrganizations.id, organizationId))
        .for("update")
        .limit(1);
      if (!current) return { missing: true as const };
      if (options.allowedStatuses && !options.allowedStatuses.includes(current.status)) {
        return { notEditable: true as const };
      }

      const signed = await organizationHasAnyAcceptance(organizationId, tx as unknown as typeof db);
      const nextType = present("type") ? data.type ?? current.type : current.type;
      const nextLegalName = present("legalName") ? emptyToNull(data.legalName) : current.legalName;
      const nextIdNumber = present("idNumber") ? emptyToNull(data.idNumber) : current.idNumber;
      const nextLegalAddress = present("legalAddress") ? emptyToNull(data.legalAddress) : current.legalAddress;
      if (
        signed &&
        (nextType !== current.type ||
          (nextLegalName ?? null) !== (current.legalName ?? null) ||
          (nextIdNumber ?? null) !== (current.idNumber ?? null) ||
          (nextLegalAddress ?? null) !== (current.legalAddress ?? null))
      ) {
        return { frozen: true as const };
      }

      if (present("billingPhone") && data.billingPhone) {
        const phone = validatePhoneOrError(data.billingPhone);
        if (!phone.ok) {
          return { phoneError: phone.message as string };
        }
        data.billingPhone = phone.e164;
      }

      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (present("type") && data.type) set.type = data.type;
      if (present("displayName") && data.displayName) set.displayName = data.displayName;
      if (present("legalName")) set.legalName = emptyToNull(data.legalName);
      if (present("idNumber")) set.idNumber = emptyToNull(data.idNumber);
      if (present("legalAddress")) set.legalAddress = emptyToNull(data.legalAddress);
      if (present("billingEmail")) set.billingEmail = emptyToNull(data.billingEmail);
      if (present("billingPhone")) set.billingPhone = emptyToNull(data.billingPhone);
      if (present("bankDetails")) set.bankDetails = data.bankDetails ?? current.bankDetails;

      const [row] = await tx
        .update(partnerOrganizations)
        .set(set)
        .where(eq(partnerOrganizations.id, organizationId))
        .returning();
      return { row };
    });

    if ("missing" in updated && updated.missing) {
      return { ok: false as const, error: "Not found", status: 404 as const };
    }
    if ("notEditable" in updated && updated.notEditable) {
      return { ok: false as const, error: "ORGANIZATION_NOT_EDITABLE", status: 409 as const };
    }
    if ("frozen" in updated && updated.frozen) {
      return {
        ok: false as const,
        error: "LEGAL_HOLDER_CHANGE_REQUIRES_NEW_ORGANIZATION",
        status: 409 as const,
      };
    }
    if ("phoneError" in updated && updated.phoneError) {
      return { ok: false as const, error: updated.phoneError, field: "billingPhone", status: 400 as const };
    }
    return { ok: true as const, organization: updated.row };
  } catch (error) {
    throw error;
  }
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

  if (!isMultiHallEnabled()) {
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
  }

  const optionalUrl = (value?: string | null) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  };

  const syncLegacyUserPhone = async () => {
    if (isMultiHallEnabled()) return;
    await db.update(users).set({ phone: phone.e164, updatedAt: new Date() }).where(eq(users.id, user.id));
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
    await syncLegacyUserPhone();
    return { ok: true as const, venue: updated };
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
  await syncLegacyUserPhone();
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
  if (!venue.isActive) {
    await db.update(venues).set({ isActive: false, updatedAt: new Date() }).where(eq(venues.id, venueId));
  }
  return { ok: true as const, venueId, organizationId: venue.organizationId };
}

export async function archiveHall(hallId: number) {
  const [hall] = await db.select().from(venueHalls).where(eq(venueHalls.id, hallId)).limit(1);
  if (!hall) {
    return { ok: false as const, status: 404 as const, error: "Not found", code: "NOT_FOUND" as const };
  }
  if (hall.status === "archived") return { ok: true as const, hallId };

  try {
    await db.transaction(async (tx) => {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Chisinau" });
      await acquireAvailabilityLocks(tx, {
        venueId: hall.venueId,
        hallIds: [hallId],
        localDates: [today],
        conflictGroupIds: [],
      });
      const [locked] = await tx
        .select()
        .from(venueHalls)
        .where(eq(venueHalls.id, hallId))
        .for("update")
        .limit(1);
      if (!locked || locked.status === "archived") return;
      const siblings = await tx
        .select({ id: venueHalls.id, status: venueHalls.status })
        .from(venueHalls)
        .where(eq(venueHalls.venueId, locked.venueId));
      const usable = siblings.filter((row) => row.status !== "archived");
      if (usable.length <= 1) {
        throw Object.assign(new Error("LAST_USABLE_HALL"), { code: "LAST_USABLE_HALL" });
      }
      const [future] = await tx
        .select({ id: bookingRequests.id })
        .from(bookingRequests)
        .where(
          and(
            eq(bookingRequests.venueId, locked.venueId),
            inArray(bookingRequests.status, ["pending", "accepted", "confirmed_by_client"]),
            gte(bookingRequests.eventDate, today),
            or(eq(bookingRequests.hallId, hallId), eq(bookingRequests.reservationScope, "venue")),
          ),
        )
        .limit(1);
      if (future) {
        throw Object.assign(new Error("HALL_HAS_FUTURE_BOOKINGS"), { code: "HALL_HAS_FUTURE_BOOKINGS" });
      }
      const [updated] = await tx
        .update(venueHalls)
        .set({ status: "archived", updatedAt: new Date() })
        .where(and(eq(venueHalls.id, hallId), eq(venueHalls.status, locked.status)))
        .returning({ id: venueHalls.id });
      if (!updated) {
        throw Object.assign(new Error("HALL_CHANGED"), { code: "HALL_CHANGED" });
      }
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "LAST_USABLE_HALL" || code === "HALL_HAS_FUTURE_BOOKINGS" || code === "HALL_CHANGED") {
      return {
        ok: false as const,
        status: 409 as const,
        error: code,
        code: code as "LAST_USABLE_HALL" | "HALL_HAS_FUTURE_BOOKINGS" | "HALL_CHANGED",
      };
    }
    throw error;
  }
  return { ok: true as const, hallId };
}

export function multiHallWritesEnabled(): boolean {
  return isMultiHallEnabled();
}
