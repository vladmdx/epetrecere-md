"use client";

// Leaflet touches `window` on import, so the map is loaded client-side only.
// Mirrors the pattern already used by the vendor map-picker.

import dynamic from "next/dynamic";
import type { MapVenue } from "./venues-map-inner";

const Inner = dynamic(() => import("./venues-map-inner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[520px] items-center justify-center rounded-2xl border border-border/60 text-sm text-muted-foreground">
      Se încarcă harta…
    </div>
  ),
});

export type { MapVenue };

export function VenuesMap({ venues }: { venues: MapVenue[] }) {
  return <Inner venues={venues} />;
}
