"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Heart,
  Users,
  Utensils,
  Camera,
  Music,
  Flower2,
  Gem,
  Car,
  Plane,
  Sparkles,
  ArrowRight,
  RotateCcw,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

// Moldovan wedding cost categories, with typical min/max ranges (EUR) for 2025.
interface Category {
  id: string;
  label: string;
  icon: typeof Heart;
  description: string;
  min: number;
  max: number;
  defaultValue: number;
  perGuest?: boolean;
}

const CATEGORIES: Category[] = [
  {
    id: "venue",
    label: "Sală & închiriere",
    icon: Heart,
    description: "Chirie sală + taxe suplimentare (aer condiționat, generator)",
    min: 500,
    max: 5000,
    defaultValue: 1500,
  },
  {
    id: "menu",
    label: "Meniu & servire",
    icon: Utensils,
    description: "Cost mâncare + băuturi + servire (pe invitat)",
    min: 25,
    max: 80,
    defaultValue: 45,
    perGuest: true,
  },
  {
    id: "bride_dress",
    label: "Rochia miresei",
    icon: Sparkles,
    description: "Rochie + accesorii + probe + curățătorie",
    min: 300,
    max: 3000,
    defaultValue: 900,
  },
  {
    id: "groom_suit",
    label: "Costum mire",
    icon: Gem,
    description: "Costum + pantofi + cămașă + accesorii",
    min: 150,
    max: 1200,
    defaultValue: 400,
  },
  {
    id: "rings",
    label: "Verighete & inele",
    icon: Gem,
    description: "Verighete + inel de logodnă",
    min: 200,
    max: 3000,
    defaultValue: 700,
  },
  {
    id: "photo_video",
    label: "Foto & Video",
    icon: Camera,
    description: "Fotograf + videograf + album + editare",
    min: 400,
    max: 3500,
    defaultValue: 1200,
  },
  {
    id: "music",
    label: "Muzică & MC",
    icon: Music,
    description: "Formație / DJ + moderator + sonorizare",
    min: 300,
    max: 3000,
    defaultValue: 1000,
  },
  {
    id: "decor",
    label: "Decor & Floristică",
    icon: Flower2,
    description: "Aranjamente florale + decor sală + buchete",
    min: 200,
    max: 2500,
    defaultValue: 800,
  },
  {
    id: "makeup",
    label: "Machiaj & coafură",
    icon: Sparkles,
    description: "Machiaj + coafură mireasă (+ cumătre opțional)",
    min: 80,
    max: 500,
    defaultValue: 180,
  },
  {
    id: "transport",
    label: "Transport & limuzină",
    icon: Car,
    description: "Limuzină sau mașină decorată + microbuz invitați",
    min: 100,
    max: 800,
    defaultValue: 250,
  },
  {
    id: "cake",
    label: "Tort de nuntă",
    icon: Heart,
    description: "Tort + dulciuri candy bar",
    min: 100,
    max: 600,
    defaultValue: 250,
  },
  {
    id: "invitations",
    label: "Invitații & papetărie",
    icon: Sparkles,
    description: "Invitații + save-the-date + meniu tipărit",
    min: 50,
    max: 500,
    defaultValue: 150,
  },
  {
    id: "honeymoon",
    label: "Lună de miere",
    icon: Plane,
    description: "Vacanță postnupțială (opțional)",
    min: 0,
    max: 5000,
    defaultValue: 1200,
  },
];

