/**
 * Approximate centres for Moldovan localities.
 *
 * Venues carry optional lat/lng, but most rows have none yet. Rather than
 * hiding them from the map entirely, we fall back to their city centre and
 * label the pin as approximate — a venue you can find in the right town beats
 * a venue you cannot find at all. Precise pins take over the moment a vendor
 * sets their location in the dashboard.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Keys are lowercase, diacritics stripped. */
const CITY_COORDS: Record<string, LatLng> = {
  chisinau: { lat: 47.0105, lng: 28.8638 },
  balti: { lat: 47.7615, lng: 27.9292 },
  tiraspol: { lat: 46.8403, lng: 29.6433 },
  bender: { lat: 46.8228, lng: 29.4739 },
  cahul: { lat: 45.9075, lng: 28.1944 },
  ungheni: { lat: 47.2044, lng: 27.8003 },
  soroca: { lat: 48.1553, lng: 28.2828 },
  orhei: { lat: 47.3831, lng: 28.8231 },
  comrat: { lat: 46.2963, lng: 28.6564 },
  causeni: { lat: 46.6383, lng: 29.4092 },
  straseni: { lat: 47.1414, lng: 28.6106 },
  hincesti: { lat: 46.8281, lng: 28.5906 },
  edinet: { lat: 48.1681, lng: 27.3061 },
  ceadir_lunga: { lat: 46.0592, lng: 28.8317 },
  drochia: { lat: 48.0333, lng: 27.8 },
  ialoveni: { lat: 46.9375, lng: 28.7783 },
  anenii_noi: { lat: 46.8794, lng: 29.2314 },
  floresti: { lat: 47.8931, lng: 28.2947 },
  criuleni: { lat: 47.2131, lng: 29.1567 },
  bulboaca: { lat: 46.8667, lng: 29.35 },
  vadul_lui_voda: { lat: 47.0833, lng: 29.0833 },
  cricova: { lat: 47.1333, lng: 28.8667 },
  durlesti: { lat: 47.0167, lng: 28.7833 },
  codru: { lat: 46.9833, lng: 28.8167 },
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/^(mun\.?|or\.?|s\.?|com\.?)\s+/, "") // drop admin prefixes
    .replace(/[^a-z]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function cityCoords(city: string | null | undefined): LatLng | null {
  if (!city) return null;
  const key = normalize(city);
  if (CITY_COORDS[key]) return CITY_COORDS[key];
  // Partial match — "Chisinau, sect. Botanica" etc.
  for (const [k, v] of Object.entries(CITY_COORDS)) {
    if (key.startsWith(k) || key.includes(k)) return v;
  }
  return null;
}

/**
 * Deterministic small offset so several venues sharing a city centre don't
 * stack into one unclickable pin. Same id always yields the same spot, so pins
 * don't jump between renders.
 */
export function scatter(base: LatLng, id: number): LatLng {
  const golden = 2.399963; // radians, spreads points evenly
  const angle = id * golden;
  const radius = 0.004 + ((id % 7) * 0.0016); // ~0.4–1.5 km
  return {
    lat: base.lat + radius * Math.cos(angle),
    lng: base.lng + radius * Math.sin(angle) * 1.5, // lng degrees are shorter here
  };
}

/** Resolve a venue's map position: exact if known, otherwise scattered city centre. */
export function resolveVenuePosition(v: {
  id: number;
  lat?: number | null;
  lng?: number | null;
  city?: string | null;
}): { pos: LatLng; approximate: boolean } | null {
  if (typeof v.lat === "number" && typeof v.lng === "number") {
    return { pos: { lat: v.lat, lng: v.lng }, approximate: false };
  }
  const c = cityCoords(v.city);
  if (!c) return null;
  return { pos: scatter(c, v.id), approximate: true };
}
