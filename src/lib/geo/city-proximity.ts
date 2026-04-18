// City proximity table for Moldova — approximate driving distances in km
// from each wizard city to every other significant city/town. Used by the
// Săli tab in the client dashboard to expand the plain-text city filter
// into a multi-city query when the user picked a venue search radius.
//
// Distances are approximate (rounded to the nearest 5 km) and meant to
// drive bucketed filtering (≤ 25 / ≤ 50 / ≤ 100), not precise navigation.

export type CityName =
  | "Chișinău"
  | "Bălți"
  | "Cahul"
  | "Orhei"
  | "Ungheni"
  | "Soroca"
  | "Comrat"
  | "Edineț";

/** Distances in km from each wizard city to all other towns that could
 *  host an event. Uses approximate road distances, not straight-line. */
const NEIGHBORS: Record<CityName, Array<{ city: string; km: number }>> = {
  "Chișinău": [
    { city: "Chișinău", km: 0 },
    { city: "Ialoveni", km: 15 },
    { city: "Strășeni", km: 25 },
    { city: "Anenii Noi", km: 30 },
    { city: "Hâncești", km: 35 },
    { city: "Călărași", km: 45 },
    { city: "Orhei", km: 45 },
    { city: "Telenești", km: 70 },
    { city: "Ungheni", km: 105 },
    { city: "Bălți", km: 135 },
    { city: "Cimișlia", km: 70 },
    { city: "Cahul", km: 175 },
    { city: "Comrat", km: 100 },
  ],
  "Bălți": [
    { city: "Bălți", km: 0 },
    { city: "Sângerei", km: 30 },
    { city: "Florești", km: 50 },
    { city: "Fălești", km: 35 },
    { city: "Glodeni", km: 30 },
    { city: "Edineț", km: 70 },
    { city: "Soroca", km: 70 },
    { city: "Ungheni", km: 75 },
    { city: "Rîșcani", km: 50 },
    { city: "Chișinău", km: 135 },
  ],
  "Cahul": [
    { city: "Cahul", km: 0 },
    { city: "Vulcănești", km: 40 },
    { city: "Taraclia", km: 60 },
    { city: "Leova", km: 55 },
    { city: "Comrat", km: 85 },
    { city: "Cantemir", km: 45 },
  ],
  "Orhei": [
    { city: "Orhei", km: 0 },
    { city: "Rezina", km: 40 },
    { city: "Ialoveni", km: 55 },
    { city: "Strășeni", km: 50 },
    { city: "Telenești", km: 40 },
    { city: "Chișinău", km: 45 },
    { city: "Călărași", km: 65 },
  ],
  "Ungheni": [
    { city: "Ungheni", km: 0 },
    { city: "Nisporeni", km: 30 },
    { city: "Călărași", km: 50 },
    { city: "Strășeni", km: 75 },
    { city: "Fălești", km: 45 },
    { city: "Bălți", km: 75 },
    { city: "Chișinău", km: 105 },
  ],
  "Soroca": [
    { city: "Soroca", km: 0 },
    { city: "Drochia", km: 40 },
    { city: "Florești", km: 35 },
    { city: "Edineț", km: 75 },
    { city: "Bălți", km: 70 },
  ],
  "Comrat": [
    { city: "Comrat", km: 0 },
    { city: "Ceadîr-Lunga", km: 35 },
    { city: "Taraclia", km: 40 },
    { city: "Vulcănești", km: 55 },
    { city: "Cahul", km: 85 },
    { city: "Cimișlia", km: 30 },
    { city: "Basarabeasca", km: 40 },
    { city: "Chișinău", km: 100 },
  ],
  "Edineț": [
    { city: "Edineț", km: 0 },
    { city: "Briceni", km: 35 },
    { city: "Ocnița", km: 30 },
    { city: "Dondușeni", km: 35 },
    { city: "Drochia", km: 45 },
    { city: "Soroca", km: 75 },
    { city: "Bălți", km: 70 },
  ],
};

/** Return the list of town names within `radiusKm` of the given wizard
 *  city (inclusive). The origin city is always first. If radiusKm is 0
 *  or missing, returns just the origin city. */
export function citiesWithinRadius(
  originCity: string,
  radiusKm: number | null | undefined,
): string[] {
  const key = originCity as CityName;
  const entries = NEIGHBORS[key];
  if (!entries) return originCity ? [originCity] : [];
  if (!radiusKm || radiusKm <= 0) {
    return [originCity];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const { city, km } of entries) {
    if (km > radiusKm) continue;
    if (seen.has(city)) continue;
    seen.add(city);
    result.push(city);
  }
  // Ensure the origin is always first even if it slipped somehow.
  if (!seen.has(originCity)) result.unshift(originCity);
  return result;
}

/** Preset radius buckets shown in the wizard step 4. 0 means "only my
 *  city", 999 means "no limit — all of Moldova". */
export const VENUE_RADIUS_PRESETS: Array<{ value: number; label: string }> = [
  { value: 0, label: "Doar în oraș" },
  { value: 25, label: "Până la 25 km" },
  { value: 50, label: "Până la 50 km" },
  { value: 100, label: "Până la 100 km" },
  { value: 999, label: "Toată Moldova" },
];