function formatEUR(n: number): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function WeddingCostCalculatorClient() {
  const [guestCount, setGuestCount] = useState(120);
  const [values, setValues] = useState<Record<string, number>>(
    Object.fromEntries(CATEGORIES.map((c) => [c.id, c.defaultValue])),
  );

  const rows = useMemo(
    () =>
      CATEGORIES.map((c) => {
        const raw = values[c.id] ?? 0;
        const total = c.perGuest ? raw * guestCount : raw;
        return { ...c, raw, total };
      }),
    [values, guestCount],
  );

  const grandTotal = rows.reduce((acc, r) => acc + r.total, 0);
  const totalMin = CATEGORIES.reduce(
    (acc, c) => acc + (c.perGuest ? c.min * guestCount : c.min),
    0,
  );
  const totalMax = CATEGORIES.reduce(
    (acc, c) => acc + (c.perGuest ? c.max * guestCount : c.max),
    0,
  );
  const costPerGuest = Math.round(grandTotal / Math.max(1, guestCount));

  function reset() {
    setGuestCount(120);
    setValues(
      Object.fromEntries(CATEGORIES.map((c) => [c.id, c.defaultValue])),
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      {/* Inputs */}
      <div className="space-y-5">
        <div className="rounded-xl border border-border/40 bg-card p-5">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-gold" />
            <div className="flex-1">
              <Label htmlFor="guests">Număr invitați</Label>
              <Input
                id="guests"
                type="number"
                min={1}
                value={guestCount}
                onChange={(e) =>
                  setGuestCount(Math.max(1, Number(e.target.value) || 0))
                }
                className="mt-2"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {rows.map((r) => {
            const Icon = r.icon;
            const pct = r.max > r.min ? ((r.raw - r.min) / (r.max - r.min)) * 100 : 0;
            return (
              <div
                key={r.id}
                className="rounded-xl border border-border/40 bg-card p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-medium">{r.label}</h3>
                      <span className="font-accent text-sm font-semibold text-gold">
                        {formatEUR(r.total)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {r.description}
                    </p>
                    <div className="mt-3 flex items-center gap-3">
                      <Input
                        type="number"
                        min={r.min}
                        max={r.max}
                        value={r.raw}
                        onChange={(e) =>
                          setValues((v) => ({
                            ...v,
                            [r.id]: Math.max(
                              r.min,
                              Math.min(r.max, Number(e.target.value) || 0),
                            ),
                          }))
                        }
                        className="w-24"
                      />
                      {r.perGuest && (
                        <span className="text-xs text-muted-foreground">
                          € / invitat
                        </span>
                      )}
                      <Progress value={pct} className="h-1.5 flex-1" />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Interval tipic: {formatEUR(r.min)} – {formatEUR(r.max)}
                      {r.perGuest ? " / invitat" : ""}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <Button variant="outline" onClick={reset} className="gap-2">
          <RotateCcw className="h-4 w-4" /> Resetează valorile
        </Button>
      </div>

      {/* Summary */}
      <aside className="space-y-4 lg:sticky lg:top-20 lg:h-fit">
        <div className="rounded-2xl border border-gold/30 bg-gradient-to-b from-gold/10 to-transparent p-6">
          <p className="text-xs font-medium uppercase tracking-widest text-gold">
            Total estimat
          </p>
          <p className="mt-2 font-accent text-4xl font-bold">
            {formatEUR(grandTotal)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatEUR(costPerGuest)} / invitat · {guestCount} invitați
          </p>
          <div className="mt-4 space-y-1 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Minim tipic:</span>
              <span className="font-medium text-foreground">
                {formatEUR(totalMin)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Maxim tipic:</span>
              <span className="font-medium text-foreground">
                {formatEUR(totalMax)}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/40 bg-card p-5">
          <h3 className="font-heading text-sm font-bold">Top 5 categorii</h3>
          <ul className="mt-3 space-y-2 text-xs">
            {[...rows]
              .sort((a, b) => b.total - a.total)
              .slice(0, 5)
              .map((r) => {
                const pct = grandTotal > 0 ? (r.total / grandTotal) * 100 : 0;
                return (
                  <li key={r.id}>
                    <div className="flex items-center justify-between">
                      <span>{r.label}</span>
                      <span className="font-medium text-foreground">
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                    <Progress value={pct} className="mt-1 h-1" />
                  </li>
                );
              })}
          </ul>
        </div>

        <div className="rounded-2xl border border-border/40 bg-card p-5">
          <p className="text-sm text-muted-foreground">
            Gata cu calculele? Găsește furnizorii potriviți pentru nunta ta.
          </p>
          <Link
            href="/chestionar"
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-medium text-background hover:bg-gold-dark"
          >
            Chestionar furnizori <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/planifica"
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Planifică eveniment <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </aside>
    </div>
  );
}
