import { z } from "zod/v4";
import { validatePhone } from "@/lib/phone/validate";
import { isCompleteLegalAddress, isMoldovanIdNumber, isOfficialEntityName, isFullPersonName } from "@/lib/legal/identity-validation";

export const HALL_PRICING_MODELS = ["per_person", "minimum_order", "fixed", "quote"] as const;
export const HALL_DEPOSIT_TYPES = ["none", "percent", "fixed"] as const;
export const HALL_SEATING_TYPES = ["banquet", "theatre", "classroom", "cocktail", "u_shape", "custom"] as const;
export const HALL_WORKING_HOUR_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const PARTNER_ENTITY_STATUSES = [
  "draft",
  "pending",
  "active",
  "rejected",
  "suspended",
  "archived",
] as const;

export const localizedText = z.string().trim().max(8000);
export const urlField = z.string().trim().url().max(2000);

export const organizationProfileSchema = z.object({
  type: z.enum(["individual", "sole_trader", "company"]).default("company"),
  displayName: z.string().trim().min(2).max(200),
  legalName: z.string().trim().max(200).optional().nullable(),
  idNumber: z.string().trim().max(40).optional().nullable(),
  legalAddress: z.string().trim().max(300).optional().nullable(),
  billingEmail: z.string().trim().email().max(200).optional().nullable(),
  billingPhone: z.string().trim().max(40).optional().nullable(),
  bankDetails: z.record(z.string(), z.unknown()).optional().nullable(),
});

/** POST create — type is required, no implicit company default. */
export const organizationCreateSchema = z.object({
  /** Distinct from a venue's createRequestId. */
  organizationCreateRequestId: z.string().uuid(),
  type: z.enum(["individual", "sole_trader", "company"]),
  displayName: z.string().trim().min(2).max(200),
  legalName: z.string().trim().max(200).optional().nullable(),
  idNumber: z.string().trim().max(40).optional().nullable(),
  legalAddress: z.string().trim().max(300).optional().nullable(),
  billingEmail: z.string().trim().email().max(200).optional().nullable(),
  billingPhone: z.string().trim().max(40).optional().nullable(),
  bankDetails: z.record(z.string(), z.unknown()).optional().nullable(),
});

/** PATCH — all optional, no defaults. Capability uses raw field presence. */
export const organizationPatchSchema = z.object({
  type: z.enum(["individual", "sole_trader", "company"]).optional(),
  displayName: z.string().trim().min(2).max(200).optional(),
  legalName: z.string().trim().max(200).optional().nullable(),
  idNumber: z.string().trim().max(40).optional().nullable(),
  legalAddress: z.string().trim().max(300).optional().nullable(),
  billingEmail: z.string().trim().email().max(200).optional().nullable(),
  billingPhone: z.string().trim().max(40).optional().nullable(),
  bankDetails: z.record(z.string(), z.unknown()).optional().nullable(),
});

export const venueDraftSchema = z.object({
  organizationId: z.number().int().positive(),
  venueId: z.number().int().positive().optional(),
  createIntent: z.boolean().optional(),
  createRequestId: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(200),
  nameRu: localizedText.optional().nullable(),
  nameEn: localizedText.optional().nullable(),
  descriptionRo: localizedText.optional().nullable(),
  descriptionRu: localizedText.optional().nullable(),
  descriptionEn: localizedText.optional().nullable(),
  phone: z.string().trim().min(6).max(40),
  email: z.string().trim().email().max(200).optional().nullable(),
  city: z.string().trim().min(2).max(120),
  address: z.string().trim().min(5).max(300),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  websiteUrl: z.string().trim().url().max(2000).optional().nullable().or(z.literal("")),
  menuUrl: z.string().trim().url().max(2000).optional().nullable().or(z.literal("")),
  menuPdfUrl: z.string().trim().url().max(2000).optional().nullable().or(z.literal("")),
  virtualTourUrl: z.string().trim().url().max(2000).optional().nullable().or(z.literal("")),
  imageUrls: z.array(z.string().url()).max(10).optional(),
  workingHours: z
    .object({
      mon: z.object({ open: z.string(), close: z.string() }).nullable(),
      tue: z.object({ open: z.string(), close: z.string() }).nullable(),
      wed: z.object({ open: z.string(), close: z.string() }).nullable(),
      thu: z.object({ open: z.string(), close: z.string() }).nullable(),
      fri: z.object({ open: z.string(), close: z.string() }).nullable(),
      sat: z.object({ open: z.string(), close: z.string() }).nullable(),
      sun: z.object({ open: z.string(), close: z.string() }).nullable(),
    })
    .optional()
    .nullable(),
}).superRefine((value, ctx) => {
  if (value.createIntent === true && !value.createRequestId) {
    ctx.addIssue({
      code: "custom",
      path: ["createRequestId"],
      message: "createRequestId is required for an explicit venue creation",
    });
  }
  if (value.createIntent === true && value.venueId != null) {
    ctx.addIssue({
      code: "custom",
      path: ["venueId"],
      message: "venueId and createIntent are mutually exclusive",
    });
  }
  if (value.createRequestId && value.createIntent !== true) {
    ctx.addIssue({
      code: "custom",
      path: ["createRequestId"],
      message: "createRequestId is only valid with createIntent",
    });
  }
});

