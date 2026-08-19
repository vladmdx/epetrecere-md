"use client";

/**
 * Leaflet map of venues with grouping.
 *
 * Venues that sit close together collapse into one numbered cluster pin;
 * clicking it opens a list of exactly those venues in a side panel (the
 * behaviour asked for: "when they're next to each other, group them, and on
 * click show them as a list").
 *
 * Clustering is done here rather than via leaflet.markercluster: the extra
 * dependency isn't worth it for this dataset, and a hand-rolled grid pass
 * keeps the cluster→list mapping explicit and easy to reason about.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import Link from "@/components/shared/locale-link";
import { MapPin, Users, Star, X } from "lucide-react";
import { resolveVenuePosition, type LatLng } from "@/lib/geo/city-coords";

export interface MapVenue {
  id: number;
  slug: string;
  name: string;
  city: string | null;
  lat?: number | null;
  lng?: number | null;
  capacityMax?: number | null;
  pricePerPerson?: number | null;
  ratingAvg?: number | null;
  imageUrl?: string | null;
}

interface Placed extends MapVenue {
  pos: LatLng;
  approximate: boolean;
}

interface Cluster {
  key: string;
  pos: LatLng;
  items: Placed[];
}

/** Zoom → grouping radius in degrees. Tighter as you zoom in. */
function gridSize(zoom: number): number {
  if (zoom >= 15) return 0.0015;
  if (zoom >= 13) return 0.006;
  if (zoom >= 11) return 0.02;
  if (zoom >= 9) return 0.06;
  return 0.2;
}

function clusterize(items: Placed[], zoom: number): Cluster[] {
  const size = gridSize(zoom);
  const buckets = new Map<string, Placed[]>();
  for (const it of items) {
    const key = `${Math.round(it.pos.lat / size)}:${Math.round(it.pos.lng / size)}`;
    const arr = buckets.get(key);
    if (arr) arr.push(it);
    else buckets.set(key, [it]);
  }
  return [...buckets.entries()].map(([key, group]) => ({
    key,
    // Centre the pin on the group so it visually covers its members.
    pos: {
      lat: group.reduce((s, g) => s + g.pos.lat, 0) / group.length,
      lng: group.reduce((s, g) => s + g.pos.lng, 0) / group.length,
    },
    items: group,
  }));
}

function pinIcon(count: number, approximate: boolean): L.DivIcon {
  const size = count > 1 ? 42 : 34;
  const label = count > 1 ? String(count) : "";
  return L.divIcon({
    className: "",
    html: `<div style="
        width:${size}px;height:${size}px;border-radius:9999px;
        display:flex;align-items:center;justify-content:center;
        background:${count > 1 ? "#C9A84C" : "#1A1A2E"};
        color:${count > 1 ? "#0D0D0D" : "#C9A84C"};
        border:2px solid ${count > 1 ? "#0D0D0D" : "#C9A84C"};
        ${approximate && count === 1 ? "border-style:dashed;" : ""}
        font-weight:700;font-size:${count > 1 ? 14 : 16}px;
        box-shadow:0 4px 14px rgba(0,0,0,.35);cursor:pointer;">
        ${label || "&#9679;"}
      </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
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

export default function VenuesMapInner({ venues }: { venues: MapVenue[] }) {
  const [zoom, setZoom] = useState(8);
  const [selected, setSelected] = useState<Cluster | null>(null);

  const placed = useMemo<Placed[]>(
    () =>
      venues
        .map((v) => {
          const r = resolveVenuePosition(v);
          return r ? { ...v, pos: r.pos, approximate: r.approximate } : null;
        })
        .filter((v): v is Placed => v !== null),
    [venues],
  );

  const clusters = useMemo(() => clusterize(placed, zoom), [placed, zoom]);
  const points = useMemo(() => placed.map((p) => p.pos), [placed]);

  if (placed.length === 0) {
    return (
      <div className="flex h-[520px] items-center justify-center rounded-2xl border border-border/60 text-sm text-muted-foreground">
        Nicio locație cu adresă cunoscută încă.
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60">
      <MapContainer
        center={[47.0105, 28.8638]}
        zoom={8}
        scrollWheelZoom
        style={{ height: 520, width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ZoomWatcher onZoom={setZoom} />
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
        <div className="absolute right-3 top-3 z-[1000] max-h-[460px] w-[300px] overflow-y-auto rounded-xl border border-border bg-background/95 p-3 shadow-2xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">
              {selected.items.length === 1
                ? "1 locație"
                : `${selected.items.length} locații aici`}
            </p>
            <button
              onClick={() => setSelected(null)}
              aria-label="Închide"
              className="rounded p-1 hover:bg-accent"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ul className="space-y-2">
            {selected.items.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/sali/${v.slug}`}
                  className="flex gap-3 rounded-lg border border-border/50 p-2 transition-colors hover:border-gold/40 hover:bg-gold/5"
                >
                  {v.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={v.imageUrl}
                      alt={v.name}
                      className="h-14 w-14 shrink-0 rounded-md object-cover"
                      loading="lazy"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{v.name}</p>
                    {v.city && (
                      <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {v.city}
                        {v.approximate && " · aprox."}
                      </p>
                    )}
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                      {v.capacityMax != null && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {v.capacityMax}
                        </span>
                      )}
                      {v.ratingAvg ? (
                        <span className="flex items-center gap-1">
                          <Star className="h-3 w-3 fill-gold text-gold" />
                          {v.ratingAvg.toFixed(1)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
