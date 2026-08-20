/**
 * One place that turns (amount, currency) into a displayed price.
 *
 * Prices were formatted ad-hoc in 20+ components — most hardcoded "€" while
 * the homepage said "MDL", and `artists.price_currency` (which is EUR) was
 * ignored everywhere. So the same artist could be shown as "6000 €" in the
 * catalogue and "6000 MDL" on the homepage. The QA audit asked for a single
 * source of price; this is it.
 *
 * The currency comes from the row when it has one and falls back to the
 * platform default, so adding a MDL-priced vendor later needs no UI changes.
 */

const DEFAULT_CURRENCY = "EUR";

const SYMBOL: Record<string, string> = {
  EUR: "€",
  USD: "$",
  MDL: "MDL",
  RON: "lei",
};

/** Locale → BCP-47 tag for number grouping. */
const NUM_LOCALE: Record<string, string> = {
  ro: "ro-RO",
  ru: "ru-RU",
  en: "en-GB",
};

export function currencySymbol(currency?: string | null): string {
  const c = (currency || DEFAULT_CURRENCY).toUpperCase();
  return SYMBOL[c] ?? c;
}

/**
 * Format an amount for display. Returns null for a missing or non-positive
 * price so callers can omit the line instead of printing "0 €".
 */
export function formatPrice(
  amount: number | null | undefined,
  currency?: string | null,
  locale: string = "ro",
): string | null {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  const n = amount.toLocaleString(NUM_LOCALE[locale] ?? "ro-RO");
  const sym = currencySymbol(currency);
  // Symbols hug the number; multi-letter codes get a space.
  return sym.length === 1 ? `${n} ${sym}` : `${n} ${sym}`;
}

/** "de la X €" — the catalogue's from-price phrasing. */
export function formatFromPrice(
  amount: number | null | undefined,
  currency: string | null | undefined,
  locale: string,
  fromWord: string,
): string | null {
  const p = formatPrice(amount, currency, locale);
  return p ? `${fromWord} ${p}` : null;
}
