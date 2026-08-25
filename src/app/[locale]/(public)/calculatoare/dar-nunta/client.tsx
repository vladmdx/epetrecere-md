"use client";

// M10 Intern #2 — Wedding Gift Calculator (Feature 3).
// Heuristic based on real Moldovan wedding norms: the "dar" has to cover
// your plate + your partner/kids' plates and leave something for the couple.
// Baseline per-plate = venue tier; then multiply by attendees, then apply a
// relationship multiplier and a city-cost factor.

import { useMemo, useState } from "react";
import Link from "@/components/shared/locale-link";
import {
  Gift,
  Users,
  MapPin,
  Utensils,
  Heart,
  Info,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/hooks/use-locale";

type Relationship =
  | "colleague"
  | "friend"
  | "close_friend"
  | "cousin"
  | "sibling"
  | "nas";

type VenueTier = "modest" | "standard" | "premium" | "luxury";
type CityTier = "chisinau" | "regional" | "rural";

// Labels and descriptions live in the dictionaries under
// `calc.gift.rel.<id>` / `calc.gift.venue.<id>` / `calc.gift.city.<id>`;
// only the numbers stay here.
const RELATIONSHIPS: { id: Relationship; multiplier: number }[] = [
  { id: "colleague", multiplier: 1.0 },
  { id: "friend", multiplier: 1.2 },
  { id: "close_friend", multiplier: 1.4 },
  { id: "cousin", multiplier: 1.3 },
  { id: "sibling", multiplier: 1.6 },
  { id: "nas", multiplier: 2.5 },
];

// No static "≈X€/persoană" here: the calculator multiplies the plate by the
// city factor, so the effective figure is derived at render time instead.
const VENUE_TIERS: { id: VenueTier; plate: number }[] = [
  { id: "modest", plate: 25 },
  { id: "standard", plate: 45 },
  { id: "premium", plate: 70 },
  { id: "luxury", plate: 110 },
];

const CITY_TIERS: { id: CityTier; factor: number }[] = [
  { id: "chisinau", factor: 1.15 },
  { id: "regional", factor: 1.0 },
  { id: "rural", factor: 0.85 },
];

function formatEUR(n: number): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Math.round(n / 10) * 10); // Round to nearest 10€ for cleaner suggestions
}

