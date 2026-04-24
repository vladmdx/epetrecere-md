"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Eye,
  TrendingUp,
  TrendingDown,
  Star,
  Wallet,
  Globe,
  Sparkles,
  Search,
  MinusCircle,
  MousePointerClick,
  Phone,
  Image as ImageIcon,
  UtensilsCrossed,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Venue {
  id: number;
  nameRo: string;
  city: string | null;
  pricePerPerson: number | null;
  ratingAvg: number | null;
  ratingCount: number | null;
}

interface ChartPoint {
  date: string;
  label: string;
  views: number;
}

interface Referrer {
  referrer: string | null;
  count: number;
}

interface CityComparison {
  avgPrice: number | null;
  avgRating: number | null;
  avgViewsPerVenue: number | null;
  venueCount: number;
}

interface Props {
  venue: Venue;
  periodKey: string;
  periodDays: number;
  totalViews30d: number;
  clicksByType: Record<string, number>;
  chartPoints: ChartPoint[];
  referrerBreakdown: Referrer[];
  cityComparison: CityComparison;
}

const PERIOD_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "7d", label: "7 zile" },
  { key: "30d", label: "30 zile" },
  { key: "90d", label: "3 luni" },
  { key: "12m", label: "12 luni" },
];

function classifyReferrer(ref: string | null): { label: string; Icon: typeof Globe; color: string } {
  if (!ref) return { label: "Direct", Icon: Globe, color: "text-muted-foreground" };
  if (ref.includes("google")) return { label: "Google", Icon: Search, color: "text-blue-400" };
  if (ref.includes("instagram")) return { label: "Instagram", Icon: Globe, color: "text-pink-400" };
  if (ref.includes("facebook")) return { label: "Facebook", Icon: Globe, color: "text-blue-500" };
  if (ref.includes("epetrecere")) return { label: "ePetrecere.md", Icon: Sparkles, color: "text-gold" };
  try {
    const host = new URL(ref.startsWith("http") ? ref : `https://${ref}`).hostname;
    return { label: host, Icon: Globe, color: "text-muted-foreground" };
  } catch {
    return { label: "Referrer", Icon: Globe, color: "text-muted-foreground" };
  }
}

