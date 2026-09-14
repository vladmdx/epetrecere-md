import { mapAdminOrganizationSummary, type AdminOrganizationSummary } from "./organization-summary";
import { isAdminHallPublishable } from "./venue-detail";

export type RegistrationQueueHall = {
  id: number;
  nameRo: string;
  nameRu: string | null;
  nameEn: string | null;
  slug: string;
  status: string;
  isLegacyDefault: boolean;
  capacityMin: number | null;
  capacityMax: number | null;
  pricingModel: string;
  basePrice: number | null;
  minimumOrder: number | null;
  currency: string;
  photoCount: number;
};

export type RegistrationVenueSummaries = {
  hallCount: number;
  noHalls: boolean;
  unpublishableCount: number;
  allUnpublishable: boolean;
};

export type RegistrationHallSource = {
  id: number;
  venueId: number;
  nameRo: string;
  nameRu: string | null;
  nameEn: string | null;
  slug: string;
  status: string;
  isLegacyDefault: boolean;
  capacityMin: number | null;
  capacityMax: number | null;
  pricingModel: string;
  basePrice: number | null;
  minimumOrder: number | null;
  currency: string;
  sortOrder: number;
};

export function isRegistrationHallPublishable(hall: {
  status: string;
  slug?: string | null;
  nameRo?: string | null;
  capacityMin?: number | null;
  capacityMax?: number | null;
}): boolean {
  if (!isAdminHallPublishable(hall)) return false;
  return hall.capacityMin != null || hall.capacityMax != null;
}

export function registrationVenueSummaries(
  halls: readonly {
    status: string;
    slug?: string | null;
    nameRo?: string | null;
    capacityMin?: number | null;
    capacityMax?: number | null;
  }[],
): RegistrationVenueSummaries {
  const unpublishableCount = halls.filter((hall) => !isRegistrationHallPublishable(hall)).length;
  return {
    hallCount: halls.length,
    noHalls: halls.length === 0,
    unpublishableCount,
    allUnpublishable: halls.length > 0 && unpublishableCount === halls.length,
  };
}

export function mapRegistrationQueueHalls(input: {
  venueId: number;
  halls: readonly RegistrationHallSource[];
  photoCountByHallId: ReadonlyMap<number, number>;
}): RegistrationQueueHall[] {
  return input.halls
    .filter((hall) => hall.venueId === input.venueId)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    .map((hall) => ({
      id: hall.id,
      nameRo: hall.nameRo,
      nameRu: hall.nameRu,
      nameEn: hall.nameEn,
      slug: hall.slug,
      status: hall.status,
      isLegacyDefault: hall.isLegacyDefault,
      capacityMin: hall.capacityMin,
      capacityMax: hall.capacityMax,
      pricingModel: hall.pricingModel,
      basePrice: hall.basePrice,
      minimumOrder: hall.minimumOrder,
      currency: hall.currency,
      photoCount: input.photoCountByHallId.get(hall.id) ?? 0,
    }));
}

export function attachRegistrationVenueAudit(input: {
  venueId: number;
  organizationId: number | null;
  organizationsById: ReadonlyMap<number, AdminOrganizationSummary>;
  halls: readonly RegistrationHallSource[];
  photoCountByHallId: ReadonlyMap<number, number>;
}): {
  organization: AdminOrganizationSummary | null;
  halls: RegistrationQueueHall[];
  summaries: RegistrationVenueSummaries;
} {
  const halls = mapRegistrationQueueHalls(input);
  const organization =
    input.organizationId == null
      ? null
      : mapAdminOrganizationSummary(input.organizationsById.get(input.organizationId) ?? null);
  return {
    organization,
    halls,
    summaries: registrationVenueSummaries(halls),
  };
}
