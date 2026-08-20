"use client";

/**
 * Venue map — Google Maps when a key is configured, Leaflet otherwise.
 *
 * Both renderers touch `window` on import, so each loads client-side only.
 * Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (a Maps JavaScript API key from Google
 * Cloud, restricted to the site's domains) to switch to Google.
 */

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

  const labels = {
    one: `1 ${plural(1, locale, NOUNS.venues)}`,
    many: (n: number) => `${n} ${plural(n, locale, NOUNS.venues)}`,
    close: t("common.close"),
    approx: t("map.approx"),
    empty: t("map.empty"),
    loading: t("map.loading"),
    failed: t("map.failed"),
  };

  return GOOGLE_KEY ? (
    <GoogleMap venues={venues} apiKey={GOOGLE_KEY} labels={labels} />
  ) : (
    <LeafletMap venues={venues} labels={labels} />
  );
}