const uniqueStrings = (values: string[]) => new Set(values).size === values.length;
const uniqueNumbers = (values: number[]) => new Set(values).size === values.length;

const hhmmSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "time_must_be_HH_mm");

const hallWorkingHourIntervalSchema = z
  .object({
    open: hhmmSchema,
    close: hhmmSchema,
  })
  .strict()
  .refine((interval) => interval.open < interval.close, {
    path: ["close"],
    message: "working_hours_close_must_be_after_open",
  });

export const hallWorkingHoursSchema = z
  .object({
    mon: hallWorkingHourIntervalSchema.nullable().optional(),
    tue: hallWorkingHourIntervalSchema.nullable().optional(),
    wed: hallWorkingHourIntervalSchema.nullable().optional(),
    thu: hallWorkingHourIntervalSchema.nullable().optional(),
    fri: hallWorkingHourIntervalSchema.nullable().optional(),
    sat: hallWorkingHourIntervalSchema.nullable().optional(),
    sun: hallWorkingHourIntervalSchema.nullable().optional(),
  })
  .strict();

export const seatingOptionSchema = z.object({
  type: z.enum(HALL_SEATING_TYPES),
  labelRo: z.string().trim().max(120).optional().nullable(),
  labelRu: z.string().trim().max(120).optional().nullable(),
  labelEn: z.string().trim().max(120).optional().nullable(),
  capacityMin: z.number().int().nonnegative().optional().nullable(),
  capacityMax: z.number().int().nonnegative().optional().nullable(),
  notesRo: z.string().trim().max(2000).optional().nullable(),
  notesRu: z.string().trim().max(2000).optional().nullable(),
  notesEn: z.string().trim().max(2000).optional().nullable(),
}).strict().refine((data) => {
  if (data.capacityMin == null || data.capacityMax == null) return true;
  return data.capacityMax >= data.capacityMin;
}, { path: ["capacityMax"], message: "capacity_max_lt_min" });

const hallImageUrlsSchema = z
  .array(z.string().trim().url().max(2000))
  .max(20)
  .refine(uniqueStrings, { message: "duplicate_image_url" });

const hallFacilitiesSchema = z
  .array(z.string().trim().min(1).max(80))
  .max(40)
  .refine(uniqueStrings, { message: "duplicate_facility" });

const hallMenuSetIdsSchema = z
  .array(z.number().int().positive())
  .max(20)
  .refine(uniqueNumbers, { message: "duplicate_menu_set_id" });

const hallMutableFields = {
  slug: z.string().trim().min(1).max(80),
  nameRo: z.string().trim().min(2).max(200),
  nameRu: z.string().trim().max(200).nullable(),
  nameEn: z.string().trim().max(200).nullable(),
  descriptionRo: localizedText.nullable(),
  descriptionRu: localizedText.nullable(),
  descriptionEn: localizedText.nullable(),
  capacityMin: z.number().int().positive().nullable(),
  capacityMax: z.number().int().positive().nullable(),
  pricingModel: z.enum(HALL_PRICING_MODELS),
  basePrice: z.number().finite().nonnegative().max(100_000_000).nullable(),
  minimumOrder: z.number().finite().nonnegative().max(100_000_000).nullable(),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
  depositType: z.enum(HALL_DEPOSIT_TYPES),
  depositValue: z.number().finite().nonnegative().max(100_000_000).nullable(),
  facilities: hallFacilitiesSchema,
  workingHours: hallWorkingHoursSchema.nullable(),
  bufferMinutes: z.number().int().nonnegative().max(24 * 60).nullable(),
  bookingTermsRo: localizedText.nullable(),
  bookingTermsRu: localizedText.nullable(),
  bookingTermsEn: localizedText.nullable(),
  seating: z.array(seatingOptionSchema).max(12),
  imageUrls: hallImageUrlsSchema,
  menuSetIds: hallMenuSetIdsSchema,
  inheritMenu: z.boolean(),
  sortOrder: z.number().int().nonnegative().max(1_000_000),
} as const;

