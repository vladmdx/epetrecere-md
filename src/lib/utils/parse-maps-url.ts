// Best-effort parser for Google Maps URLs. Handles the most common formats
// users paste from the Google Maps app/website:
//
//   https://www.google.com/maps/place/Restaurant+Name/@47.0234,28.8353,17z/data=...
//   https://maps.google.com/?q=47.0234,28.8353
//   https://www.google.com/maps?q=Numele+Restaurantului
//   https://www.google.com/maps/@47.0234,28.8353,15z
//
// For maps.app.goo.gl short links the URL is opaque — we need to follow the
// redirect server-side. That happens in /api/maps/expand which calls back
// into this parser with the resolved long URL.
//
// We deliberately do NOT call the Google Maps API here — it costs money per
// request and the basic info we need (lat/lng + the human-readable place
// name) is already encoded in the URL.

export interface ParsedMapsUrl {
  lat?: number;
  lng?: number;
  /** Place name decoded from the /place/{name} segment, if present. */
  placeName?: string;
}

/** Parse a Google Maps URL into lat/lng + best-effort name. */
export function parseGoogleMapsUrl(input: string): ParsedMapsUrl | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (!/google\.[a-z.]+|goo\.gl/.test(url.hostname)) return null;

  const out: ParsedMapsUrl = {};

  // Pattern 1: /maps/place/{Name}/@lat,lng[,zoom]
  // The `@` segment carries the canonical lat,lng for the centered view.
  const atMatch = url.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) {
    out.lat = Number(atMatch[1]);
    out.lng = Number(atMatch[2]);
  }

  // Pattern 2: ?q=lat,lng
  const q = url.searchParams.get("q");
  if (q && !out.lat) {
    const qMatch = q.match(/^(-?\d+\.\d+),\s*(-?\d+\.\d+)$/);
    if (qMatch) {
      out.lat = Number(qMatch[1]);
      out.lng = Number(qMatch[2]);
    }
  }

  // Pattern 3: !3d{lat}!4d{lng} inside the data= blob (place details)
  const dataMatch = url.pathname.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (dataMatch && !out.lat) {
    out.lat = Number(dataMatch[1]);
    out.lng = Number(dataMatch[2]);
  }

  // Place name from /place/{Name}/...
  const placeMatch = url.pathname.match(/\/maps\/place\/([^/]+)/);
  if (placeMatch) {
    try {
      out.placeName = decodeURIComponent(placeMatch[1]).replace(/\+/g, " ");
    } catch {
      // Leave undefined if URL-decoding fails on garbage input.
    }
  } else if (q && !out.lat) {
    // For ?q=Name searches without coordinates.
    try {
      out.placeName = decodeURIComponent(q).replace(/\+/g, " ");
    } catch {
      /* ignore */
    }
  }

  if (out.lat === undefined && !out.placeName) return null;
  return out;
}

/** Whether a URL needs server-side expansion (short link). */
export function isMapsShortLink(input: string): boolean {
  try {
    const u = new URL(input.trim());
    return /^(maps\.app\.goo\.gl|goo\.gl)$/.test(u.hostname);
  } catch {
    return false;
  }
}
