/**
 * Commission rules — how much a vendor owes the platform for a confirmed
 * booking.
 *
 * Legal basis (EPETRECERE Legal Pack v1.0):
 *   - Artists/Partners: flat 5% of the confirmed order value.
 *     Partner Agreement §11.1, Tariffs §2 + §3 (base = full order value
 *     including add-ons).
 *   - Venues: Tariffs §4 and Venue Agreement §13.2 say the venue fee is
 *     "approved separately" per event type — the legal pack deliberately
 *     leaves the numbers blank. So venue rates are NOT hardcoded: they live in
 *     site_settings.commission_rules and an admin edits them. The shape below
 *     supports the agreed model (one rate up to a guest threshold, another
 *     above it) as either a percentage or a flat fee.
 *
 * Money is stored as whole currency units (EUR), matching the existing
 * `agreed_price` / `price_from` columns. Rates are basis points (500 = 5%) so
 * we never do float math on money.
 */

export const DEFAULT_ARTIST_RATE_BPS = 500; // 5% — fixed by the Partner Agreement
export const DEFAULT_VENUE_GUEST_THRESHOLD = 80;

export interface VenueTier {
  /** Percentage rate in basis points. Null when a flat fee is used instead. */
  rateBps: number | null;
  /** Flat fee per booking, in `currency`. Null when a percentage is used. */
  fixedAmount: number | null;
}

export interface CommissionRules {
  artist: { rateBps: number };
  venue: {
    /** Guest count at which the tier switches. `below` applies to < threshold. */
    guestThreshold: number;
    below: VenueTier;
    /** Applies at exactly the threshold and above. */
    atOrAbove: VenueTier;
  };
  currency: string;
}

/**
 * Shipped defaults. The artist rate is legally fixed; the venue tiers are
 * intentionally EMPTY until an admin fills them in, so we never invent a fee
 * and charge a venue for it. `computeCommission` returns null for venues while
 * they are unset.
 */
export const DEFAULT_RULES: CommissionRules = {
  artist: { rateBps: DEFAULT_ARTIST_RATE_BPS },
  venue: {
    guestThreshold: DEFAULT_VENUE_GUEST_THRESHOLD,
    below: { rateBps: null, fixedAmount: null },
    atOrAbove: { rateBps: null, fixedAmount: null },
  },
  currency: "EUR",
};

/** site_settings key holding a partial CommissionRules override. */
export const COMMISSION_RULES_KEY = "commission_rules";

/** Merge a stored (possibly partial / hand-edited) value over the defaults. */
export function normalizeRules(stored: unknown): CommissionRules {
  const r = (stored ?? {}) as Partial<CommissionRules>;
  const venue = (r.venue ?? {}) as Partial<CommissionRules["venue"]>;
  const tier = (t: Partial<VenueTier> | undefined): VenueTier => ({
    rateBps: numOrNull(t?.rateBps),
    fixedAmount: numOrNull(t?.fixedAmount),
  });
  return {
    artist: {
      rateBps: numOrNull(r.artist?.rateBps) ?? DEFAULT_ARTIST_RATE_BPS,
    },
    venue: {
      guestThreshold:
        numOrNull(venue.guestThreshold) ?? DEFAULT_VENUE_GUEST_THRESHOLD,
      below: tier(venue.below),
      atOrAbove: tier(venue.atOrAbove),
    },
    currency: typeof r.currency === "string" && r.currency ? r.currency : "EUR",
  };
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export interface CommissionInput {
  vendorType: "artist" | "venue";
  /** Confirmed order value. */
  baseAmount: number;
  /** Needed to pick the venue tier; ignored for artists. */
  guestCount?: number | null;
}

export interface CommissionResult {
  amount: number;
  rateBps: number | null;
  tier: "artist_flat" | "venue_below" | "venue_at_or_above";
  currency: string;
}

/**
 * Compute what a vendor owes. Returns null when the fee cannot be determined
 * — an unset venue tier, or a non-positive order value — so callers skip
 * creating a bogus row rather than charging zero.
 */
export function computeCommission(
  input: CommissionInput,
  rules: CommissionRules,
): CommissionResult | null {
  const base = Math.round(input.baseAmount);
  if (!Number.isFinite(base) || base <= 0) return null;

  if (input.vendorType === "artist") {
    const rateBps = rules.artist.rateBps;
    return {
      amount: bps(base, rateBps),
      rateBps,
      tier: "artist_flat",
      currency: rules.currency,
    };
  }

  // Venue: pick the tier by guest count. Unknown guest count is treated as
  // below the threshold (the cheaper/safer assumption for the venue).
  const guests = input.guestCount ?? 0;
  const atOrAbove = guests >= rules.venue.guestThreshold;
  const tierCfg = atOrAbove ? rules.venue.atOrAbove : rules.venue.below;

  if (tierCfg.fixedAmount != null && tierCfg.fixedAmount > 0) {
    return {
      amount: Math.round(tierCfg.fixedAmount),
      rateBps: null,
      tier: atOrAbove ? "venue_at_or_above" : "venue_below",
      currency: rules.currency,
    };
  }
  if (tierCfg.rateBps != null && tierCfg.rateBps > 0) {
    return {
      amount: bps(base, tierCfg.rateBps),
      rateBps: tierCfg.rateBps,
      tier: atOrAbove ? "venue_at_or_above" : "venue_below",
      currency: rules.currency,
    };
  }
  // Tier not configured yet — do not invent a fee.
  return null;
}

function bps(base: number, rateBps: number): number {
  return Math.round((base * rateBps) / 10_000);
}

/** Human label for a rate, e.g. 500 → "5%". */
export function formatRate(rateBps: number | null): string {
  if (rateBps == null) return "—";
  const pct = rateBps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`;
}
