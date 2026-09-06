import { z } from "zod/v4";
import { canonicalMoldovaCity } from "@/lib/moldova-cities";

/** Shared by registration and subsequent profile edits, so invalid numeric
 * values are rejected before reaching PostgreSQL integer columns. */
export const artistTravelShape = {
  baseCity: z.string().trim().min(2).max(120).optional(),
  travelDistanceKm: z.number().int().min(0).max(999).optional(),
  travelSurchargeEnabled: z.boolean().optional(),
  travelSurchargeAmount: z.number().int().min(0).max(10_000).nullable().optional(),
  priceHidden: z.boolean().optional(),
};

export function artistLocationUpdate(data: { baseCity?: string | null; location?: string | null }) {
  const input = data.baseCity?.trim() || data.location?.trim();
  const city = input ? canonicalMoldovaCity(input) ?? input : undefined;
  return city ? { baseCity: city, location: city } : {};
}

export const registrationDecisionSchema = z.object({
  id: z.number().int().positive(),
  type: z.enum(["artist", "venue"]),
  action: z.enum(["approve", "reject"]),
});

/** These remain admin-owned even when a profile editor submits a full row. */
export function venueOwnerFields<T extends { isActive?: boolean; isFeatured?: boolean }>(data: T, admin: boolean) {
  const result = { ...data };
  if (!admin) {
    delete result.isActive;
    delete result.isFeatured;
  }
  return result;
}
