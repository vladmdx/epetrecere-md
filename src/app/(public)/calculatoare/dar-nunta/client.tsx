"use client";

// M10 Intern #2 — Wedding Gift Calculator (Feature 3).
// Heuristic based on real Moldovan wedding norms: the "dar" has to cover
// your plate + your partner/kids' plates and leave something for the couple.
// Baseline per-plate = venue tier; then multiply by attendees, then apply a
// relationship multiplier and a city-cost factor.

import { useMemo, useState } from "react";
import Link from "next/link";
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

type Relationship =
  | "colleague"
  | "friend"
  | "close_friend"
  | "cousin"
  | "sibling"
  | "nas";

type VenueTier = "modest" | "standard" | "premium" | "luxury";
type CityTier = "chisinau" | "regional" | "rural";

const RELATIONSHIPS: { id: Relationship; label: string; description: string; multiplier: number }[] = [
  { id: "colleague", label: "Coleg de serviciu / cunoscut", description: "Relație profesională sau cunoaștere ocazională", multiplier: 1.0 },
  { id: "friend", label: "Prieten apropiat", description: "Vă vedeți regulat, vă cunoașteți familiile", multiplier: 1.2 },
  { id: "close_friend", label: "Prieten foarte apropiat", description: "Prietenie de ani de zile, ca o familie", multiplier: 1.4 },
  { id: "cousin", label: "Rudă (văr, mătușă, etc.)", description: "Membru al familiei extinse", multiplier: 1.3 },
  { id: "sibling", label: "Rudă apropiată (frate, unchi)", description: "Familie apropiată", multiplier: 1.6 },
  { id: "nas", label: "Naș / cumătru", description: "Rol ceremonial — suma este mult mai mare", multiplier: 2.5 },
];

const VENUE_TIERS: { id: VenueTier; label: string; plate: number; description: string }[] = [
  { id: "modest", label: "Cantină / sală modestă", plate: 25, description: "≈25€ / persoană" },
  { id: "standard", label: "Restaurant standard", plate: 45, description: "≈45€ / persoană" },
  { id: "premium", label: "Restaurant premium", plate: 70, description: "≈70€ / persoană" },
  { id: "luxury", label: "Sală luxury / hotel 5★", plate: 110, description: "≈110€ / persoană" },
];

const CITY_TIERS: { id: CityTier; label: string; factor: number }[] = [
  { id: "chisinau", label: "Chișinău / Bălți", factor: 1.15 },
  { id: "regional", label: "Centru raional", factor: 1.0 },
  { id: "rural", label: "Sat / comună", factor: 0.85 },
];

function formatEUR(n: number): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Math.round(n / 10) * 10); // Round to nearest 10€ for cleaner suggestions
}

export function DarNuntaClient() {
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
        <Link href="/" className="hover:text-gold">Acasă</Link>
        <span className="mx-2">/</span>
        <Link href="/calculatoare" className="hover:text-gold">Calculatoare</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Dar de nuntă</span>
      </nav>

      {/* Header */}
      <header className="mb-10 text-center">
        <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/10">
          <Gift className="h-8 w-8 text-gold" />
        </div>
        <h1 className="font-heading text-3xl font-bold md:text-4xl">
          Cât să dau dar la nuntă?
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
          Calculator specific pentru Moldova. Suma ar trebui să acopere costul
          farfuriei tale și să lase ceva pentru tinerii căsătoriți. Folosește
          estimările ca reper — nu sunt reguli bătute în cuie.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* Form */}
        <div className="space-y-4">
          {/* Relationship */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Heart className="h-4 w-4 text-gold" /> Relația cu mirii
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
                    <span className="text-sm font-medium">{r.label}</span>
                    {relationship === r.id && (
                      <span className="text-xs text-gold">✓</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {r.description}
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Venue tier */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Utensils className="h-4 w-4 text-gold" /> Tipul sălii / restaurantului
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
                  <p className="text-sm font-medium">{v.label}</p>
                  <p className="text-xs text-muted-foreground">{v.description}</p>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* City */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="h-4 w-4 text-gold" /> Unde este nunta
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
                  {c.label}
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Attendees */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-gold" /> Câți mergeți
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Adulți</Label>
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
                <Label className="text-xs text-muted-foreground">Copii</Label>
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
                Sugestia noastră
              </p>
              <div className="mt-2 font-accent text-5xl font-bold">
                {formatEUR(result.typical)}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Suma tipică pentru situația ta. Farfuria ta costă aproximativ{" "}
                <strong>{formatEUR(result.plateCost)}</strong>.
              </p>

              <div className="mt-6 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg border border-border/40 bg-background p-3">
                  <p className="text-[10px] uppercase text-muted-foreground">Minim</p>
                  <p className="mt-1 font-accent text-lg font-bold">
                    {formatEUR(result.minimum)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">doar farfuria</p>
                </div>
                <div className="rounded-lg border border-gold bg-gold/10 p-3">
                  <p className="text-[10px] uppercase text-gold">Tipic</p>
                  <p className="mt-1 font-accent text-lg font-bold text-gold">
                    {formatEUR(result.typical)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">recomandat</p>
                </div>
                <div className="rounded-lg border border-border/40 bg-background p-3">
                  <p className="text-[10px] uppercase text-muted-foreground">Generos</p>
                  <p className="mt-1 font-accent text-lg font-bold">
                    {formatEUR(result.generous)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">cadou mare</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-4">
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
                Calculul se bazează pe: {result.venue.label.toLowerCase()}{" "}
                ({formatEUR(result.venue.plate)} / plat) × {attendees + children * 0.5}{" "}
                invitați × multiplicator &quot;{result.rel.label.toLowerCase()}&quot;{" "}
                × zonă {result.city.label.toLowerCase()}.
              </p>
              <p className="text-xs text-muted-foreground">
                Dacă ești naș sau cumătru, suma reală este adesea mult mai
                mare — include și cheltuielile ceremoniale (lumânare, tort,
                daruri).
              </p>
            </CardContent>
          </Card>

          <Link
            href="/planifica"
            className="flex items-center justify-center gap-2 rounded-xl border border-gold/40 bg-card p-4 text-sm font-medium text-gold hover:bg-gold/5"
          >
            Planifici propria nuntă?
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
