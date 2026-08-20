/**
 * One place that turns an amount into a displayed price.
 *
 * Prices used to be formatted ad-hoc in 20+ components — most hardcoded "€"
 * while the homepage said "MDL", some printed the raw ISO code ("1200 EUR"),
 * and a few concatenated with no space at all ("1200EUR"). The same artist
 * could be shown three different ways on three pages.
 *
 * The platform trades in EUR and only in EUR: the owner's rule is that no
 * screen may show lei where another shows euro. So the currency argument is
 * accepted (call sites pass the DB column) but anything that is not a
 * currency we actually support renders as euro rather than leaking a stray
 * code into the UI. If a second currency is ever really sold, add it to
 * SYMBOL — that is the one place that decides.
 */

const DEFAULT_CURRENCY = "EUR";

/** Currencies the platform actually prices in. */
const SYMBOL: Record<string, string> = {
  EUR: "€",
};

/** Locale → BCP-47 tag for number grouping. */
const NUM_LOCALE: Record<string, string> = {
  ro: "ro-RO",
  ru: "ru-RU",
  en: "en-GB",
};

export function currencySymbol(currency?: string | null): string {
  const c = (currency || DEFAULT_CURRENCY).toUpperCase();
  return SYMBOL[c] ?? SYMBOL[DEFAULT_CURRENCY]!;
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
  return `${n} ${currencySymbol(currency)}`;
}

/**
 * Same, but keeps a zero. Use for ledgers and totals, where "0 €" is a real
 * answer and hiding the line would be wrong.
 */
export function formatAmount(
  amount: number | null | undefined,
  currency?: string | null,
  locale: string = "ro",
): string {
  const n = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
  return `${n.toLocaleString(NUM_LOCALE[locale] ?? "ro-RO")} ${currencySymbol(currency)}`;
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
