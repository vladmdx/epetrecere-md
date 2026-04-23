"use client";

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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  totalViews30d: number;
  chartPoints: ChartPoint[];
  referrerBreakdown: Referrer[];
  cityComparison: CityComparison;
}

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
  totalViews30d,
  chartPoints,
  referrerBreakdown,
  cityComparison,
}: Props) {
  const maxViews = Math.max(1, ...chartPoints.map((p) => p.views));
  const totalRefCount = referrerBreakdown.reduce((s, r) => s + r.count, 0);

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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">
          Performanța profilului public pentru <strong>{venue.nameRo}</strong>{" "}
          {venue.city && <>· {venue.city}</>}
        </p>
      </div>

      {/* Top stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          icon={Eye}
          label="Vizite profil (30 zile)"
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

      {/* Views chart */}
      <Card>
        <CardContent className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-heading text-base font-semibold">
              Vizite pe zi — ultimele 30 zile
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
