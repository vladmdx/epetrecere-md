"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  calculateBudget,
  BUDGET_SERVICE_RATES,
  EVENT_TYPE_LABELS,
  formatEUR,
  type EventType,
} from "@/lib/calculators";
import { cn } from "@/lib/utils";
import { ArrowRight, Wallet } from "lucide-react";

export function BudgetCalculatorClient() {
  const [eventType, setEventType] = useState<EventType>("wedding");
  const [guestCount, setGuestCount] = useState(100);
  const [pricePerPerson, setPricePerPerson] = useState(30);
  const [venueRentalFee, setVenueRentalFee] = useState(0);
  const [services, setServices] = useState<string[]>([
    "singer",
    "mc",
    "dj",
    "photographer",
    "decor",
  ]);

  const result = useMemo(
    () =>
      calculateBudget({
        eventType,
        guestCount,
        pricePerPerson,
        venueRentalFee,
        services,
      }),
    [eventType, guestCount, pricePerPerson, venueRentalFee, services],
  );

  function toggleService(slug: string) {
    setServices((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
      {/* ── Input form ───────────────────────────────── */}
      <div className="space-y-6">
        <div className="rounded-xl border border-border/40 bg-card p-5">
          <h2 className="mb-4 font-heading text-lg font-semibold">Detalii eveniment</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Tip eveniment</Label>
              <Select value={eventType} onValueChange={(v) => setEventType(v as EventType)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(EVENT_TYPE_LABELS) as EventType[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {EVENT_TYPE_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Număr invitați</Label>
              <Input
                type="number"
                min={10}
                max={1000}
                value={guestCount}
                onChange={(e) => setGuestCount(Number(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Preț sală / persoană (€)</Label>
              <Input
                type="number"
                min={0}
                value={pricePerPerson}
                onChange={(e) => setPricePerPerson(Number(e.target.value) || 0)}
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Pune 0 dacă ai deja locația rezervată.
              </p>
            </div>
            <div>
              <Label>Chirie sală (€, opțional)</Label>
              <Input
                type="number"
                min={0}
                value={venueRentalFee}
                onChange={(e) => setVenueRentalFee(Number(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border/40 bg-card p-5">
          <h2 className="mb-4 font-heading text-lg font-semibold">Servicii dorite</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(BUDGET_SERVICE_RATES).map(([slug, rate]) => {
              const active = services.includes(slug);
              return (
                <button
                  key={slug}
                  type="button"
                  onClick={() => toggleService(slug)}
                  className={cn(
                    "rounded-lg border-2 p-3 text-left text-sm transition-all",
                    active
                      ? "border-gold bg-gold/10 text-gold font-medium"
                      : "border-border/40 hover:border-gold/30",
                  )}
                >
                  <div>{rate.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {rate.kind === "flat"
                      ? `~${rate.price}€`
                      : `~${rate.price}€/inv.`}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Result card ──────────────────────────────── */}
      <aside className="lg:sticky lg:top-20 self-start">
        <div className="overflow-hidden rounded-2xl border border-gold/30 bg-card">
          <div className="bg-gold/10 p-5 text-center">
            <Wallet className="mx-auto mb-2 h-6 w-6 text-gold" />
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Buget estimat</p>
            <p className="mt-1 font-heading text-3xl font-bold text-gold">
              {formatEUR(result.total)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Interval: {formatEUR(result.totalLow)} – {formatEUR(result.totalHigh)}
            </p>
          </div>
          <div className="max-h-[420px] overflow-y-auto divide-y divide-border/40">
            {result.items.length === 0 ? (
              <p className="p-5 text-center text-sm text-muted-foreground">
                Selectează servicii pentru a vedea detalierea.
              </p>
            ) : (
              result.items.map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.label}</p>
                    <div className="mt-1 h-1 overflow-hidden rounded bg-muted">
                      <div
                        className="h-full bg-gold"
                        style={{ width: `${item.percent}%` }}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold">{formatEUR(item.amount)}</p>
                    <p className="text-xs text-muted-foreground">{item.percent}%</p>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="border-t border-border/40 p-4">
            <Link href="/planifica">
              <Button className="w-full gap-2 bg-gold text-background hover:bg-gold-dark">
                Găsește vendori pentru acest buget <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </aside>
    </div>
  );
}
