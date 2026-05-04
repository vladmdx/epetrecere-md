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
// Auth-gated to prevent random users from spinning a free proxy. Rate-
// limited per IP because Nominatim has a 1 req/sec etiquette policy.

interface ExpandedMaps {
  lat?: number;
  lng?: number;
  placeName?: string;
  city?: string;
  address?: string;
}

async function reverseGeocode(lat: number, lng: number): Promise<{ city?: string; address?: string }> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ro`;
    const res = await fetch(url, {
      // Nominatim asks for a User-Agent identifying the app — required.
      headers: { "User-Agent": "ePetrecere.md/1.0 (contact@epetrecere.md)" },
      // 5s budget so a sluggish geocoder doesn't hang the whole flow.
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
        // Some servers refuse HEAD; use GET with a tiny body limit.
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

  // If we have coordinates, try to resolve a human address via Nominatim.
  if (out.lat !== undefined && out.lng !== undefined) {
    const geo = await reverseGeocode(out.lat, out.lng);
    out.city = geo.city;
    out.address = geo.address;
  }

  return NextResponse.json(out);
}