function addHallCoherenceIssues(
  data: Partial<{
    capacityMin: number | null;
    capacityMax: number | null;
    depositType: (typeof HALL_DEPOSIT_TYPES)[number];
    depositValue: number | null;
    inheritMenu: boolean;
    menuSetIds: number[];
  }>,
  ctx: z.RefinementCtx,
) {
  if (
    data.capacityMin != null
    && data.capacityMax != null
    && data.capacityMax < data.capacityMin
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["capacityMax"],
      message: "capacity_max_lt_min",
    });
  }
  if (data.depositType === "none" && data.depositValue != null) {
    ctx.addIssue({
      code: "custom",
      path: ["depositValue"],
      message: "deposit_incoherent",
    });
  }
  if (
    data.depositType === "percent"
    && data.depositValue != null
    && (data.depositValue <= 0 || data.depositValue > 100)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["depositValue"],
      message: "deposit_incoherent",
    });
  }
  if (
    data.depositType === "fixed"
    && data.depositValue != null
    && data.depositValue <= 0
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["depositValue"],
      message: "deposit_incoherent",
    });
  }

  const hasInheritMenu = Object.prototype.hasOwnProperty.call(data, "inheritMenu");
  const hasMenuSetIds = Object.prototype.hasOwnProperty.call(data, "menuSetIds");
  if (hasMenuSetIds && !hasInheritMenu) {
    ctx.addIssue({
      code: "custom",
      path: ["inheritMenu"],
      message: "inherit_menu_required_with_menu_set_ids",
    });
  }
  if (data.inheritMenu === true && (data.menuSetIds?.length ?? 0) !== 0) {
    ctx.addIssue({
      code: "custom",
      path: ["menuSetIds"],
      message: "inherited_menu_cannot_have_explicit_sets",
    });
  }
  if (data.inheritMenu === false && (!hasMenuSetIds || data.menuSetIds?.length === 0)) {
    ctx.addIssue({
      code: "custom",
      path: ["menuSetIds"],
      message: "explicit_menu_requires_menu_set_ids",
    });
  }
}

function addHallCreateCoherenceIssues(
  data: Parameters<typeof addHallCoherenceIssues>[0],
  ctx: z.RefinementCtx,
) {
  addHallCoherenceIssues(data, ctx);
  if (data.depositType !== "none" && data.depositValue == null) {
    ctx.addIssue({
      code: "custom",
      path: ["depositValue"],
      message: "deposit_incoherent",
    });
  }
}

/** POST create — durable request identity and explicit create defaults. */
export const hallCreateSchema = z
  .object({
    venueId: z.number().int().positive(),
    hallCreateRequestId: z.string().uuid(),
    slug: hallMutableFields.slug.optional(),
    nameRo: hallMutableFields.nameRo,
    nameRu: hallMutableFields.nameRu.optional().default(null),
    nameEn: hallMutableFields.nameEn.optional().default(null),
    descriptionRo: hallMutableFields.descriptionRo.optional().default(null),
    descriptionRu: hallMutableFields.descriptionRu.optional().default(null),
    descriptionEn: hallMutableFields.descriptionEn.optional().default(null),
    capacityMin: hallMutableFields.capacityMin.optional().default(null),
    capacityMax: hallMutableFields.capacityMax.optional().default(null),
    pricingModel: hallMutableFields.pricingModel.optional().default("quote"),
    basePrice: hallMutableFields.basePrice.optional().default(null),
    minimumOrder: hallMutableFields.minimumOrder.optional().default(null),
    currency: hallMutableFields.currency.optional().default("EUR"),
    depositType: hallMutableFields.depositType.optional().default("none"),
    depositValue: hallMutableFields.depositValue.optional().default(null),
    facilities: hallMutableFields.facilities.optional().default([]),
    workingHours: hallMutableFields.workingHours.optional().default(null),
    bufferMinutes: hallMutableFields.bufferMinutes.optional().default(null),
    bookingTermsRo: hallMutableFields.bookingTermsRo.optional().default(null),
    bookingTermsRu: hallMutableFields.bookingTermsRu.optional().default(null),
    bookingTermsEn: hallMutableFields.bookingTermsEn.optional().default(null),
    seating: hallMutableFields.seating.optional().default([]),
    imageUrls: hallMutableFields.imageUrls.optional().default([]),
    menuSetIds: hallMutableFields.menuSetIds.optional().default([]),
    inheritMenu: hallMutableFields.inheritMenu.optional().default(true),
    sortOrder: hallMutableFields.sortOrder.optional().default(0),
  })
  .strict()
  .superRefine(addHallCreateCoherenceIssues);

