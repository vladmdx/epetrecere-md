// Shared price resolver for artist_packages with scope overrides.
//
// The artist defines a set of pricing tiers, each attached to a "scope":
//   base          → default
//   weekend       → Sat + Sun
//   weekday       → Mon–Fri
//   evening       → any day when startTime >= scopeFromTime
//   specific_day  → only on a given dayOfWeek (0=Sun … 6=Sat)
//
// When a client picks eventDate + startTime + duration, the system picks the
// price with the highest priority whose scope matches the context, falling
// back to the base price for that duration.

export type PricingScope =
  | "base"
  | "weekend"
  | "weekday"
  | "evening"
  | "specific_day";

export interface PricingTier {
  id: number;
  durationHours: number | null;
  durationMinutes: number | null;
  price: number | null;
  scope: PricingScope | string;
  scopeDayOfWeek: number | null;
  scopeFromTime: string | null;
  nameRo?: string | null;
  isVisible?: boolean;
}

/** Convert a tier row to a normalized duration in minutes. Returns null when
 *  the tier has no duration info (e.g. a legacy name-only package). */
export function tierDurationMinutes(tier: PricingTier): number | null {
  const h = tier.durationHours ?? 0;
  const m = tier.durationMinutes ?? 0;
  const total = Math.round(h * 60) + m;
  return total > 0 ? total : null;
}

/** Display label for a duration in minutes: `2h 30m`, `45 min`, `3h`. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

interface Context {
  /** Event date as YYYY-MM-DD. */
  eventDate: string | null | undefined;
  /** Start time as HH:MM. */
  startTime: string | null | undefined;
}

/** Higher number = wins. */
function scopePriority(scope: string): number {
  switch (scope) {
    case "specific_day":
      return 4;
    case "evening":
      return 3;
    case "weekend":
    case "weekday":
      return 2;
    default:
      return 1; // base + anything unknown
  }
}

function dayOfWeek(iso: string): number | null {
  const d = new Date(iso + "T12:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return d.getDay(); // 0 = Sun, 6 = Sat
}

function compareTime(a: string, b: string): number {
  // "HH:MM" lexicographic comparison works with zero-padding.
  return a.localeCompare(b);
}

/** Whether a tier's scope matches the given event context. */
export function scopeMatches(
  tier: PricingTier,
  ctx: Context,
): boolean {
  const scope = (tier.scope || "base") as PricingScope;
  if (scope === "base") return true;

  const dow = ctx.eventDate ? dayOfWeek(ctx.eventDate) : null;

  if (scope === "weekend") {
    if (dow == null) return false;
    return dow === 0 || dow === 6;
  }
  if (scope === "weekday") {
    if (dow == null) return false;
    return dow >= 1 && dow <= 5;
  }
  if (scope === "specific_day") {
    if (dow == null || tier.scopeDayOfWeek == null) return false;
    return dow === tier.scopeDayOfWeek;
  }
  if (scope === "evening") {
    if (!ctx.startTime || !tier.scopeFromTime) return false;
    return compareTime(ctx.startTime, tier.scopeFromTime) >= 0;
  }
  return false;
}

/**
 * Resolve the price for a given duration (in minutes) at the given context.
 * Picks the tier with the highest scope priority that matches; falls back to
 * the base tier for that duration. Returns null when no tier exists.
 */
export function resolvePriceForDuration(
  tiers: PricingTier[],
  durationMinutes: number,
  ctx: Context,
): { price: number; tier: PricingTier } | null {
  const candidates = tiers.filter(
    (t) =>
      t.price != null &&
      tierDurationMinutes(t) === durationMinutes &&
      scopeMatches(t, ctx),
  );
  if (candidates.length === 0) return null;
  candidates.sort(
    (a, b) =>
      scopePriority(b.scope || "base") - scopePriority(a.scope || "base"),
  );
  const winner = candidates[0];
  return { price: winner.price!, tier: winner };
}

/**
 * Minimum applicable price across ALL durations in the given context.
 * Used for the "de la X€" label on cards. When ctx has no eventDate, we
 * widen to the absolute min across base + every scope (artist's floor).
 */
export function minApplicablePrice(
  tiers: PricingTier[],
  ctx: Context = { eventDate: null, startTime: null },
): number | null {
  let min: number | null = null;
  // Group tiers by duration then resolve each group.
  const byDuration = new Map<number, PricingTier[]>();
  for (const t of tiers) {
    const d = tierDurationMinutes(t);
    if (d == null || t.price == null) continue;
    const arr = byDuration.get(d) ?? [];
    arr.push(t);
    byDuration.set(d, arr);
  }
  for (const [, group] of byDuration) {
    if (ctx.eventDate) {
      const resolved = resolvePriceForDuration(group, tierDurationMinutes(group[0])!, ctx);
      if (resolved && (min == null || resolved.price < min)) min = resolved.price;
    } else {
      // No context — take the group's minimum directly
      for (const t of group) {
        if (t.price != null && (min == null || t.price < min)) min = t.price;
      }
    }
  }
  return min;
}
