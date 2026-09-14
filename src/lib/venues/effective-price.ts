/**
 * Pure catalog price resolver. Display, filter, sort and hall selection only.
 * Never writes agreedPrice, commercialSnapshot, or any booking row.
 */

export const CATALOG_CURRENCY = "EUR" as const;

export type HallPricingModel = "per_person" | "minimum_order" | "fixed" | "quote";

export type HallPriceInput = {
  pricingModel: string | null | undefined;
  basePrice: number | null | undefined;
  minimumOrder: number | null | undefined;
  currency: string | null | undefined;
};

export type ComparableEffectivePrice = {
  comparable: true;
  amount: number;
  currency: typeof CATALOG_CURRENCY;
  model: Exclude<HallPricingModel, "quote">;
  unitAmount?: number;
};

export type NonComparableEffectivePrice =
  | {
      comparable: false;
      reason: "missing_guest_count";
      unitAmount: number;
      currency: typeof CATALOG_CURRENCY;
      model: "per_person";
    }
  | {
      comparable: false;
      reason: "quote" | "non_eur" | "missing_amount";
    };

export type EffectivePrice = ComparableEffectivePrice | NonComparableEffectivePrice;

function finiteAmount(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function normalizeCatalogCurrency(currency: string | null | undefined): string {
  return (currency ?? CATALOG_CURRENCY).trim().toUpperCase();
}

export function isCatalogCurrency(currency: string | null | undefined): boolean {
  return normalizeCatalogCurrency(currency) === CATALOG_CURRENCY;
}

export function hallEffectivePrice(
  hall: HallPriceInput,
  guestCount?: number | null,
): EffectivePrice {
  if (!isCatalogCurrency(hall.currency)) {
    return { comparable: false, reason: "non_eur" };
  }
  const model = hall.pricingModel;
  if (model === "quote" || (model != null && model !== "per_person" && model !== "minimum_order" && model !== "fixed")) {
    return { comparable: false, reason: "quote" };
  }
  if (model === "per_person") {
    const unit = finiteAmount(hall.basePrice);
    if (unit == null) return { comparable: false, reason: "missing_amount" };
    if (guestCount == null || !Number.isFinite(guestCount) || guestCount <= 0) {
      return {
        comparable: false,
        reason: "missing_guest_count",
        unitAmount: unit,
        currency: CATALOG_CURRENCY,
        model: "per_person",
      };
    }
    return {
      comparable: true,
      amount: unit * guestCount,
      currency: CATALOG_CURRENCY,
      model: "per_person",
      unitAmount: unit,
    };
  }
  if (model === "minimum_order") {
    const amount = finiteAmount(hall.minimumOrder);
    if (amount == null) return { comparable: false, reason: "missing_amount" };
    return { comparable: true, amount, currency: CATALOG_CURRENCY, model: "minimum_order" };
  }
  const amount = finiteAmount(hall.basePrice);
  if (amount == null) return { comparable: false, reason: "missing_amount" };
  return { comparable: true, amount, currency: CATALOG_CURRENCY, model: "fixed" };
}

export function minComparablePrice(
  prices: readonly EffectivePrice[],
): { amount: number; currency: typeof CATALOG_CURRENCY } | null {
  let min: number | null = null;
  for (const price of prices) {
    if (!price.comparable) continue;
    min = min == null ? price.amount : Math.min(min, price.amount);
  }
  return min == null ? null : { amount: min, currency: CATALOG_CURRENCY };
}

export function minPerPersonUnitPrice(
  prices: readonly EffectivePrice[],
): { amount: number; currency: typeof CATALOG_CURRENCY } | null {
  let min: number | null = null;
  for (const price of prices) {
    const unit = price.comparable
      ? price.model === "per_person" ? price.unitAmount ?? null : null
      : price.reason === "missing_guest_count" ? price.unitAmount : null;
    if (unit == null) continue;
    min = min == null ? unit : Math.min(min, unit);
  }
  return min == null ? null : { amount: min, currency: CATALOG_CURRENCY };
}
