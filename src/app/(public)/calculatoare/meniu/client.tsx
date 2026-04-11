"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  calculateMenu,
  EVENT_TYPE_LABELS,
  formatEUR,
  type EventType,
} from "@/lib/calculators";
import { Utensils } from "lucide-react";

export function MenuCalculatorClient() {
  const [eventType, setEventType] = useState<EventType>("wedding");
  const [guestCount, setGuestCount] = useState(100);
  const [includeSoup, setIncludeSoup] = useState(true);
  const [includeLateNight, setIncludeLateNight] = useState(false);

  const result = useMemo(
    () =>
      calculateMenu({
        eventType,
        guestCount,
        includeSoup,
        includeLateNight,
      }),
    [eventType, guestCount, includeSoup, includeLateNight],
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
      <div className="space-y-6">
        <div className="rounded-xl border border-border/40 bg-card p-5">
          <h2 className="mb-4 font-heading text-lg font-semibold">Detalii</h2>
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
          </div>
          <div className="mt-4 space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={includeSoup}
                onCheckedChange={(v) => setIncludeSoup(v === true)}
              />
              Include zeamă / supă (tradițional nuntă moldovenească)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={includeLateNight}
                onCheckedChange={(v) => setIncludeLateNight(v === true)}
              />
              Include gustare de noapte (kebab, frigărui)
            </label>
          </div>
        </div>

        <div className="rounded-xl border border-border/40 bg-card p-5">
          <h2 className="mb-4 font-heading text-lg font-semibold">Detaliere pe feluri</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border/40">
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="pb-2">Fel de mâncare</th>
                  <th className="pb-2 text-right">g/invitat</th>
                  <th className="pb-2 text-right">Total kg</th>
                  <th className="pb-2 text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {result.lines.map((line) => (
                  <tr key={line.key} className="border-b border-border/20">
                    <td className="py-2">{line.label}</td>
                    <td className="py-2 text-right text-muted-foreground">
                      {line.gramsPerGuest}
                    </td>
                    <td className="py-2 text-right font-medium">
                      {line.totalKg.toFixed(1)} kg
                    </td>
                    <td className="py-2 text-right">{formatEUR(line.totalCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Prețurile sunt indicative, pentru achiziție en-gros (Moldova 2025).
            Dacă lucrezi cu o sală care asigură tot meniul, verifică prețul pe persoană al acesteia.
          </p>
        </div>
      </div>

      <aside className="lg:sticky lg:top-20 self-start">
        <div className="overflow-hidden rounded-2xl border border-gold/30 bg-card">
          <div className="bg-gold/10 p-5 text-center">
            <Utensils className="mx-auto mb-2 h-6 w-6 text-gold" />
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Total mâncare</p>
            <p className="mt-1 font-heading text-3xl font-bold text-gold">
              {result.totalKg.toFixed(1)} kg
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
                    {l.totalKg.toFixed(1)} kg × {formatEUR(l.pricePerKg)}/kg
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
