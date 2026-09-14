export type SelectableHall = {
  id: number;
  slug: string;
  suitable: boolean;
  available: boolean | null;
};

export function hallIsEligible(hall: SelectableHall, intervalComplete: boolean): boolean {
  if (!hall.suitable) return false;
  if (!intervalComplete) return true;
  return hall.available === true;
}

/**
 * Invalid/cross-venue/inactive slugs are ignored without disclosure.
 * An explicit selection is kept even when guestCount later makes it ineligible.
 * Exactly one eligible hall may be preselected; several require a choice.
 */
export function resolveSelectedHall(opts: {
  halls: readonly SelectableHall[];
  requestedSlug?: string | null;
  intervalComplete: boolean;
}): { hallId: number | null; slug: string | null; preselected: boolean } {
  const requested = opts.requestedSlug?.trim();
  if (requested) {
    const match = opts.halls.find((hall) => hall.slug === requested);
    if (match) return { hallId: match.id, slug: match.slug, preselected: false };
  }
  const eligible = opts.halls.filter((hall) => hallIsEligible(hall, opts.intervalComplete));
  if (eligible.length === 1) {
    return { hallId: eligible[0]!.id, slug: eligible[0]!.slug, preselected: true };
  }
  return { hallId: null, slug: null, preselected: false };
}
