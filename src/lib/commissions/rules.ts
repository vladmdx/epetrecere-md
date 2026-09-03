/**
 * Versioned marketplace tariffs: artists pay 5% of the confirmed value;
 * venues pay the event-specific fixed fees in the agreement.
 * Base prices are whole EUR; percentage fees retain cents.
 */

export const DEFAULT_ARTIST_RATE_BPS = 500; // 5% — fixed by the Partner Agreement
export const DEFAULT_VENUE_GUEST_THRESHOLD = 80;

export interface VenueTier {
  /** Percentage rate in basis points. Null when a flat fee is used instead. */
  rateBps: number | null;
  /** Flat fee per booking, in `currency`. Null when a percentage is used. */
  fixedAmount: number | null;
}

/**
 * One band of a venue's fee schedule. `maxGuests` is an INCLUSIVE upper
 * bound, matching how the signed agreement words them — "până la 80
 * invitați" means 80 pays the lower fee. The old single-threshold code split
 * on `guests >= threshold`, so a booking with exactly 80 guests was billed
 * the upper rate, against the contract.
 *
 * `maxGuests: null` is the open-ended top band.
 */
export interface VenueBand {
  maxGuests: number | null;
  fixedAmount: number;
}

export interface CommissionRules {
  artist: { rateBps: number };
  /**
   * Fixed venue fees per event type, from §11.3 of the partner agreement.
   * Keyed by the platform's own event-type keys; an event type with no
   * schedule falls through to `venue` below.
   */
  venueSchedules: Record<string, VenueBand[]>;
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
 * §11.3 of the agreement, as data. Ordered by band, lowest first.
 *
 * The additional planner categories use the corresponding published bands.
 * Since the owner-approved revision of 2026-09-04, other events cost 50 EUR
 * regardless of guest count, including more than 30 guests.
 */
export const VENUE_SCHEDULES_FROM_AGREEMENT: Record<string, VenueBand[]> = {
  // Nuntă — orice dimensiune
  wedding: [{ maxGuests: null, fixedAmount: 200 }],
  // Cumătrie
  cumatrie: [
    { maxGuests: 80, fixedAmount: 100 },
    { maxGuests: null, fixedAmount: 150 },
  ],
  baptism: [
    { maxGuests: 80, fixedAmount: 100 },
    { maxGuests: null, fixedAmount: 150 },
  ],
  // Zi de naștere / jubileu
  birthday: [
    { maxGuests: 40, fixedAmount: 50 },
    { maxGuests: 80, fixedAmount: 80 },
    { maxGuests: null, fixedAmount: 100 },
  ],
  kids_birthday: [
    { maxGuests: 40, fixedAmount: 50 },
    { maxGuests: 80, fixedAmount: 80 },
    { maxGuests: null, fixedAmount: 100 },
  ],
  // Corporativ
  corporate: [
    { maxGuests: 80, fixedAmount: 100 },
    { maxGuests: 150, fixedAmount: 150 },
    { maxGuests: null, fixedAmount: 200 },
  ],
  // Owner-approved 2026-09-04: 50 EUR for all guest counts, including above 30.
  other: [{ maxGuests: null, fixedAmount: 50 }],
  proposal: [{ maxGuests: null, fixedAmount: 50 }],
  cununie: [{ maxGuests: null, fixedAmount: 50 }],
  concert: [{ maxGuests: null, fixedAmount: 50 }],
};

export const DEFAULT_RULES: CommissionRules = {
  artist: { rateBps: DEFAULT_ARTIST_RATE_BPS },
  venueSchedules: VENUE_SCHEDULES_FROM_AGREEMENT,
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
  // Schedules come from the agreement unless an admin has stored their own.
  // A stored value replaces the whole map rather than merging per key: a
  // half-overridden fee table is harder to reason about than either one.
  const storedSchedules = r.venueSchedules;
  const venueSchedules =
    storedSchedules &&
    typeof storedSchedules === "object" &&
    Object.keys(storedSchedules).length
      ? (storedSchedules as Record<string, VenueBand[]>)
      : VENUE_SCHEDULES_FROM_AGREEMENT;

  return {
    artist: {
      rateBps: numOrNull(r.artist?.rateBps) ?? DEFAULT_ARTIST_RATE_BPS,
    },
    venueSchedules,
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
  /**
   * Which schedule applies. The agreement prices a venue by event type as
   * well as by size, so without this the fee cannot be determined at all.
   */
  eventType?: string | null;
}

export interface CommissionResult {
  amount: number;
  rateBps: number | null;
  /** `venue_band:<eventType>:<index>` for a scheduled fee. */
  tier: string;
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
  const raw = Math.round(input.baseAmount);
  const base = Number.isFinite(raw) && raw > 0 ? raw : 0;

  if (input.vendorType === "artist") {
    // A percentage of nothing is nothing — skip rather than book a 0 fee.
    if (base <= 0) return null;
    const rateBps = rules.artist.rateBps;
    return {
      amount: bps(base, rateBps),
      rateBps,
      tier: "artist_flat",
      currency: rules.currency,
    };
  }

  // Venue: the agreement prices by event type first, then by size.
  const schedule = input.eventType
    ? rules.venueSchedules?.[input.eventType]
    : undefined;
  if (schedule?.length) {
    // Bands are ordered lowest first and their upper bounds are INCLUSIVE.
    // Missing guest counts require clarification, not an assumed lower fee.
    const unboundedFlat = schedule.length === 1 && schedule[0].maxGuests === null;
    if (!unboundedFlat && (!Number.isInteger(input.guestCount) || (input.guestCount ?? 0) <= 0)) return null;
    const guests = input.guestCount ?? 0;
    const idx = schedule.findIndex(
      (b) => b.maxGuests == null || guests <= b.maxGuests,
    );
    // No band covers this size — the agreement prescribes nothing above the
    // last bound for this event type, so nothing is owed. Charging an
    // invented figure would be worse than charging none.
    if (idx === -1) return null;
    const band = schedule[idx]!;
    if (!(band.fixedAmount > 0)) return null;
    return {
      amount: Math.round(band.fixedAmount),
      rateBps: null,
      tier: `venue_band:${input.eventType}:${idx}`,
      currency: rules.currency,
    };
  }

  // Legacy single-threshold path, kept for a stored override that predates
  // the per-event schedules.
  if (!Number.isInteger(input.guestCount) || (input.guestCount ?? 0) <= 0) return null;
  const guests = input.guestCount!;
  const atOrAbove = guests >= rules.venue.guestThreshold;
  const tierCfg = atOrAbove ? rules.venue.atOrAbove : rules.venue.below;

  // A flat venue fee is owed per confirmed event, decided by the guest count
  // alone — it does not depend on what the venue charged, so it applies even
  // when no price was recorded on the booking.
  if (tierCfg.fixedAmount != null && tierCfg.fixedAmount > 0) {
    return {
      amount: Math.round(tierCfg.fixedAmount),
      rateBps: null,
      tier: atOrAbove ? "venue_at_or_above" : "venue_below",
      currency: rules.currency,
    };
  }
  // A percentage tier still needs an order value to apply to.
  if (base <= 0) return null;
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
  return Math.round((base * rateBps) / 100) / 100;
}

/** Human label for a rate, e.g. 500 → "5%". */
export function formatRate(rateBps: number | null): string {
  if (rateBps == null) return "—";
  const pct = rateBps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`;
}
