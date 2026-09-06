// City proximity table for Moldova — approximate driving distances in km
// from each wizard city to every other significant city/town. Used by the
// Săli tab in the client dashboard to expand the plain-text city filter
// into a multi-city query when the user picked a venue search radius.
//
// Distances are approximate (rounded to the nearest 5 km) and meant to
// drive bucketed filtering (≤ 25 / ≤ 50 / ≤ 100), not precise navigation.

import { canonicalMoldovaCity } from "@/lib/moldova-cities";

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

// The same declared road distance applies in either direction. Build a small
// graph once so a partner based in Ialoveni or Glodeni has the same coverage
// as one based in a main wizard city. No request-time geocoding is needed.
const ROAD_GRAPH = new Map<string, Map<string, number>>();
for (const [origin, destinations] of Object.entries(NEIGHBORS)) {
  for (const { city, km } of destinations) {
    const from = canonicalMoldovaCity(origin) ?? origin;
    const to = canonicalMoldovaCity(city) ?? city;
    if (!ROAD_GRAPH.has(from)) ROAD_GRAPH.set(from, new Map());
    if (!ROAD_GRAPH.has(to)) ROAD_GRAPH.set(to, new Map());
    const knownDistance = ROAD_GRAPH.get(from)!.get(to) ?? Infinity;
    const distance = Math.min(knownDistance, km);
    ROAD_GRAPH.get(from)!.set(to, distance);
    ROAD_GRAPH.get(to)!.set(from, distance);
  }
}

/** Approximate road distances through the existing locality table. Unknown
 * routes are omitted, never treated as zero km. These are search estimates,
 * not a source for navigation or automatic per-kilometre billing. */
export function cityTravelDistances(originCity: string): Array<{ city: string; km: number }> {
  const origin = canonicalMoldovaCity(originCity) ?? originCity.trim();
  if (!origin) return [];
  const distances = new Map<string, number>([[origin, 0]]);
  const visited = new Set<string>();
  while (true) {
    let nearest: string | undefined;
    let nearestDistance = Infinity;
    for (const [city, km] of distances) {
      if (!visited.has(city) && km < nearestDistance) {
        nearest = city;
        nearestDistance = km;
      }
    }
    if (!nearest) break;
    visited.add(nearest);
    for (const [destination, roadKm] of ROAD_GRAPH.get(nearest) ?? []) {
      const distance = nearestDistance + roadKm;
      if (distance < (distances.get(destination) ?? Infinity)) {
        distances.set(destination, distance);
      }
    }
  }
  return Array.from(distances, ([city, km]) => ({ city, km }))
    .sort((a, b) => a.km - b.km || a.city.localeCompare(b.city));
}

/** Return the list of town names within `radiusKm` of the given wizard
 *  city (inclusive). The origin city is always first. If radiusKm is 0
 *  or missing, returns just the origin city. */
export function citiesWithinRadius(
  originCity: string,
  radiusKm: number | null | undefined,
): string[] {
  const radius = radiusKm && radiusKm > 0 ? radiusKm : 0;
  return cityTravelDistances(originCity)
    .filter(({ km }) => km <= radius)
    .map(({ city }) => city);
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
