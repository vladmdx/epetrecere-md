import { tierDurationMinutes, tierMode, type PricingTier } from "@/lib/pricing/resolve";

/** Onboarding deliberately stores per-event prices without a duration. Keep
 * those rows: only hourly prices require a duration to be selectable. */
export function plannerBookingTiers(tiers: PricingTier[]): PricingTier[] {
  return tiers.filter(tier => tier != null && typeof tier.price === "number" &&
    Number.isFinite(tier.price) && tier.price >= 0 && tier.isVisible !== false &&
    (tierMode(tier) === "per_event" || tierDurationMinutes(tier) != null));
}

/** Copy must distinguish unavailable duration rates from a flat event price. */
export function plannerDurationHint({ loading, durationCount, eventOfferCount, eventSelected }: {
  loading: boolean;
  durationCount: number;
  eventOfferCount: number;
  eventSelected: boolean;
}) {
  if (loading) return "cabinet.plan.modal.loadingPackages";
  if (eventSelected || (eventOfferCount > 0 && durationCount === 0)) return "cabinet.plan.modal.perEventDurationHint";
  if (durationCount > 0) return "cabinet.plan.modal.durationHint";
  return "cabinet.plan.modal.noTariffs";
}
