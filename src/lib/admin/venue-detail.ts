import { isMultiHallEnabled } from "@/lib/feature-flags";
import {
  mapAdminOrganizationSummary,
  type AdminOrganizationSummary,
} from "./organization-summary";

export type AdminVenueHallDetail = {
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
  depositType: string;
  depositValue: number | null;
  sortOrder: number;
  updatedAt: string | null;
  photoCount: number;
  publicHref: string | null;
};

export type AdminVenueImage = {
  id: number;
  url: string;
  altRo: string | null;
  altRu: string | null;
  altEn: string | null;
  sortOrder: number | null;
  isCover: boolean;
};

export type AdminVenueHallSource = {
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
  depositType: string;
  depositValue: number | null;
  sortOrder: number;
  updatedAt: Date | string | null;
};

export function isAdminHallPublishable(hall: {
  status: string;
  slug?: string | null;
  nameRo?: string | null;
}): boolean {
  if (hall.status !== "active") return false;
  if (!hall.slug?.trim()) return false;
  if (!hall.nameRo?.trim()) return false;
  return true;
}

export function adminPublicHallHref(input: {
  venueSlug: string;
  hallSlug: string;
  hallStatus: string;
  venueIsActive: boolean;
  organizationStatus: string | null;
}): string | null {
  if (!input.venueIsActive) return null;
  if (input.hallStatus !== "active") return null;
  if (!input.venueSlug.trim() || !input.hallSlug.trim()) return null;
  if (
    isMultiHallEnabled() &&
    input.organizationStatus != null &&
    input.organizationStatus !== "active"
  ) {
    return null;
  }
  return `/sali/${input.venueSlug}?hall=${encodeURIComponent(input.hallSlug)}`;
}

function isoTimestamp(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function mapAdminVenueHalls(input: {
  venueId: number;
  venueSlug: string;
  venueIsActive: boolean;
  organizationStatus: string | null;
  halls: readonly AdminVenueHallSource[];
  photoCountByHallId: ReadonlyMap<number, number>;
}): AdminVenueHallDetail[] {
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
      depositType: hall.depositType,
      depositValue: hall.depositValue,
      sortOrder: hall.sortOrder,
      updatedAt: isoTimestamp(hall.updatedAt),
      photoCount: input.photoCountByHallId.get(hall.id) ?? 0,
      publicHref: adminPublicHallHref({
        venueSlug: input.venueSlug,
        hallSlug: hall.slug,
        hallStatus: hall.status,
        venueIsActive: input.venueIsActive,
        organizationStatus: input.organizationStatus,
      }),
    }));
}

export function mapAdminGeneralImages(
  venueId: number,
  images: readonly (AdminVenueImage & { venueId: number; hallId: number | null })[],
): AdminVenueImage[] {
  return images
    .filter((image) => image.venueId === venueId && image.hallId == null)
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id)
    .map(({ id, url, altRo, altRu, altEn, sortOrder, isCover }) => ({
      id,
      url,
      altRo,
      altRu,
      altEn,
      sortOrder,
      isCover,
    }));
}

export function mapAdminOrganizationForVenue(
  organizationId: number | null,
  org:
    | {
        id: number;
        displayName: string;
        legalName: string | null;
        type: string;
        status: string;
      }
    | null
    | undefined,
): AdminOrganizationSummary | null {
  if (organizationId == null) return null;
  if (org == null || org.id !== organizationId) return null;
  return mapAdminOrganizationSummary(org);
}
