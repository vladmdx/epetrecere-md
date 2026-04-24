// Multi-currency display helper.
//
// The platform stores all prices in EUR (historical reasons). For MD users
// it's much more intuitive to see prices in MDL too. We keep EUR as the
// source-of-truth and compute MDL on the fly using a rate that lives in
// an env var so it can be updated without a deploy — or fallback to a
// sane default (~19.5 MDL/EUR as of late 2025).
//
// If/when we want live rates, swap `DEFAULT_RATE` for a daily Inngest cron
// that hits an exchange API and writes to a `settings` row.

export const EUR_TO_MDL_RATE = (() => {
  const env = process.env.NEXT_PUBLIC_EUR_MDL_RATE;
  const parsed = env ? Number(env) : NaN;
  if (Number.isFinite(parsed) && parsed > 1) return parsed;
  return 19.5; // safe fallback
})();

export type Currency = "EUR" | "MDL";

/** Format a single currency amount — used when the user explicitly picks
 *  one currency. Rounds MDL to nearest 10 for readability. */
export function formatPrice(amount: number, currency: Currency = "EUR"): string {
  if (!Number.isFinite(amount)) return "—";
  if (currency === "MDL") {
    const mdl = amount * EUR_TO_MDL_RATE;
    const rounded = Math.round(mdl / 10) * 10;
    return `${rounded.toLocaleString("ro-MD")} MDL`;
  }
  return `${Math.round(amount).toLocaleString("ro-RO")} €`;
}

/** Dual display: "190€ (~3.700 MDL)". Intended for public pricing UI
 *  so users immediately see both. */
export function formatDualPrice(eurAmount: number | null | undefined): string {
  if (!eurAmount || !Number.isFinite(eurAmount)) return "—";
  return `${formatPrice(eurAmount, "EUR")} · ${formatPrice(eurAmount, "MDL")}`;
}
