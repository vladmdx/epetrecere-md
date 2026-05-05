import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { rateLimit } from "@/lib/rate-limit";
import { parseGoogleMapsUrl, isMapsShortLink } from "@/lib/utils/parse-maps-url";

// Expand a Google Maps short link (maps.app.goo.gl/...) and parse the
// resolved long URL into lat/lng + place name. Falls back to OpenStreetMap
// Nominatim for reverse-geocoding when we have coordinates but no address
// string yet — Nominatim is free and doesn't require an API key for the
// volume we'd see here.
//
// When GOOGLE_PLACES_API_KEY is set, we additionally hit the Places API for
// the rich fields (phone / website / description / opening hours). Without
// the key the response degrades to the lat+address+name we can derive on
// our own, and the client can still AI-draft a description from those.
//
// Auth-gated to prevent random users from spinning a free proxy. Rate-
// limited per IP because Nominatim has a 1 req/sec etiquette policy.

interface ExpandedMaps {
  lat?: number;
  lng?: number;
  placeName?: string;
  city?: string;
  address?: string;
  phone?: string;
  website?: string;
  /** Plain-text editorial summary from Places, if available. */
  summary?: string;
  /** First couple of categories Google assigns the place ("restaurant",
   *  "wedding venue"). Useful as facility hints in the venue form. */
  categories?: string[];
  /** Star rating (0-5) and review count, when available. */
  rating?: number;
  ratingCount?: number;
  /** Cover photo URL (hot-linked from the Places photo CDN). */
  photoUrl?: string;
}

async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<{ city?: string; address?: string }> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ro`;
    const res = await fetch(url, {
      headers: { "User-Agent": "ePetrecere.md/1.0 (contact@epetrecere.md)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return {};
    const data = await res.json();
    const addr = data.address ?? {};
    const street = [addr.road, addr.house_number].filter(Boolean).join(" ");
    return {
      address: street || data.display_name?.split(",")[0],
      city: addr.city || addr.town || addr.village || addr.municipality || addr.county,
    };
  } catch {
    return {};
  }
}

/** Pull the rich profile from Google Places API. Requires
 *  GOOGLE_PLACES_API_KEY. Returns nothing on miss — the caller falls back
 *  to OpenStreetMap. */
async function placesEnrich(
  args: { placeId?: string; placeName?: string; lat?: number; lng?: number },
): Promise<Partial<ExpandedMaps>> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return {};

  // Resolve to a Place id we can pass to Place Details. Order:
  //   1. Direct ChIJ... id from the URL.
  //   2. Search by name + lat/lng (when present).
  //   3. Search by lat/lng nearest place.
  let placeId: string | undefined;
  if (args.placeId && args.placeId.startsWith("ChIJ")) {
    placeId = args.placeId;
  } else if (args.placeName) {
    try {
      const findUrl = new URL(
        "https://maps.googleapis.com/maps/api/place/findplacefromtext/json",
      );
      findUrl.searchParams.set("input", args.placeName);
      findUrl.searchParams.set("inputtype", "textquery");
      findUrl.searchParams.set("fields", "place_id");
      if (args.lat !== undefined && args.lng !== undefined) {
        findUrl.searchParams.set(
          "locationbias",
          `point:${args.lat},${args.lng}`,
        );
      }
      findUrl.searchParams.set("key", apiKey);
      const r = await fetch(findUrl.toString(), {
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok) {
        const j = await r.json();
        placeId = j.candidates?.[0]?.place_id;
      }
    } catch {
      /* fall through */
    }
  }
  if (!placeId) return {};

  try {
    const detailsUrl = new URL(
      "https://maps.googleapis.com/maps/api/place/details/json",
    );
    detailsUrl.searchParams.set("place_id", placeId);
    detailsUrl.searchParams.set(
      "fields",
      [
        "name",
        "formatted_address",
        "international_phone_number",
        "website",
        "editorial_summary",
        "types",
        "rating",
        "user_ratings_total",
        "photos",
        "address_components",
      ].join(","),
    );
    detailsUrl.searchParams.set("language", "ro");
    detailsUrl.searchParams.set("key", apiKey);

    const r = await fetch(detailsUrl.toString(), {
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return {};
    const j = await r.json();
    const result = j.result ?? {};

    // address_components → city
    const components: Array<{ types: string[]; long_name: string }> =
      result.address_components ?? [];
    const cityComp = components.find((c) =>
      c.types.some((t) =>
        ["locality", "administrative_area_level_2", "postal_town"].includes(t),
      ),
    );

    // First photo → public photo URL via the photo proxy.
    const photoRef: string | undefined = result.photos?.[0]?.photo_reference;
    const photoUrl = photoRef
      ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1600&photo_reference=${encodeURIComponent(
          photoRef,
        )}&key=${apiKey}`
      : undefined;

    return {
      placeName: result.name,
      address: result.formatted_address,
      city: cityComp?.long_name,
      phone: result.international_phone_number,
      website: result.website,
      summary: result.editorial_summary?.overview,
      categories: Array.isArray(result.types) ? result.types.slice(0, 5) : undefined,
      rating: typeof result.rating === "number" ? result.rating : undefined,
      ratingCount: result.user_ratings_total,
      photoUrl,
    };
  } catch {
    return {};
  }
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const { success } = await rateLimit(`maps:${ip}`, 30, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const inputUrl = (body.url || "").trim();
  if (!inputUrl) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  let resolvedUrl = inputUrl;

  // Follow short-link redirect to get the real Maps URL with coordinates.
  if (isMapsShortLink(inputUrl)) {
    try {
      const head = await fetch(inputUrl, {
        redirect: "follow",
        method: "GET",
        signal: AbortSignal.timeout(8000),
      });
      resolvedUrl = head.url;
    } catch {
      return NextResponse.json(
        { error: "Could not expand short link" },
        { status: 502 },
      );
    }
  }

  const parsed = parseGoogleMapsUrl(resolvedUrl);
  if (!parsed) {
    return NextResponse.json(
      { error: "Could not parse Google Maps URL" },
      { status: 422 },
    );
  }

  const out: ExpandedMaps = {
    lat: parsed.lat,
    lng: parsed.lng,
    placeName: parsed.placeName,
  };

  // Try Places API enrichment in parallel with Nominatim. Places gives
  // us the rich fields (phone/website/summary), Nominatim is the fallback
  // for address+city when Places is missing or its response lacks them.
  const [placesData, geo] = await Promise.all([
    placesEnrich({
      placeId: parsed.placeId,
      placeName: parsed.placeName,
      lat: parsed.lat,
      lng: parsed.lng,
    }),
    out.lat !== undefined && out.lng !== undefined
      ? reverseGeocode(out.lat, out.lng)
      : Promise.resolve({} as { city?: string; address?: string }),
  ]);

  // Merge precedence: Places (when populated) > parsed URL > Nominatim.
  out.placeName = placesData.placeName || out.placeName;
  out.address = placesData.address || geo.address;
  out.city = placesData.city || geo.city;
  out.phone = placesData.phone;
  out.website = placesData.website;
  out.summary = placesData.summary;
  out.categories = placesData.categories;
  out.rating = placesData.rating;
  out.ratingCount = placesData.ratingCount;
  out.photoUrl = placesData.photoUrl;

  return NextResponse.json(out);
}
