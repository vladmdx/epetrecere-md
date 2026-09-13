import { z } from "zod/v4";
import { validatePhone } from "@/lib/phone/validate";
import { isCompleteLegalAddress, isMoldovanIdNumber, isOfficialEntityName, isFullPersonName } from "@/lib/legal/identity-validation";

export const HALL_PRICING_MODELS = ["per_person", "minimum_order", "fixed", "quote"] as const;
export const HALL_DEPOSIT_TYPES = ["none", "percent", "fixed"] as const;
export const HALL_SEATING_TYPES = ["banquet", "theatre", "classroom", "cocktail", "u_shape", "custom"] as const;
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
  imageUrls: z.array(z.string().url()).max(10).default([]),
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
});

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
});

export const hallDraftSchema = z.object({
  venueId: z.number().int().positive(),
  hallId: z.number().int().positive().optional(),
  slug: z.string().trim().min(1).max(80).optional(),
  nameRo: z.string().trim().min(2).max(200),
  nameRu: z.string().trim().max(200).optional().nullable(),
  nameEn: z.string().trim().max(200).optional().nullable(),
  descriptionRo: localizedText.optional().nullable(),
  descriptionRu: localizedText.optional().nullable(),
  descriptionEn: localizedText.optional().nullable(),
  capacityMin: z.number().int().positive().optional(),
  capacityMax: z.number().int().positive().optional(),
  pricingModel: z.enum(HALL_PRICING_MODELS).default("quote"),
  basePrice: z.number().nonnegative().optional().nullable(),
  minimumOrder: z.number().nonnegative().optional().nullable(),
  currency: z.string().trim().length(3).default("EUR"),
  depositType: z.enum(HALL_DEPOSIT_TYPES).default("none"),
  depositValue: z.number().nonnegative().optional().nullable(),
  facilities: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
  workingHours: z.record(z.string(), z.object({ open: z.string(), close: z.string() }).nullable()).optional().nullable(),
  bufferMinutes: z.number().int().nonnegative().max(24 * 60).optional().nullable(),
  bookingTermsRo: localizedText.optional().nullable(),
  bookingTermsRu: localizedText.optional().nullable(),
  bookingTermsEn: localizedText.optional().nullable(),
  seating: z.array(seatingOptionSchema).max(12).default([]),
  imageUrls: z.array(z.string().url()).max(20).default([]),
  menuSetIds: z.array(z.number().int().positive()).max(20).optional(),
  inheritMenu: z.boolean().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
}).refine((data) => {
  if (data.capacityMin == null || data.capacityMax == null) return true;
  return data.capacityMax >= data.capacityMin;
}, {
  path: ["capacityMax"],
  message: "capacity_max_lt_min",
}).refine((data) => {
  if (data.depositType === "none") return true;
  if (data.depositValue == null) return true;
  if (data.depositType === "percent") return data.depositValue > 0 && data.depositValue <= 100;
  return data.depositValue > 0;
}, { path: ["depositValue"], message: "deposit_incoherent" });

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
