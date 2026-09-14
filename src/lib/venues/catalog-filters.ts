import {
  isValidCalendarDate,
  isValidCalendarTime,
} from "@/lib/booking/calendar-input-validation";

export const CATALOG_SORTS = [
  "popular",
  "price_asc",
  "price_desc",
  "rating",
  "capacity",
] as const;

export type CatalogSort = (typeof CATALOG_SORTS)[number];

export type AvailabilityStatus = "unchecked" | "needs_interval" | "available" | "unavailable" | "invalid_interval";

export type ParsedCatalogFilters = {
  city?: string;
  cityKeywords?: string[];
  featured?: boolean;
  guestCount?: number;
  capacityMax?: number;
  priceMax?: number;
  date?: string;
  startTime?: string;
  endTime?: string;
  sort: CatalogSort;
  page: number;
  limit: number;
  availabilityStatus: AvailabilityStatus;
  intervalComplete: boolean;
  invalidFields: string[];
};

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 48;

function firstString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

function parseBoundedInt(
  value: unknown,
  opts: { min: number; max: number },
): number | undefined {
  const raw = typeof value === "number" ? value : Number(firstString(value));
  if (!Number.isFinite(raw) || !Number.isInteger(raw)) return undefined;
  if (raw < opts.min || raw > opts.max) return undefined;
  return raw;
}

function parseSort(value: unknown): CatalogSort {
  const raw = firstString(value);
  return CATALOG_SORTS.includes(raw as CatalogSort) ? raw as CatalogSort : "popular";
}

export function parseCatalogFilters(
  input: Record<string, unknown> | undefined | null,
): ParsedCatalogFilters {
  const src = input ?? {};
  const invalidFields: string[] = [];
  const city = firstString(src.city)?.trim() || undefined;
  const cityKeywords = Array.isArray(src.cityKeywords)
    ? src.cityKeywords.map((item) => String(item).trim()).filter(Boolean)
    : undefined;
  const guestCount =
    parseBoundedInt(src.guestCount ?? src.guest_count ?? src.guests ?? src.capacityMin ?? src.capacity_min, {
      min: 1,
      max: 10_000,
    });
  if ((src.guestCount ?? src.guest_count ?? src.guests ?? src.capacityMin ?? src.capacity_min) != null && guestCount == null) {
    invalidFields.push("guest_count");
  }
  const capacityMax = parseBoundedInt(src.capacityMax ?? src.capacity_max, {
    min: 1,
    max: 10_000,
  });
  if ((src.capacityMax ?? src.capacity_max) != null && capacityMax == null) invalidFields.push("capacity_max");
  const priceMax = parseBoundedInt(src.priceMax ?? src.price_max, {
    min: 0,
    max: 10_000_000,
  });
  if ((src.priceMax ?? src.price_max) != null && priceMax == null) invalidFields.push("price_max");
  const dateRaw = firstString(src.availableDate ?? src.date);
  const date = dateRaw && isValidCalendarDate(dateRaw) ? dateRaw : undefined;
  const startTimeRaw = firstString(src.startTime ?? src.start_time ?? src.start);
  const endTimeRaw = firstString(src.endTime ?? src.end_time ?? src.end);
  const startTime = startTimeRaw && isValidCalendarTime(startTimeRaw) ? startTimeRaw : undefined;
  const endTime = endTimeRaw && isValidCalendarTime(endTimeRaw) ? endTimeRaw : undefined;
  if (dateRaw && !date) invalidFields.push("date");
  if (startTimeRaw && !startTime) invalidFields.push("start");
  if (endTimeRaw && !endTime) invalidFields.push("end");
  const featuredRaw = src.featured;
  const featured = featuredRaw === true || featuredRaw === "true" ? true : undefined;
  const page = parseBoundedInt(src.page, { min: 1, max: 10_000 }) ?? 1;
  const limit = parseBoundedInt(src.limit, { min: 1, max: MAX_LIMIT }) ?? DEFAULT_LIMIT;
  const sort = parseSort(src.sort);

  const hasAnyIntervalPart = Boolean(dateRaw || startTimeRaw || endTimeRaw);
  const intervalComplete = Boolean(date && startTime && endTime);
  const invalidInterval = invalidFields.some((field) => field === "date" || field === "start" || field === "end");
  const availabilityStatus: AvailabilityStatus = invalidInterval
    ? "invalid_interval"
    : intervalComplete
    ? "available"
    : hasAnyIntervalPart
      ? "needs_interval"
      : "unchecked";

  return {
    city,
    cityKeywords: cityKeywords?.length ? cityKeywords : undefined,
    featured,
    guestCount,
    capacityMax,
    priceMax,
    date,
    startTime,
    endTime,
    sort,
    page,
    limit,
    availabilityStatus,
    intervalComplete,
    invalidFields,
  };
}

export function catalogSortForPrices(
  sort: CatalogSort,
  revealPrices: boolean,
): CatalogSort {
  if (!revealPrices && (sort === "price_asc" || sort === "price_desc")) return "popular";
  return sort;
}
