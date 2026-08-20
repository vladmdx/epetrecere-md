"use client";

/**
 * Google Maps renderer.
 *
 * Used whenever NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set; the Leaflet renderer
 * stays as the fallback so the map never goes blank while a key is being set
 * up. Grouping and the click→list panel come from venues-map-shared, so both
 * renderers behave the same.
 *
 * Pins are `google.maps.Marker` with an inline SVG icon rather than
 * AdvancedMarkerElement: advanced markers need a cloud-configured Map ID,
 * which would mean the map silently renders without pins until someone
 * creates one. Marker is deprecated but supported, and the swap is contained
 * to `buildMarker` below if that changes.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/hooks/use-locale";
import {
  ClusterPanel,
  clusterize,
  placeVenues,
  PIN_DARK,
  PIN_GOLD,
  pinSize,
  type Cluster,
  type MapVenue,
} from "./venues-map-shared";
import { loadGoogleMaps } from "@/lib/geo/google-maps-loader";

/** A gold circle for groups, a dark dot for single venues — same as Leaflet. */
function pinIconUrl(count: number, approximate: boolean): string {
  const size = pinSize(count);
  const isGroup = count > 1;
  const fill = isGroup ? PIN_GOLD : PIN_DARK;
  const stroke = isGroup ? "#0D0D0D" : PIN_GOLD;
  const text = isGroup ? String(count) : "";
  const r = size / 2 - 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2"${approximate && !isGroup ? ' stroke-dasharray="4 3"' : ""}/>
    ${
      isGroup
        ? `<text x="${size / 2}" y="${size / 2}" fill="#0D0D0D" font-family="system-ui,sans-serif" font-size="14" font-weight="700" text-anchor="middle" dominant-baseline="central">${text}</text>`
        : `<circle cx="${size / 2}" cy="${size / 2}" r="4" fill="${PIN_GOLD}"/>`
    }
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/** Dark styling to match the site. Applies only without a cloud Map ID. */
const DARK_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#12161d" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#12161d" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8f9099" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#2a2f39" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#232833" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9aa0ab" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3a3323" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d1b26" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3f5c6b" }] },
];

export default function VenuesMapGoogle({
  venues,
  apiKey,
  labels,
}: {
  venues: MapVenue[];
  apiKey: string;
  labels: {
    one: string;
    many: (n: number) => string;
    close: string;
    approx: string;
    empty: string;
    loading: string;
    failed: string;
  };
}) {
  const { locale } = useLocale();
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const fittedRef = useRef(false);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [zoom, setZoom] = useState(8);
  const [selected, setSelected] = useState<Cluster | null>(null);

  const placed = useMemo(() => placeVenues(venues), [venues]);
  const clusters = useMemo(() => clusterize(placed, zoom), [placed, zoom]);

  // Create the map once the host div is in the DOM. `placed.length` is in
  // the dependency list because the component renders a text placeholder
  // instead of the host while there is nothing to show: without it, a page
  // that starts with no results and then gets some kept a null hostRef and
  // the map never appeared at all.
  const hasPlaces = placed.length > 0;
  useEffect(() => {
    if (!hasPlaces) return;
    let cancelled = false;
    loadGoogleMaps(apiKey, locale)
      .then((maps) => {
        if (cancelled || !hostRef.current || mapRef.current) return;
        const map = new maps.Map(hostRef.current, {
          center: { lat: 47.0105, lng: 28.8638 },
          zoom: 8,
          styles: DARK_STYLE,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          // Lets a phone scroll past the map instead of trapping the gesture.
          gestureHandling: "cooperative",
        });
        map.addListener("zoom_changed", () => setZoom(map.getZoom() ?? 8));
        mapRef.current = map;
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey, locale, hasPlaces]);

  // Redraw the pins whenever the clusters change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready") return;

    for (const m of markersRef.current) m.setMap(null);
    markersRef.current = clusters.map((c) => {
      const size = pinSize(c.items.length);
      const marker = new google.maps.Marker({
        map,
        position: { lat: c.pos.lat, lng: c.pos.lng },
        icon: {
          url: pinIconUrl(c.items.length, c.items[0]!.approximate),
          scaledSize: new google.maps.Size(size, size),
          anchor: new google.maps.Point(size / 2, size / 2),
        },
        title: c.items.length === 1 ? c.items[0]!.name : labels.many(c.items.length),
      });
      marker.addListener("click", () => setSelected(c));
      return marker;
    });

    if (!fittedRef.current && placed.length > 0) {
      fittedRef.current = true;
      if (placed.length === 1) {
        map.setCenter({ lat: placed[0]!.pos.lat, lng: placed[0]!.pos.lng });
        map.setZoom(13);
      } else {
        const bounds = new google.maps.LatLngBounds();
        for (const p of placed) bounds.extend({ lat: p.pos.lat, lng: p.pos.lng });
        map.fitBounds(bounds, 48);
      }
    }
    // `labels` is deliberately not a dependency: the parent rebuilds it on
    // every render, and it is read here only for a marker tooltip. Listing it
    // would tear down and rebuild every pin on every parent paint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusters, placed, status]);

  // Drop the markers when the component goes away.
  useEffect(
    () => () => {
      for (const m of markersRef.current) m.setMap(null);
      markersRef.current = [];
    },
    [],
  );

  if (placed.length === 0) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-2xl border border-border/60 text-sm text-muted-foreground sm:h-[520px]">
        {labels.empty}
      </div>
    );
  }

  return (
    <div className="relative h-[420px] overflow-hidden rounded-2xl border border-border/60 sm:h-[520px]">
      <div ref={hostRef} className="h-full w-full" />
      {status !== "ready" && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0d1017] text-sm text-muted-foreground">
          {status === "error" ? labels.failed : labels.loading}
        </div>
      )}
      {selected && (
        <ClusterPanel
          cluster={selected}
          onClose={() => setSelected(null)}
          labels={labels}
        />
      )}
    </div>
  );
}
