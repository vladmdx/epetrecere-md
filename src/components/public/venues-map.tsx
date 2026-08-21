"use client";

/**
 * Venue map — Google Maps when a key is configured, Leaflet otherwise.
 *
 * Both renderers touch `window` on import, so each loads client-side only.
 * Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (a Maps JavaScript API key from Google
 * Cloud, restricted to the site's domains) to switch to Google.
 */

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useLocale } from "@/hooks/use-locale";
import { plural, NOUNS } from "@/lib/i18n/plural";
import type { MapVenue } from "./venues-map-shared";

const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

function Placeholder({ text }: { text: string }) {
  return (
    <div className="flex h-[420px] items-center justify-center rounded-2xl border border-border/60 text-sm text-muted-foreground sm:h-[520px]">
      {text}
    </div>
  );
}

const LeafletMap = dynamic(() => import("./venues-map-inner"), {
  ssr: false,
  loading: () => <Placeholder text="…" />,
});

const GoogleMap = dynamic(() => import("./venues-map-google"), {
  ssr: false,
  loading: () => <Placeholder text="…" />,
});

export type { MapVenue };

export function VenuesMap({ venues }: { venues: MapVenue[] }) {
  const { t, locale } = useLocale();

  // Google can fail for reasons a visitor cannot act on — a blocked script, a
  // key restricted to another domain, an exhausted quota. Rather than show
  // them an error where a map should be, fall back to OpenStreetMap, which
  // needs no key and always works.
  const [googleFailed, setGoogleFailed] = useState(false);
  const handleUnavailable = useCallback(() => setGoogleFailed(true), []);

  // Memoised on locale: the renderers keep this object in effect dependency
  // lists, and a fresh identity per render would rebuild every pin on the map
  // each time the parent paints.
  const labels = useMemo(
    () => ({
      // plural() renders the count itself — prefixing it printed "1 1 locație".
      one: plural(1, locale, NOUNS.venues),
      many: (n: number) => plural(n, locale, NOUNS.venues),
      close: t("common.close"),
      approx: t("map.approx"),
      empty: t("map.empty"),
      loading: t("map.loading"),
      failed: t("map.failed"),
    }),
    [locale, t],
  );

  return GOOGLE_KEY && !googleFailed ? (
    <GoogleMap
      venues={venues}
      apiKey={GOOGLE_KEY}
      labels={labels}
      onUnavailable={handleUnavailable}
    />
  ) : (
    <LeafletMap venues={venues} labels={labels} />
  );
}
