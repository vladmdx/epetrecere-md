import { adminHallAmount, type AdminHallPriceInput, type AdminMinHallPrice } from "./venue-list";

export const ADMIN_VENUE_STATUS_I18N: Record<string, string> = {
  published: "adminUi.venues.statusPublished",
  unpublished: "adminUi.venues.statusUnpublished",
  draft: "adminUi.venues.statusDraft",
  pending: "adminUi.venues.statusPending",
  active: "adminUi.venues.statusActive",
  rejected: "adminUi.venues.statusRejected",
  suspended: "adminUi.venues.statusSuspended",
  archived: "adminUi.venues.statusArchived",
};

const PRICE_MODEL_I18N: Record<string, string> = {
  per_person: "adminUi.venues.pricePerPersonModel",
  fixed: "adminUi.venues.priceFixedModel",
  minimum_order: "adminUi.venues.priceMinimumOrderModel",
};

type Translate = (key: string, vars?: Record<string, string | number>) => string;

export function adminVenueStatusText(status: string, t: Translate): string {
  const key = ADMIN_VENUE_STATUS_I18N[status];
  return key ? t(key) : status;
}

export function adminKnownPriceText(price: AdminMinHallPrice, t: Translate): string {
  const key = PRICE_MODEL_I18N[price.model];
  return `${price.amount} ${price.currency} · ${key ? t(key) : price.model}`;
}

export function adminHallPriceText(hall: AdminHallPriceInput, t: Translate): string {
  const price = adminHallAmount(hall);
  if (price) return adminKnownPriceText(price, t);
  if (hall.pricingModel === "quote") return t("adminUi.venues.priceQuoteModel");
  return t("adminUi.venues.priceUnknown");
}