export function DarNuntaClient() {
  const { t } = useLocale();
  const [relationship, setRelationship] = useState<Relationship>("friend");
  const [venue, setVenue] = useState<VenueTier>("standard");
  const [city, setCity] = useState<CityTier>("chisinau");
  const [attendees, setAttendees] = useState(2);
  const [children, setChildren] = useState(0);

  const result = useMemo(() => {
    const rel = RELATIONSHIPS.find((r) => r.id === relationship)!;
    const v = VENUE_TIERS.find((t) => t.id === venue)!;
    const c = CITY_TIERS.find((t) => t.id === city)!;

    // Adults cost full plate, children cost 50%.
    const plateCost = v.plate * attendees + v.plate * 0.5 * children;
    // Apply relationship multiplier (the "above-plate" contribution).
    const base = plateCost * rel.multiplier * c.factor;

    // Round ranges: minimum = plate coverage; typical = base; generous = base * 1.35.
    const minimum = plateCost * c.factor;
    const typical = base;
    const generous = base * 1.35;

    return {
      minimum,
      typical,
      generous,
      plateCost: plateCost * c.factor,
      rel,
      venue: v,
      city: c,
    };
  }, [relationship, venue, city, attendees, children]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 lg:px-8">
      {/* Breadcrumb */}
      <nav className="mb-4 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-gold">{t("nav.home")}</Link>
        <span className="mx-2">/</span>
        <Link href="/calculatoare" className="hover:text-gold">{t("tools.calculators")}</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{t("calc.gift.crumb")}</span>
      </nav>

      {/* Header */}
      <header className="mb-10 text-center">
        <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/10">
          <Gift className="h-8 w-8 text-gold" />
        </div>
        <h1 className="font-heading text-3xl font-bold md:text-4xl">
          {t("calc.gift.title")}
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
          {t("calc.gift.intro")}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* Form */}
        <div className="space-y-4">
          {/* Relationship */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Heart className="h-4 w-4 text-gold" /> {t("calc.gift.relTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {RELATIONSHIPS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRelationship(r.id)}
                  className={`w-full rounded-lg border p-3 text-left transition-all ${
                    relationship === r.id
                      ? "border-gold bg-gold/5"
                      : "border-border/40 hover:border-gold/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{t(`calc.gift.rel.${r.id}.label`)}</span>
                    {relationship === r.id && (
                      <span className="text-xs text-gold">✓</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t(`calc.gift.rel.${r.id}.desc`)}
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Venue tier */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Utensils className="h-4 w-4 text-gold" /> {t("calc.gift.venueTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {VENUE_TIERS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVenue(v.id)}
                  className={`rounded-lg border p-3 text-left transition-all ${
                    venue === v.id
                      ? "border-gold bg-gold/5"
                      : "border-border/40 hover:border-gold/40"
                  }`}
                >
                  <p className="text-sm font-medium">{t(`calc.gift.venue.${v.id}`)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("calc.gift.perPerson", {
                      amount: Math.round(
                        v.plate * (CITY_TIERS.find((c) => c.id === city)?.factor ?? 1),
                      ),
                    })}
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* City */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="h-4 w-4 text-gold" /> {t("calc.gift.cityTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-3">
              {CITY_TIERS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCity(c.id)}
                  className={`rounded-lg border p-3 text-center text-sm transition-all ${
                    city === c.id
                      ? "border-gold bg-gold/5 text-gold"
                      : "border-border/40 hover:border-gold/40"
                  }`}
                >
                  {t(`calc.gift.city.${c.id}`)}
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Attendees */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-gold" /> {t("calc.gift.attendeesTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">{t("calc.gift.adults")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={attendees}
                  onChange={(e) =>
                    setAttendees(Math.max(1, Number(e.target.value) || 1))
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{t("calc.gift.children")}</Label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={children}
                  onChange={(e) =>
                    setChildren(Math.max(0, Number(e.target.value) || 0))
                  }
                  className="mt-1"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Result */}
        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="border-gold/40 bg-gradient-to-br from-gold/10 to-transparent">
            <CardContent className="p-6">
              <p className="text-xs font-medium uppercase tracking-wider text-gold">
                {t("calc.gift.suggestion")}
              </p>
              <div className="mt-2 font-accent text-5xl font-bold">
                {formatEUR(result.typical)}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("calc.gift.typicalNote")}{" "}
                <strong>{formatEUR(result.plateCost)}</strong>.
              </p>

              <div className="mt-6 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg border border-border/40 bg-background p-3">
                  <p className="text-[10px] uppercase text-muted-foreground">{t("calc.gift.min")}</p>
                  <p className="mt-1 font-accent text-lg font-bold">
                    {formatEUR(result.minimum)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{t("calc.gift.minNote")}</p>
                </div>
                <div className="rounded-lg border border-gold bg-gold/10 p-3">
                  <p className="text-[10px] uppercase text-gold">{t("calc.gift.typical")}</p>
                  <p className="mt-1 font-accent text-lg font-bold text-gold">
                    {formatEUR(result.typical)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{t("calc.gift.typicalTag")}</p>
                </div>
                <div className="rounded-lg border border-border/40 bg-background p-3">
                  <p className="text-[10px] uppercase text-muted-foreground">{t("calc.gift.generous")}</p>
                  <p className="mt-1 font-accent text-lg font-bold">
                    {formatEUR(result.generous)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{t("calc.gift.generousNote")}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-4">
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
                {t("calc.gift.basis", {
                  venue: t(`calc.gift.venue.${result.venue.id}`).toLowerCase(),
                  plate: formatEUR(result.venue.plate),
                  guests: attendees + children * 0.5,
                  rel: t(`calc.gift.rel.${result.rel.id}.label`).toLowerCase(),
                  city: t(`calc.gift.city.${result.city.id}`).toLowerCase(),
                })}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("calc.gift.nasNote")}
              </p>
            </CardContent>
          </Card>

          <Link
            href="/planifica"
            className="flex items-center justify-center gap-2 rounded-xl border border-gold/40 bg-card p-4 text-sm font-medium text-gold hover:bg-gold/5"
          >
            {t("calc.gift.cta")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
