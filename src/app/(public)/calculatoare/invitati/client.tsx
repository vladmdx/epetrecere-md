"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calculateGuests } from "@/lib/calculators";
import { Users, Utensils, Baby, Car, Droplet } from "lucide-react";

export function GuestCalculatorClient() {
  const [guestCount, setGuestCount] = useState(120);
  const [seatsPerTable, setSeatsPerTable] = useState(10);
  const [noShowRate, setNoShowRate] = useState(10);
  const [headTableSeats, setHeadTableSeats] = useState(4);

  const result = useMemo(
    () =>
      calculateGuests({
        guestCount,
        seatsPerTable,
        noShowRate: noShowRate / 100,
        headTableSeats,
      }),
    [guestCount, seatsPerTable, noShowRate, headTableSeats],
  );

  const stats = [
    { label: "Invitați confirmați estimați", value: result.expectedAttendance, icon: Users },
    { label: "Mese necesare", value: result.tablesNeeded, icon: Utensils },
    { label: "Locuri libere la ultima masă", value: result.emptySeatsLastTable, icon: Baby },
    { label: "Băi necesare", value: result.bathroomsNeeded, icon: Droplet },
    { label: "Ospătari recomandați", value: result.waitersNeeded, icon: Users },
    { label: "Locuri de parcare", value: result.parkingNeeded, icon: Car },
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
      <div className="space-y-6">
        <div className="rounded-xl border border-border/40 bg-card p-5">
          <h2 className="mb-4 font-heading text-lg font-semibold">Detalii</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Număr total invitați</Label>
              <Input
                type="number"
                min={10}
                max={2000}
                value={guestCount}
                onChange={(e) => setGuestCount(Number(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Locuri la masă</Label>
              <Select
                value={String(seatsPerTable)}
                onValueChange={(v) => setSeatsPerTable(Number(v))}
              >
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="6">6 locuri</SelectItem>
                  <SelectItem value="8">8 locuri</SelectItem>
                  <SelectItem value="10">10 locuri (standard)</SelectItem>
                  <SelectItem value="12">12 locuri</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Rata de absențe (%)</Label>
              <Input
                type="number"
                min={0}
                max={40}
                value={noShowRate}
                onChange={(e) => setNoShowRate(Number(e.target.value) || 0)}
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Media în Moldova: 8–12% nu confirmă prezența la ultimul moment.
              </p>
            </div>
            <div>
              <Label>Locuri la masa principală (mirii)</Label>
              <Input
                type="number"
                min={0}
                max={20}
                value={headTableSeats}
                onChange={(e) => setHeadTableSeats(Number(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border/40 bg-card p-5">
          <h2 className="mb-2 font-heading text-lg font-semibold">Cum calculăm?</h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• Prezența reală = invitați × (1 − rata absențe)</li>
            <li>• Mese = ceil(locuri necesare / locuri per masă) + masa principală</li>
            <li>• Băi: minim 2, apoi 1 per 50 invitați (normă sanitară)</li>
            <li>• Ospătari: 1 per 15 invitați la dineu cu servire</li>
            <li>• Parcare: 1 loc per 3 invitați (presupune ride-sharing parțial)</li>
          </ul>
        </div>
      </div>

      <aside className="lg:sticky lg:top-20 self-start">
        <div className="overflow-hidden rounded-2xl border border-gold/30 bg-card">
          <div className="bg-gold/10 p-5 text-center">
            <Users className="mx-auto mb-2 h-6 w-6 text-gold" />
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Prezență estimată
            </p>
            <p className="mt-1 font-heading text-3xl font-bold text-gold">
              {result.expectedAttendance}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              din {guestCount} invitați
            </p>
          </div>
          <div className="divide-y divide-border/40">
            {stats.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <Icon className="h-5 w-5 text-gold" />
                  </div>
                  <div className="flex-1 text-sm">{s.label}</div>
                  <div className="font-heading text-xl font-semibold">{s.value}</div>
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  );
}
