import type { AvailabilityStatus } from "./catalog-filters";
import type { EffectivePrice } from "./effective-price";
import type { WorkingHours } from "@/components/vendor/working-hours-editor";

export type PublicHallCard = {
  id: number;
  slug: string;
  nameRo: string;
  nameRu: string | null;
  nameEn: string | null;
  capacityMin: number | null;
  capacityMax: number | null;
  suitable: boolean;
  available: boolean | null;
  pricingModel?: string;
  minEffectivePrice?: number | null;
  unitPrice?: number | null;
  currency?: string | null;
  descriptionRo?: string | null;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
  facilities?: string[] | null;
  workingHours?: WorkingHours | null;
  bookingTermsRo?: string | null;
  bookingTermsRu?: string | null;
  bookingTermsEn?: string | null;
  seatingOptions?: Array<{
    type?: string;
    labelRo?: string | null;
    labelRu?: string | null;
    labelEn?: string | null;
    capacityMin: number | null;
    capacityMax: number | null;
    notesRo?: string | null;
    notesRu?: string | null;
    notesEn?: string | null;
  }>;
};

export type PublicVenueCard = {
  id: number;
  slug: string;
  nameRo: string;
  nameRu: string | null;
  nameEn: string | null;
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  capacityMin: number | null;
  capacityMax: number | null;
  ratingAvg: number | null;
  ratingCount: number | null;
  isFeatured: boolean;
  coverImageUrl: string | null;
  totalHallCount: number;
  suitableHallCount: number;
  availableHallCount: number | null;
  availabilityStatus: AvailabilityStatus;
  eligibleHallIds: number[];
  halls: PublicHallCard[];
  pricePerPerson: number | null;
  minEffectivePrice: number | null;
  minUnitPrice: number | null;
  currency: string | null;
};

const VENUE_ALLOWLIST = [
  "id",
  "slug",
  "nameRo",
  "nameRu",
  "nameEn",
  "address",
  "city",
  "lat",
  "lng",
  "capacityMin",
  "capacityMax",
  "ratingAvg",
  "ratingCount",
  "isFeatured",
  "coverImageUrl",
  "totalHallCount",
  "suitableHallCount",
  "availableHallCount",
  "availabilityStatus",
  "eligibleHallIds",
  "halls",
  "pricePerPerson",
  "minEffectivePrice",
  "minUnitPrice",
  "currency",
] as const;

const VENUE_DETAIL_ALLOWLIST = [
  ...VENUE_ALLOWLIST,
  "descriptionRo",
  "descriptionRu",
  "descriptionEn",
  "facilities",
  "workingHours",
  "calendarEnabled",
  "images",
  "hallImages",
  "reviews",
  "seoTitleRo",
  "seoTitleRu",
  "seoTitleEn",
  "seoDescRo",
  "seoDescRu",
  "seoDescEn",
  "ogImageUrl",
  "isActive",
] as const;

const HALL_ALLOWLIST = [
  "id", "slug", "nameRo", "nameRu", "nameEn", "capacityMin",
  "capacityMax", "suitable", "available", "pricingModel",
  "minEffectivePrice", "unitPrice", "currency",
  "descriptionRo", "descriptionRu", "descriptionEn", "facilities",
  "workingHours", "bookingTermsRo", "bookingTermsRu", "bookingTermsEn",
  "seatingOptions",
] as const;
const IMAGE_ALLOWLIST = [
  "id", "venueId", "hallId", "url", "altRo", "altRu", "altEn",
  "sortOrder", "isCover",
] as const;
const REVIEW_ALLOWLIST = [
  "id", "authorName", "rating", "text", "reply", "isApproved", "photos",
  "createdAt",
] as const;

function pickAllowlisted(
  input: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  return Object.fromEntries(keys.filter((key) => key in source).map((key) => [key, source[key]]));
}

/** Strict public detail boundary for API/RSC consumers, including flag OFF. */
export function allowlistedVenueDetail(input: unknown): Record<string, unknown> {
  const detail = pickAllowlisted(input, VENUE_DETAIL_ALLOWLIST);
  const source = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  detail.halls = Array.isArray(source.halls)
    ? source.halls.map((hall) => pickAllowlisted(hall, HALL_ALLOWLIST))
    : [];
  detail.images = Array.isArray(source.images)
    ? source.images.map((image) => pickAllowlisted(image, IMAGE_ALLOWLIST))
    : [];
  detail.hallImages = Array.isArray(source.hallImages)
    ? source.hallImages.map((image) => pickAllowlisted(image, IMAGE_ALLOWLIST))
    : [];
  detail.reviews = Array.isArray(source.reviews)
    ? source.reviews.map((review) => pickAllowlisted(review, REVIEW_ALLOWLIST))
    : [];
  return detail;
}

export function stripVenuePrices<T extends {
  pricePerPerson?: number | null;
  minEffectivePrice?: number | null;
  minUnitPrice?: number | null;
  currency?: string | null;
  halls?: PublicHallCard[];
}>(venue: T): T {
  return {
    ...venue,
    pricePerPerson: null,
    minEffectivePrice: null,
    minUnitPrice: null,
    currency: null,
    halls: venue.halls?.map((hall) => ({
      ...hall,
      minEffectivePrice: undefined,
      unitPrice: undefined,
      currency: undefined,
      pricingModel: undefined,
    })),
  };
}

export function allowlistedVenueCard(input: PublicVenueCard): PublicVenueCard {
  const out = {} as PublicVenueCard;
  for (const key of VENUE_ALLOWLIST) {
    (out as Record<string, unknown>)[key] = input[key];
  }
  return out;
}

export function hallPriceFields(
  revealPrices: boolean,
  price: EffectivePrice | null,
): Pick<PublicHallCard, "minEffectivePrice" | "unitPrice" | "currency" | "pricingModel"> {
  if (!revealPrices || !price) return {};
  if (!price.comparable) {
    if (price.reason === "missing_guest_count") {
      return {
        minEffectivePrice: null,
        unitPrice: price.unitAmount,
        currency: price.currency,
        pricingModel: price.model,
      };
    }
    return { minEffectivePrice: null, currency: null };
  }
  return {
    minEffectivePrice: price.amount,
    unitPrice: price.unitAmount ?? null,
    currency: price.currency,
    pricingModel: price.model,
  };
}
