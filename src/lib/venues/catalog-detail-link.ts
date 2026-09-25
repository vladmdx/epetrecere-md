/** Keep the applied hall constraints when opening a venue from any catalog view. */
export function venueCatalogDetailHref(
  slug: string,
  searchParams: { get(name: string): string | null },
): string {
  const params = new URLSearchParams();
  // Match the catalog page's alias precedence. Do not forward list-only filters,
  // tracking parameters or a stale hall selection from a different venue.
  const context = {
    guest_count: searchParams.get("guest_count") ?? searchParams.get("capacity_min"),
    date: searchParams.get("date"),
    start: searchParams.get("start") ?? searchParams.get("start_time"),
    end: searchParams.get("end") ?? searchParams.get("end_time"),
  };
  for (const [key, value] of Object.entries(context)) {
    // Validation stays on the destination page: never turn malformed constraints
    // into an unfiltered result by silently discarding them here.
    if (value !== null && value !== "") params.set(key, value);
  }
  const query = params.toString();
  const path = `/sali/${encodeURIComponent(slug)}`;
  return query ? `${path}?${query}` : path;
}
