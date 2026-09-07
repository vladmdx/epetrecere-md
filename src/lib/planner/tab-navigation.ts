const PLAN_TABS = [
  "overview", "bookings", "my-bookings", "venues", "checklist", "budget",
  "guests", "seating", "timeline", "photos", "settings",
] as const;

export type PlanTabKey = typeof PLAN_TABS[number];

export function planTabFromQuery(value: string | null | undefined): PlanTabKey {
  return PLAN_TABS.includes(value as PlanTabKey) ? value as PlanTabKey : "overview";
}

/** Keep unrelated query parameters while navigating within the same plan. */
export function planTabHref(planId: number, tab: PlanTabKey, query = ""): string {
  const params = new URLSearchParams(query);
  params.set("tab", tab);
  return `/cabinet/planifica/${planId}?${params.toString()}`;
}
