"use client";

// Standalone "Tarife" page — the artist's duration-based pricing with
// base rates + optional weekend/evening/specific-day overrides.
// Moved out of /dashboard/calendar (was a tab) to its own top-level
// sidebar item.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { DurationPricingManager } from "@/components/vendor/duration-pricing-manager";
import { useLocale } from "@/hooks/use-locale";

export default function TarifePage() {
  const { t } = useLocale();
  const [artistId, setArtistId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/artist")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.artist?.id) {
          setArtistId(data.artist.id);
        } else {
          setError(t("vendor.ratesPage.noProfile"));
        }
      })
      .catch(() => {
        if (!cancelled) setError(t("vendor.ratesPage.loadError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{t("dashboard.rates")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("vendor.ratesPage.subtitle")}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-border/40 bg-card py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-dashed border-border/40 bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      ) : artistId != null ? (
        <DurationPricingManager artistId={artistId} />
      ) : null}
    </div>
  );
}
