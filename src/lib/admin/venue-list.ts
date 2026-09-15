import { parsePositiveInt } from "./parse-positive-int";
import {
  mapAdminOrganizationSummary,
  type AdminOrganizationSummary,
} from "./organization-summary";
import { adminVenuePublicHref } from "./venue-detail";

export const ADMIN_VENUE_LIST_DEFAULT_PAGE = 1;
export const ADMIN_VENUE_LIST_DEFAULT_LIMIT = 20;
export const ADMIN_VENUE_LIST_MAX_LIMIT = 50;
// Keep OFFSET bounded for both Postgres and the administrator's browser.
export const ADMIN_VENUE_LIST_MAX_OFFSET = 100_000;
export const ADMIN_VENUE_SEARCH_MAX_LENGTH = 120;

export const ADMIN_VENUE_STATUS_FILTERS = [
  "published",
  "unpublished",
  "draft",
  "pending",
  "active",
  "rejected",
  "suspended",
  "archived",
] as const;

export type AdminVenueStatusFilter = (typeof ADMIN_VENUE_STATUS_FILTERS)[number];

export type AdminVenueListQuery =
  | {
      ok: true;
      page: number;
      limit: number;
      q: string | null;
      status: AdminVenueStatusFilter | null;
    }
  | { ok: false; error: string; status: 400 };

export type AdminHallPriceInput = {
  pricingModel: string | null | undefined;
  basePrice: number | null | undefined;
  minimumOrder: number | null | undefined;
  currency: string | null | undefined;
};

export type AdminMinHallPrice = {
  amount: number;
  currency: string;
  model: string;
};

export type AdminHallAggregate = {
  total: number;
  byStatus: Record<string, number>;
  maxCapacity: number | null;
  minPrice: AdminMinHallPrice | null;
};

export type AdminVenueListItem = {
  id: number;
  nameRo: string;
  nameRu: string | null;
  nameEn: string | null;
  slug: string;
  city: string | null;
  isActive: boolean;
  isFeatured: boolean;
  ratingAvg: number | null;
  capacityMin: number | null;
  capacityMax: number | null;
  pricePerPerson: number | null;
  organization: AdminOrganizationSummary | null;
  halls: AdminHallAggregate;
  publicHref: string | null;
};

