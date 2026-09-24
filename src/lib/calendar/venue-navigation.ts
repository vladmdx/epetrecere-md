/** Keep hall scope when changing the visible calendar date or month. */
export function venueCalendarNavigationPath(
  basePath: string,
  filter: { month: string } | { date: string },
  hallId: number | null,
): string {
  const query = new URLSearchParams(filter);
  if (hallId != null) query.set("hallId", String(hallId));
  return `${basePath}?${query.toString()}`;
}