/** PATCH — no defaults; omitted children are preserved and `{}` is rejected. */
export const hallPatchSchema = z
  .object({
    slug: hallMutableFields.slug.optional(),
    nameRo: hallMutableFields.nameRo.optional(),
    nameRu: hallMutableFields.nameRu.optional(),
    nameEn: hallMutableFields.nameEn.optional(),
    descriptionRo: hallMutableFields.descriptionRo.optional(),
    descriptionRu: hallMutableFields.descriptionRu.optional(),
    descriptionEn: hallMutableFields.descriptionEn.optional(),
    capacityMin: hallMutableFields.capacityMin.optional(),
    capacityMax: hallMutableFields.capacityMax.optional(),
    pricingModel: hallMutableFields.pricingModel.optional(),
    basePrice: hallMutableFields.basePrice.optional(),
    minimumOrder: hallMutableFields.minimumOrder.optional(),
    currency: hallMutableFields.currency.optional(),
    depositType: hallMutableFields.depositType.optional(),
    depositValue: hallMutableFields.depositValue.optional(),
    facilities: hallMutableFields.facilities.optional(),
    workingHours: hallMutableFields.workingHours.optional(),
    bufferMinutes: hallMutableFields.bufferMinutes.optional(),
    bookingTermsRo: hallMutableFields.bookingTermsRo.optional(),
    bookingTermsRu: hallMutableFields.bookingTermsRu.optional(),
    bookingTermsEn: hallMutableFields.bookingTermsEn.optional(),
    seating: hallMutableFields.seating.optional(),
    imageUrls: hallMutableFields.imageUrls.optional(),
    menuSetIds: hallMutableFields.menuSetIds.optional(),
    inheritMenu: hallMutableFields.inheritMenu.optional(),
    sortOrder: hallMutableFields.sortOrder.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "empty_patch",
  })
  .superRefine(addHallCoherenceIssues);

/** Compatibility type only; callers must choose create or patch explicitly. */
export type HallCreateInput = z.infer<typeof hallCreateSchema>;
export type HallPatchInput = z.infer<typeof hallPatchSchema>;

export type MissingField = {
  step: string;
  field: string;
  message: string;
  path: string;
};

export function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function validatePhoneOrError(raw: string): { ok: true; e164: string } | { ok: false; message: string } {
  const check = validatePhone(raw);
  if (!check.ok) return { ok: false, message: check.error };
  return { ok: true, e164: check.e164 };
}

export function organizationLegalIssues(input: {
  type: "individual" | "sole_trader" | "company";
  legalName?: string | null;
  idNumber?: string | null;
  legalAddress?: string | null;
}): MissingField[] {
  const missing: MissingField[] = [];
  const legalName = input.legalName?.trim() ?? "";
  if (input.type === "individual") {
    if (!isFullPersonName(legalName)) {
      missing.push({ step: "legal", field: "legalName", message: "legal_name_invalid", path: "legalName" });
    }
  } else if (!isOfficialEntityName(legalName)) {
    missing.push({ step: "legal", field: "legalName", message: "legal_name_invalid", path: "legalName" });
  }
  if (!isMoldovanIdNumber(input.idNumber)) {
    missing.push({ step: "legal", field: "idNumber", message: "moldovan_id_must_have_13_digits", path: "idNumber" });
  }
  if (!isCompleteLegalAddress(input.legalAddress)) {
    missing.push({ step: "legal", field: "legalAddress", message: "legal_address_invalid", path: "legalAddress" });
  }
  return missing;
}