function finiteAmount(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function escapeIlikePattern(raw: string): string {
  return raw.replace(/[\\%_]/g, "\\$&");
}

export function parseAdminVenueListQuery(
  searchParams: URLSearchParams,
): AdminVenueListQuery {
  const pageRaw = searchParams.get("page");
  const limitRaw = searchParams.get("limit");
  const page =
    pageRaw == null || pageRaw.trim() === ""
      ? ADMIN_VENUE_LIST_DEFAULT_PAGE
      : parsePositiveInt(pageRaw);
  const limit =
    limitRaw == null || limitRaw.trim() === ""
      ? ADMIN_VENUE_LIST_DEFAULT_LIMIT
      : parsePositiveInt(limitRaw);
  if (page == null) {
    return { ok: false, error: "Invalid page", status: 400 };
  }
  if (limit == null || limit > ADMIN_VENUE_LIST_MAX_LIMIT) {
    return { ok: false, error: "Invalid limit", status: 400 };
  }
  if ((page - 1) * limit > ADMIN_VENUE_LIST_MAX_OFFSET) {
    return { ok: false, error: "Invalid page", status: 400 };
  }

  const qRaw = searchParams.get("q");
  let q: string | null = null;
  if (qRaw != null && qRaw.trim() !== "") {
    const trimmed = qRaw.trim();
    if (trimmed.length > ADMIN_VENUE_SEARCH_MAX_LENGTH) {
      return { ok: false, error: "Invalid search", status: 400 };
    }
    q = trimmed;
  }

  const statusRaw = searchParams.get("status");
  let status: AdminVenueStatusFilter | null = null;
  if (statusRaw != null && statusRaw.trim() !== "") {
    const value = statusRaw.trim();
    if (!(ADMIN_VENUE_STATUS_FILTERS as readonly string[]).includes(value)) {
      return { ok: false, error: "Invalid status", status: 400 };
    }
    status = value as AdminVenueStatusFilter;
  }

  return { ok: true, page, limit, q, status };
}

export function adminHallAmount(hall: AdminHallPriceInput): AdminMinHallPrice | null {
  const currency = (hall.currency ?? "EUR").trim().toUpperCase();
  if (!currency) return null;
  const model = hall.pricingModel;
  if (model === "quote" || model == null) return null;
  if (model === "per_person") {
    const amount = finiteAmount(hall.basePrice);
    return amount == null ? null : { amount, currency, model };
  }
  if (model === "minimum_order") {
    const amount = finiteAmount(hall.minimumOrder);
    return amount == null ? null : { amount, currency, model };
  }
  if (model === "fixed") {
    const amount = finiteAmount(hall.basePrice);
    return amount == null ? null : { amount, currency, model };
  }
  return null;
}

export function adminMinHallPrice(
  halls: readonly AdminHallPriceInput[],
): AdminMinHallPrice | null {
  const priced = halls
    .map(adminHallAmount)
    .filter((row): row is AdminMinHallPrice => row != null);
  if (priced.length === 0) return null;
  const models = new Set(priced.map((row) => row.model));
  const currencies = new Set(priced.map((row) => row.currency));
  if (models.size !== 1 || currencies.size !== 1) return null;
  return priced.reduce((min, row) => (row.amount < min.amount ? row : min));
}

export function adminMaxHallCapacity(
  halls: readonly { capacityMax?: number | null; capacityMin?: number | null }[],
): number | null {
  let max: number | null = null;
  for (const hall of halls) {
    const cap = hall.capacityMax ?? hall.capacityMin ?? null;
    if (typeof cap === "number" && Number.isFinite(cap)) {
      max = max == null ? cap : Math.max(max, cap);
    }
  }
  return max;
}

export function adminHallCountsByStatus(
  halls: readonly { status: string }[],
): { total: number; byStatus: Record<string, number> } {
  const byStatus: Record<string, number> = {};
  for (const hall of halls) {
    byStatus[hall.status] = (byStatus[hall.status] ?? 0) + 1;
  }
  return { total: halls.length, byStatus };
}

export function aggregateAdminHalls(
  halls: readonly (AdminHallPriceInput & {
    status: string;
    capacityMax?: number | null;
    capacityMin?: number | null;
  })[],
): AdminHallAggregate {
  const counts = adminHallCountsByStatus(halls);
  return {
    total: counts.total,
    byStatus: counts.byStatus,
    maxCapacity: adminMaxHallCapacity(halls),
    // A draft/rejected hall must not lower the apparent price of published halls.
    minPrice: adminMinHallPrice(halls.filter((hall) => hall.status === "active")),
  };
}

export type AdminVenueListRow = {
  id: number;
  nameRo: string;
  nameRu: string | null;
  nameEn: string | null;
  slug: string;
  city: string | null;
  isActive: boolean;
  isFeatured: boolean;
  ratingAvg: number | null;
  capacityMin: number | null;
  capacityMax: number | null;
  pricePerPerson: number | null;
  organizationId: number | null;
  orgId: number | null;
  orgDisplayName: string | null;
  orgLegalName: string | null;
  orgType: string | null;
  orgStatus: string | null;
};

export type AdminVenueHallRow = AdminHallPriceInput & {
  id: number;
  venueId: number;
  status: string;
  capacityMin: number | null;
  capacityMax: number | null;
};

export function hallsBelongingToVenue<T extends { venueId: number }>(
  venueId: number,
  halls: readonly T[],
): T[] {
  return halls.filter((hall) => hall.venueId === venueId);
}

export function mapAdminVenueListItems(
  rows: readonly AdminVenueListRow[],
  halls: readonly AdminVenueHallRow[],
): AdminVenueListItem[] {
  const hallsByVenue = new Map<number, AdminVenueHallRow[]>();
  for (const hall of halls) {
    const list = hallsByVenue.get(hall.venueId);
    if (list) list.push(hall);
    else hallsByVenue.set(hall.venueId, [hall]);
  }

  return rows.map((row) => {
    const organization =
      row.orgId != null
        ? mapAdminOrganizationSummary({
            id: row.orgId,
            displayName: row.orgDisplayName ?? "",
            legalName: row.orgLegalName,
            type: row.orgType ?? "",
            status: row.orgStatus ?? "",
          })
        : null;
    const aggregate = aggregateAdminHalls(hallsByVenue.get(row.id) ?? []);
    return {
      id: row.id,
      nameRo: row.nameRo,
      nameRu: row.nameRu,
      nameEn: row.nameEn,
      slug: row.slug,
      city: row.city,
      isActive: row.isActive,
      isFeatured: row.isFeatured,
      ratingAvg: row.ratingAvg,
      capacityMin: row.capacityMin,
      capacityMax: row.capacityMax,
      pricePerPerson: row.pricePerPerson,
      organization,
      halls: aggregate,
      publicHref: adminVenuePublicHref({
        venueSlug: row.slug,
        venueIsActive: row.isActive,
        organizationId: row.organizationId,
        organizationStatus: organization?.status ?? null,
        activeHallCount: aggregate.byStatus.active ?? 0,
      }),
    };
  });
}
