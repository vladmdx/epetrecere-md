"use client";

// Interactive Leaflet map picker — click the map to set a pin, or drag the
// existing pin to reposition. Coordinates flow up via onChange.
// No API key required (uses OpenStreetMap tiles).

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

export interface MapPickerProps {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  /** Initial zoom when no pin is set. */
  defaultZoom?: number;
}

/**
 * Leaflet requires window, so we wrap the actual map in a dynamic import with
 * SSR disabled. This outer component just loads the inner one on the client.
 */
const InnerMap = dynamic(() => import("./map-picker-inner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[300px] items-center justify-center rounded-lg border border-border/40 bg-muted/30 text-sm text-muted-foreground">
      Se încarcă harta...
    </div>
  ),
});

export function MapPicker(props: MapPickerProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-lg border border-border/40 bg-muted/30 text-sm text-muted-foreground">
        Se încarcă harta...
      </div>
    );
  }
  return <InnerMap {...props} />;
}
