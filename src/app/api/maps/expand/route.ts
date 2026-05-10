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

/** Per-day opening window keyed by ISO weekday short name. Each value is
 *  either `{ open, close }` (open that day) or `null` (closed). Mirrors the
 *  shape of the venues.workingHours column so we can save it 1-to-1. */
export type WorkingHoursMap = {
  mon: { open: string; close: string } | null;
  tue: { open: string; close: string } | null;
  wed: { open: string; close: string } | null;
  thu: { open: string; close: string } | null;
  fri: { open: string; close: string } | null;
  sat: { open: string; close: string } | null;
  sun: { open: string; close: string } | null;
};

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
  /** Weekly opening hours keyed by mon..sun (matches venues.workingHours). */
  workingHours?: WorkingHoursMap;
  /** Human-readable description text (Places primary type display name +
   *  category). Useful as a description seed. */
  primaryTypeDisplay?: string;
}

/** Convert Places API `regularOpeningHours.periods` (each entry has
 *  `open: { day, hour, minute }` and optional `close`) into the columnar
 *  mon..sun map our schema uses. */
function mapPlacesOpeningHours(
  periods: Array<{
    open: { day: number; hour: number; minute: number };
    close?: { day: number; hour: number; minute: number };
  }> | undefined,
): WorkingHoursMap | undefined {
  if (!Array.isArray(periods) || periods.length === 0) return undefined;
  // Places weekday convention: 0 = Sunday, 1 = Monday, …, 6 = Saturday.
  const slot: WorkingHoursMap = {
    mon: null, tue: null, wed: null, thu: null,
    fri: null, sat: null, sun: null,
  };
  const dayKeys: (keyof WorkingHoursMap)[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  for (const period of periods) {
    if (!period.open || period.open.day === undefined) continue;
    const key = dayKeys[period.open.day];
    if (!key) continue;
    const fmt = (h: number, m: number) =>
      `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    if (!period.close) {
      // 24-hour day — Places omits close.
      slot[key] = { open: "00:00", close: "23:59" };
      continue;
    }
    slot[key] = {
      open: fmt(period.open.hour ?? 0, period.open.minute ?? 0),
      close: fmt(period.close.hour ?? 0, period.close.minute ?? 0),
    };
  }
  return slot;
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

// Field mask for the Place Details call. Place fields are categorized into
// SKU tiers (essentials, pro, enterprise) — we only pull the ones we
// actually populate the form with, so each request stays in the cheapest
// billable tier we can manage.
const PLACE_DETAILS_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "addressComponents",
  "internationalPhoneNumber",
  "nationalPhoneNumber",
  "websiteUri",
  "editorialSummary",
  "types",
  "primaryTypeDisplayName",
  "rating",
  "userRatingCount",
  "photos",
  "location",
  // Opening hours — the new API returns periods + a localized weekday text;
  // we use the periods to build the columnar working_hours map.
  "regularOpeningHours",
].join(",");

/** Pull the rich profile from the Google Places API (v1 / "New"). Requires
 *  GOOGLE_PLACES_API_KEY. Returns nothing on miss — the caller falls back
 *  to OpenStreetMap. We deliberately use the new API because the legacy
 *  one (`maps.googleapis.com/maps/api/place/...`) is no longer enabled by
 *  default for new Cloud projects. */
async function placesEnrich(
  args: { placeId?: string; placeName?: string; lat?: number; lng?: number },
): Promise<Partial<ExpandedMaps>> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return {};

  // 1. Resolve to a Place "places/<id>" resource name.
  //    The URL we parsed only ever yields `ChIJ...` ids (legacy format) or
  //    none — both go through Search Text in the new API. We try a tight
  //    bias first (5 km, picks the right venue when the URL coords are
  //    accurate) and fall back to an unbiased search if the bias misses
  //    (URL coords might be approximate or slightly off).
  async function searchOnce(body: Record<string, unknown>): Promise<string | undefined> {
    try {
      const r = await fetch(
        "https://places.googleapis.com/v1/places:searchText",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey!,
            // Search responses are listed by `places.<field>`. We only
            // need the id; details come from the second call.
            "X-Goog-FieldMask": "places.id",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(5000),
        },
      );
      if (r.ok) {
        const j = (await r.json()) as { places?: Array<{ id?: string }> };
        return j.places?.[0]?.id;
      }
      // Surface the API's complaint in logs — most common failure mode is
      // "Places API (New) not enabled" or restricted-key referrer mismatch.
      console.warn("[maps.expand] places.searchText failed", await r.text());
      return undefined;
    } catch (err) {
      console.warn("[maps.expand] places.searchText threw", err);
      return undefined;
    }
  }

  let placeId: string | undefined;
  const query = args.placeName || args.placeId;
  if (query) {
    if (args.lat !== undefined && args.lng !== undefined) {
      placeId = await searchOnce({
        textQuery: query,
        languageCode: "ro",
        locationBias: {
          circle: {
            center: { latitude: args.lat, longitude: args.lng },
            radius: 5000,
          },
        },
      });
    }
    if (!placeId) {
      placeId = await searchOnce({ textQuery: query, languageCode: "ro" });
    }
  }
  if (!placeId) return {};

  // 2. Place Details with the rich field mask.
  try {
    const r = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=ro`,
      {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": PLACE_DETAILS_FIELDS,
        },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!r.ok) {
      console.warn("[maps.expand] place details failed", await r.text());
      return {};
    }
    type AddrComp = { types: string[]; longText: string };
    type PlacesPeriod = {
      open: { day: number; hour: number; minute: number };
      close?: { day: number; hour: number; minute: number };
    };
    type Place = {
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      addressComponents?: AddrComp[];
      internationalPhoneNumber?: string;
      nationalPhoneNumber?: string;
      websiteUri?: string;
      editorialSummary?: { text?: string };
      primaryTypeDisplayName?: { text?: string };
      types?: string[];
      rating?: number;
      userRatingCount?: number;
      photos?: Array<{ name?: string }>;
      regularOpeningHours?: { periods?: PlacesPeriod[] };
    };
    const place = (await r.json()) as Place;

    const cityComp = place.addressComponents?.find((c) =>
      c.types.some((t) =>
        ["locality", "administrative_area_level_2", "postal_town"].includes(t),
      ),
    );

    // Photos in the new API are referenced by their resource name, e.g.
    // `places/{place_id}/photos/{photo_id}`. The media endpoint streams the
    // actual image bytes; we expose the URL so the front-end can render
    // it directly in an <img>.
    const photoName = place.photos?.[0]?.name;
    const photoUrl = photoName
      ? `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=1600&key=${apiKey}`
      : undefined;

    return {
      placeName: place.displayName?.text,
      address: place.formattedAddress,
      city: cityComp?.longText,
      phone: place.internationalPhoneNumber || place.nationalPhoneNumber,
      website: place.websiteUri,
      summary: place.editorialSummary?.text,
      categories: place.types?.slice(0, 5),
      rating: typeof place.rating === "number" ? place.rating : undefined,
      ratingCount: place.userRatingCount,
      photoUrl,
      workingHours: mapPlacesOpeningHours(place.regularOpeningHours?.periods),
      primaryTypeDisplay: place.primaryTypeDisplayName?.text,
    };
  } catch (err) {
    console.warn("[maps.expand] place details threw", err);
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
  out.workingHours = placesData.workingHours;
  out.primaryTypeDisplay = placesData.primaryTypeDisplay;

  return NextResponse.json(out);
}
