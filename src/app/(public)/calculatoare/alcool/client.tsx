"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  calculateDrinks,
  EVENT_TYPE_LABELS,
  formatEUR,
  type EventType,
} from "@/lib/calculators";
import { Wine } from "lucide-react";

export function DrinksCalculatorClient() {
  const [eventType, setEventType] = useState<EventType>("wedding");
  const [guestCount, setGuestCount] = useState(100);
  const [drinkersRatio, setDrinkersRatio] = useState(80);
  const [durationHours, setDurationHours] = useState(6);

  const result = useMemo(
    () =>
      calculateDrinks({
        eventType,
        guestCount,
        drinkersRatio: drinkersRatio / 100,
        durationHours,
      }),
    [eventType, guestCount, drinkersRatio, durationHours],
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
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
                    <SelectItem key={k} value={k}>{EVENT_TYPE_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Număr invitați</Label>
              <Input
                type="number"
                min={10}
                value={guestCount}
                onChange={(e) => setGuestCount(Number(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>% invitați care consumă alcool</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={drinkersRatio}
                onChange={(e) => setDrinkersRatio(Number(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Durată eveniment (ore)</Label>
              <Input
                type="number"
                min={2}
                max={16}
                value={durationHours}
                onChange={(e) => setDurationHours(Number(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border/40 bg-card p-5">
          <h2 className="mb-4 font-heading text-lg font-semibold">Detaliere pe băuturi</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border/40">
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="pb-2">Băutură</th>
                  <th className="pb-2 text-right">Total ml</th>
                  <th className="pb-2 text-right">Sticle</th>
                  <th className="pb-2 text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {result.lines.map((line) => (
                  <tr key={line.key} className="border-b border-border/20">
                    <td className="py-2">{line.label}</td>
                    <td className="py-2 text-right text-muted-foreground">
                      {(line.totalMl / 1000).toFixed(1)} L
                    </td>
                    <td className="py-2 text-right font-medium">{line.bottles}</td>
                    <td className="py-2 text-right">{formatEUR(line.totalCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <aside className="lg:sticky lg:top-20 self-start">
        <div className="overflow-hidden rounded-2xl border border-gold/30 bg-card">
          <div className="bg-gold/10 p-5 text-center">
            <Wine className="mx-auto mb-2 h-6 w-6 text-gold" />
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Total sticle
            </p>
            <p className="mt-1 font-heading text-3xl font-bold text-gold">
              {result.totalBottles}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Cost estimativ: {formatEUR(result.totalCost)}
            </p>
          </div>
          <div className="divide-y divide-border/40">
            {result.lines.map((l) => (
              <div key={l.key} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.bottles} × {(l.bottleMl / 1000).toFixed(2)}L
                  </p>
                </div>
                <p className="text-sm font-semibold">{formatEUR(l.totalCost)}</p>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
