import { bookingTextForViewer } from "@/lib/privacy/booking-text";

export type PriceOffer = {
  from: "artist" | "client";
  amount: number;
  message?: string;
  at: string;
};

/** Keep browser validation aligned with the integer-EUR API contract. */
export function parseOfferAmount(value: string): number | null {
  if (!value.trim()) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 10_000_000
    ? amount
    : null;
}

export function canNegotiate(status: string): boolean {
  return status === "pending";
}

/** The offer timeline is another message surface, not a contact bypass. */
export function visiblePriceOffers(offers: PriceOffer[] | null, status: string): PriceOffer[] | null {
  if (!offers || status === "confirmed_by_client" || status === "completed") return offers;
  return offers.map((offer) => ({
    ...offer,
    ...(offer.message ? { message: bookingTextForViewer(offer.message, false) } : {}),
  }));
}