export function VenueAnalyticsClient({
  venue,
  periodKey,
  periodDays,
  totalViews30d,
  clicksByType,
  chartPoints,
  referrerBreakdown,
  cityComparison,
}: Props) {
  const router = useRouter();
  const maxViews = Math.max(1, ...chartPoints.map((p) => p.views));
  const totalRefCount = referrerBreakdown.reduce((s, r) => s + r.count, 0);

  const ctaClicks = clicksByType.cta ?? 0;
  const phoneClicks = clicksByType.phone ?? 0;
  const galleryClicks = clicksByType.gallery ?? 0;
  const menuClicks = clicksByType.menu ?? 0;
  const conversionRate =
    totalViews30d > 0
      ? Math.round((ctaClicks / totalViews30d) * 100 * 10) / 10
      : 0;

  function changePeriod(next: string) {
    router.push(`/dashboard/sala/analitice?period=${next}`);
  }

  // AI suggestion — fetched on demand (not auto) to avoid AI cost on every
  // dashboard hit. Stored in local state; the endpoint itself caches.
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  async function fetchAiSuggestion() {
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai/analytics-suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId: venue.id,
          period: periodKey,
          stats: {
            views: totalViews30d,
            ctaClicks,
            conversionRate,
            galleryClicks,
            menuClicks,
            rating: venue.ratingAvg,
            price: venue.pricePerPerson,
            city: venue.city,
            cityAvgPrice: cityComparison.avgPrice,
            cityAvgRating: cityComparison.avgRating,
            cityAvgViews: cityComparison.avgViewsPerVenue,
          },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "AI-ul nu a răspuns");
        return;
      }
      const data = (await res.json()) as { suggestion: string };
      setAiSuggestion(data.suggestion);
    } finally {
      setAiLoading(false);
    }
  }

  // Auto-clear AI suggestion when period changes (stats are different).
  useEffect(() => {
    setAiSuggestion(null);
  }, [periodKey]);

  // City comparison deltas
  const priceDelta =
    venue.pricePerPerson !== null && cityComparison.avgPrice !== null
      ? venue.pricePerPerson - cityComparison.avgPrice
      : null;
  const priceDeltaPct =
    priceDelta !== null && cityComparison.avgPrice && cityComparison.avgPrice > 0
      ? Math.round((priceDelta / cityComparison.avgPrice) * 100)
      : null;

  const ratingDelta =
    venue.ratingAvg !== null && cityComparison.avgRating !== null
      ? venue.ratingAvg - cityComparison.avgRating
      : null;

  const viewsDelta =
    cityComparison.avgViewsPerVenue !== null
      ? totalViews30d - cityComparison.avgViewsPerVenue
      : null;

  const currentPeriodLabel =
    PERIOD_OPTIONS.find((p) => p.key === periodKey)?.label ?? "30 zile";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">
            Performanța profilului public pentru <strong>{venue.nameRo}</strong>{" "}
            {venue.city && <>· {venue.city}</>}
          </p>
        </div>
        {/* Period selector */}
        <div
          className="inline-flex rounded-lg border border-border/50 p-0.5"
          role="tablist"
          aria-label="Perioadă raport"
        >
          {PERIOD_OPTIONS.map((p) => (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={periodKey === p.key}
              onClick={() => changePeriod(p.key)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                periodKey === p.key
                  ? "bg-gold text-[#0D0D0D]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Top stats — views + rating + price */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          icon={Eye}
          label={`Vizite profil (${currentPeriodLabel})`}
          value={totalViews30d.toLocaleString("ro-RO")}
          accent="text-blue-400"
        />
        <StatCard
          icon={Star}
          label="Rating mediu"
          value={
            venue.ratingCount && venue.ratingAvg
              ? venue.ratingAvg.toFixed(1)
              : "—"
          }
          subLabel={
            venue.ratingCount
              ? `${venue.ratingCount} recenzii`
              : "Nicio recenzie încă"
          }
          accent="text-amber-400"
        />
        <StatCard
          icon={Wallet}
          label="Preț curent / persoană"
          value={
            venue.pricePerPerson !== null ? `${venue.pricePerPerson}€` : "—"
          }
          accent="text-emerald-400"
        />
      </div>

      {/* Click metrics — CTA + phone + gallery + menu + conversion */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          icon={MousePointerClick}
          label='Click "Solicită"'
          value={ctaClicks.toLocaleString("ro-RO")}
          subLabel={
            totalViews30d > 0
              ? `${conversionRate}% conversie`
              : "Nicio vizită încă"
          }
          accent={conversionRate >= 5 ? "text-emerald-400" : "text-gold"}
        />
        <StatCard
          icon={Phone}
          label="Click telefon"
          value={phoneClicks.toLocaleString("ro-RO")}
          accent="text-blue-400"
        />
        <StatCard
          icon={ImageIcon}
          label="Vizualizări galerie"
          value={galleryClicks.toLocaleString("ro-RO")}
          accent="text-purple-400"
        />
        <StatCard
          icon={UtensilsCrossed}
          label="Vizualizări meniu"
          value={menuClicks.toLocaleString("ro-RO")}
          accent="text-orange-400"
        />
        <StatCard
          icon={TrendingUp}
          label="Rata conversie"
          value={`${conversionRate}%`}
          subLabel={`${ctaClicks}/${totalViews30d} vizite`}
          accent={
            conversionRate >= 5
              ? "text-emerald-400"
              : conversionRate >= 2
                ? "text-amber-400"
                : "text-red-400"
          }
        />
      </div>

      {/* City comparison */}
      {cityComparison.venueCount > 1 && venue.city && (
        <Card className="border-gold/30 bg-gold/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-gold" />
              Cum te compari cu alte săli din {venue.city}?
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Comparație anonimizată față de media celor{" "}
              <strong>{cityComparison.venueCount}</strong> săli active din
              același oraș.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <ComparisonCard
              label="Preț / persoană"
              yourValue={
                venue.pricePerPerson !== null ? `${venue.pricePerPerson}€` : "—"
              }
              averageValue={
                cityComparison.avgPrice !== null
                  ? `${Math.round(cityComparison.avgPrice)}€`
                  : "—"
              }
              delta={priceDelta}
              deltaPct={priceDeltaPct}
              /* Lower price = "cheaper", good for clients. Not inherently good/bad. */
              neutral
              suffix="€"
            />
            <ComparisonCard
              label="Rating"
              yourValue={
                venue.ratingAvg !== null ? venue.ratingAvg.toFixed(1) : "—"
              }
              averageValue={
                cityComparison.avgRating !== null
                  ? cityComparison.avgRating.toFixed(1)
                  : "—"
              }
              delta={ratingDelta}
              showSign
              suffix="★"
              higherIsBetter
            />
            <ComparisonCard
              label="Vizite profil (30z)"
              yourValue={totalViews30d.toLocaleString("ro-RO")}
              averageValue={
                cityComparison.avgViewsPerVenue !== null
                  ? cityComparison.avgViewsPerVenue.toLocaleString("ro-RO")
                  : "—"
              }
              delta={viewsDelta}
              showSign
              higherIsBetter
            />
          </CardContent>
        </Card>
      )}

      {/* AI suggestions — on demand, caches server-side */}
      <Card className="border-gold/30 bg-gradient-to-br from-gold/5 to-transparent">
        <CardContent className="flex flex-wrap items-start gap-3 p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold/15 text-gold">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-heading text-sm font-bold">
              Sugestii AI pentru îmbunătățire
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Claude analizează statisticile tale și compararea cu piața, apoi
              propune 3 acțiuni concrete.
            </p>
            {aiSuggestion ? (
              <div
                className="mt-3 space-y-2 rounded-lg bg-background/60 p-3 text-sm leading-relaxed"
                // Claude returns plain markdown — we render as preformatted with
                // simple bullet styling. Not raw HTML to avoid XSS.
              >
                {aiSuggestion.split("\n").map((line, i) => (
                  <p key={i} className={cn(line.trim() === "" && "h-2")}>
                    {line}
                  </p>
                ))}
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={fetchAiSuggestion}
                disabled={aiLoading}
                className="mt-3 gap-1.5 border-gold/40 text-gold hover:bg-gold/10"
              >
                {aiLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {aiLoading ? "Claude analizează..." : "Generează sugestii AI"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Views chart */}
      <Card>
        <CardContent className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-heading text-base font-semibold">
              {periodDays <= 90
                ? `Vizite pe zi — ${currentPeriodLabel}`
                : `Vizite pe lună — 12 luni`}
            </h2>
            <span className="text-xs text-muted-foreground">
              Total: <strong className="text-foreground">{totalViews30d}</strong>
            </span>
          </div>
          <div className="flex h-40 items-end gap-1">
            {chartPoints.map((p, i) => {
              const pct = (p.views / maxViews) * 100;
              return (
                <div
                  key={i}
                  className="group flex flex-1 flex-col items-center gap-1"
                >
                  <div className="relative h-full w-full">
                    <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
                      <div
                        className="w-full rounded-t-sm bg-gradient-to-t from-gold to-gold/40 transition-all group-hover:from-gold-dark"
                        style={{
                          height: `${pct}%`,
                          minHeight: p.views > 0 ? "3px" : "0",
                        }}
                      />
                    </div>
                    {p.views > 0 && (
                      <div className="absolute -top-5 left-1/2 -translate-x-1/2 rounded bg-card px-1.5 py-0.5 text-[10px] opacity-0 shadow transition-opacity group-hover:opacity-100">
                        {p.views}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[9px] text-muted-foreground">
            <span>{chartPoints[0]?.label}</span>
            <span>{chartPoints[Math.floor(chartPoints.length / 2)]?.label}</span>
            <span>{chartPoints[chartPoints.length - 1]?.label}</span>
          </div>
        </CardContent>
      </Card>

      {/* Traffic sources */}
      <Card>
        <CardContent className="p-5">
          <h2 className="mb-4 font-heading text-base font-semibold">
            Surse trafic (30 zile)
          </h2>
          {referrerBreakdown.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nicio sursă de trafic înregistrată încă.
            </p>
          ) : (
            <div className="space-y-3">
              {referrerBreakdown
                .sort((a, b) => b.count - a.count)
                .slice(0, 8)
                .map((r, i) => {
                  const cfg = classifyReferrer(r.referrer);
                  const Icon = cfg.Icon;
                  const pct =
                    totalRefCount > 0
                      ? Math.round((r.count / totalRefCount) * 100)
                      : 0;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/40",
                          cfg.color,
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="truncate text-sm font-medium">
                            {cfg.label}
                          </span>
                          <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                            {r.count} vizite · {pct}%
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-gold"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  subLabel,
  accent,
}: {
  icon: typeof Eye;
  label: string;
  value: string;
  subLabel?: string;
  accent: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <p className={cn("mt-1 font-heading text-3xl font-bold", accent)}>
              {value}
            </p>
            {subLabel && (
              <p className="mt-1 text-xs text-muted-foreground">{subLabel}</p>
            )}
          </div>
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg bg-accent/40", accent)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ComparisonCard({
  label,
  yourValue,
  averageValue,
  delta,
  deltaPct,
  showSign,
  higherIsBetter,
  neutral,
  suffix,
}: {
  label: string;
  yourValue: string;
  averageValue: string;
  delta: number | null;
  deltaPct?: number | null;
  showSign?: boolean;
  higherIsBetter?: boolean;
  neutral?: boolean;
  suffix?: string;
}) {
  const deltaRounded = delta !== null ? Number(delta.toFixed(1)) : null;
  const isPositive = deltaRounded !== null && deltaRounded > 0;
  const isNegative = deltaRounded !== null && deltaRounded < 0;
  const isNeutral = deltaRounded === null || deltaRounded === 0;

  const isGood = neutral
    ? null
    : higherIsBetter
      ? isPositive
      : isNegative;

  const color = isNeutral
    ? "text-muted-foreground"
    : isGood === true
      ? "text-emerald-400"
      : isGood === false
        ? "text-red-400"
        : "text-muted-foreground";
  const Icon = isPositive ? TrendingUp : isNegative ? TrendingDown : MinusCircle;

  return (
    <div className="rounded-lg border border-border/40 bg-background/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-heading text-xl font-bold">{yourValue}</span>
        <span className="text-xs text-muted-foreground">
          vs media {averageValue}
        </span>
      </div>
      {delta !== null && (
        <div className={cn("mt-2 flex items-center gap-1 text-xs", color)}>
          <Icon className="h-3 w-3" />
          {showSign && isPositive && "+"}
          {deltaRounded}
          {suffix || ""}
          {deltaPct !== null && deltaPct !== undefined && Math.abs(deltaPct) > 0 && (
            <span className="text-muted-foreground">
              ({deltaPct > 0 ? "+" : ""}
              {deltaPct}%)
            </span>
          )}
        </div>
      )}
    </div>
  );
}
