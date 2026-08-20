"use client";

/**
 * Leaflet + OpenStreetMap renderer — the fallback used when no Google Maps
 * API key is configured.
 *
 * `leaflet/dist/leaflet.css` is the load-bearing import here. Next scopes CSS
 * to the chunk that imports it, and the only other import in the repo lives in
 * the vendor map picker, so without this line /sali got Leaflet's DOM with
 * none of its stylesheet: tiles lost `position:absolute` and fell into normal
 * flow, Tailwind's preflight `img{max-width:100%}` rescaled them into
 * misaligned rectangles, the pins were pushed outside the (unclipped)
 * container, and touch drags scrolled the page instead of panning.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  ClusterPanel,
  clusterize,
  pinHtml,
  pinSize,
  placeVenues,
  type Cluster,
  type MapVenue,
} from "./venues-map-shared";
import type { LatLng } from "@/lib/geo/city-coords";

export type { MapVenue };

/**
 * Icons are cached by (count, approximate). react-leaflet compares `icon` by
 * identity, so building one inline per render tore down and rebuilt every
 * marker's DOM node on each zoom.
 */
const iconCache = new Map<string, L.DivIcon>();
function pinIcon(count: number, approximate: boolean): L.DivIcon {
  const key = `${count}:${approximate}`;
  const hit = iconCache.get(key);
  if (hit) return hit;
  const size = pinSize(count);
  const icon = L.divIcon({
    className: "",
    html: pinHtml(count, approximate),
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  iconCache.set(key, icon);
  return icon;
}

/** Keeps the parent informed of the current zoom so clusters re-form. */
function ZoomWatcher({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMap();
  useEffect(() => {
    const fn = () => onZoom(map.getZoom());
    map.on("zoomend", fn);
    fn();
    return () => {
      map.off("zoomend", fn);
    };
  }, [map, onZoom]);
  return null;
}

/**
 * Re-measures the map when its box changes. The map mounts visible today, but
 * a rotation or a future animated container would otherwise leave Leaflet
 * holding a stale size and drawing a grey half-map.
 */
function ResizeGuard() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    const t = window.setTimeout(() => map.invalidateSize(), 200);
    return () => {
      ro.disconnect();
      window.clearTimeout(t);
    };
  }, [map]);
  return null;
}

function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || points.length === 0) return;
    done.current = true;
    if (points.length === 1) {
      map.setView([points[0]!.lat, points[0]!.lng], 13);
      return;
    }
    map.fitBounds(
      L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])),
      { padding: [48, 48], maxZoom: 14 },
    );
  }, [map, points]);
  return null;
}

export default function VenuesMapInner({
  venues,
  labels,
}: {
  venues: MapVenue[];
  labels: {
    one: string;
    many: (n: number) => string;
    close: string;
    approx: string;
    empty: string;
  };
}) {
  const [zoom, setZoom] = useState(8);
  const [selected, setSelected] = useState<Cluster | null>(null);

  const placed = useMemo(() => placeVenues(venues), [venues]);
  const clusters = useMemo(() => clusterize(placed, zoom), [placed, zoom]);
  const points = useMemo(() => placed.map((p) => p.pos), [placed]);

  if (placed.length === 0) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-2xl border border-border/60 text-sm text-muted-foreground sm:h-[520px]">
        {labels.empty}
      </div>
    );
  }

  return (
    <div className="relative h-[420px] overflow-hidden rounded-2xl border border-border/60 sm:h-[520px]">
      <MapContainer
        center={[47.0105, 28.8638]}
        zoom={8}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ZoomWatcher onZoom={setZoom} />
        <ResizeGuard />
        <FitBounds points={points} />
        {clusters.map((c) => (
          <Marker
            key={c.key}
            position={[c.pos.lat, c.pos.lng]}
            icon={pinIcon(c.items.length, c.items[0]!.approximate)}
            eventHandlers={{ click: () => setSelected(c) }}
          />
        ))}
      </MapContainer>

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
