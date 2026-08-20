"use client";

/**
 * Pieces shared by the two map renderers.
 *
 * The site draws venues on Google Maps when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is
 * configured and falls back to Leaflet + OpenStreetMap otherwise, so the map
 * keeps working before (or without) a Google Cloud key. Grouping and the
 * click→list panel behave identically on both, which is why they live here
 * rather than in either renderer.
 */

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

export interface Placed extends MapVenue {
  pos: LatLng;
  /** True when the pin is the city centre, not the venue's own coordinates. */
  approximate: boolean;
}

export interface Cluster {
  key: string;
  pos: LatLng;
  items: Placed[];
}

/** Brand colours, kept here so both renderers draw the same pin. */
export const PIN_GOLD = "#C9A84C";
export const PIN_DARK = "#1A1A2E";

export function placeVenues(venues: MapVenue[]): Placed[] {
  return venues
    .map((v) => {
      const r = resolveVenuePosition(v);
      return r ? { ...v, pos: r.pos, approximate: r.approximate } : null;
    })
    .filter((v): v is Placed => v !== null);
}

/** Zoom → grouping radius in degrees. Tighter as you zoom in. */
export function gridSize(zoom: number): number {
  if (zoom >= 15) return 0.0015;
  if (zoom >= 13) return 0.006;
  if (zoom >= 11) return 0.02;
  if (zoom >= 9) return 0.06;
  return 0.2;
}

export function clusterize(items: Placed[], zoom: number): Cluster[] {
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

/** The pin markup, as a string — Leaflet needs HTML, Google needs a DOM node. */
export function pinHtml(count: number, approximate: boolean): string {
  const size = count > 1 ? 42 : 34;
  const isGroup = count > 1;
  return `<div style="
      width:${size}px;height:${size}px;border-radius:9999px;
      display:flex;align-items:center;justify-content:center;
      background:${isGroup ? PIN_GOLD : PIN_DARK};
      color:${isGroup ? "#0D0D0D" : PIN_GOLD};
      border:2px solid ${isGroup ? "#0D0D0D" : PIN_GOLD};
      ${approximate && !isGroup ? "border-style:dashed;" : ""}
      font-weight:700;font-size:${isGroup ? 14 : 16}px;line-height:1;
      box-shadow:0 4px 14px rgba(0,0,0,.35);cursor:pointer;">
      ${isGroup ? String(count) : "&#9679;"}
    </div>`;
}

export function pinSize(count: number): number {
  return count > 1 ? 42 : 34;
}

/**
 * The list that opens when a pin is clicked.
 *
 * On phones it is a bottom sheet: a 300px panel pinned to the top-right of a
 * 375px-wide map covered almost everything under it, which made the grouping
 * feature unusable exactly where grouping matters most.
 */
export function ClusterPanel({
  cluster,
  onClose,
  labels,
}: {
  cluster: Cluster;
  onClose: () => void;
  labels: { one: string; many: (n: number) => string; close: string; approx: string };
}) {
  return (
    <div className="absolute inset-x-2 bottom-2 z-[1000] max-h-[55%] overflow-y-auto rounded-xl border border-border bg-background/95 p-3 shadow-2xl backdrop-blur sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-3 sm:max-h-[460px] sm:w-[300px]">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">
          {cluster.items.length === 1 ? labels.one : labels.many(cluster.items.length)}
        </p>
        <button
          onClick={onClose}
          aria-label={labels.close}
          className="rounded p-1 hover:bg-accent"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="space-y-2">
        {cluster.items.map((v) => (
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
                    {v.approximate && ` · ${labels.approx}`}
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
  );
}
