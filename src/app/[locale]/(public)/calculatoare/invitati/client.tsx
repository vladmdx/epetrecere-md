"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calculateGuests } from "@/lib/calculators";
import { Users, Utensils, Baby, Car, Droplet } from "lucide-react";
import { useLocale } from "@/hooks/use-locale";
import { NOUNS, plural } from "@/lib/i18n/plural";

export function GuestCalculatorClient() {
  const { locale, t } = useLocale();
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
    { key: "expected", value: result.expectedAttendance, icon: Users },
    { key: "tables", value: result.tablesNeeded, icon: Utensils },
    { key: "emptySeats", value: result.emptySeatsLastTable, icon: Baby },
    { key: "bathrooms", value: result.bathroomsNeeded, icon: Droplet },
    { key: "waiters", value: result.waitersNeeded, icon: Users },
    { key: "parking", value: result.parkingNeeded, icon: Car },
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
      <div className="space-y-6">
        <div className="rounded-xl border border-border/40 bg-card p-5">
          <h2 className="mb-4 font-heading text-lg font-semibold">{t("calc.guests.detailsTitle")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>{t("calc.guests.totalGuests")}</Label>
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
              <Label>{t("calc.guests.seatsPerTable")}</Label>
              <Select
                value={String(seatsPerTable)}
                onValueChange={(v) => setSeatsPerTable(Number(v))}
              >
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="6">{t("calc.guests.seats6")}</SelectItem>
                  <SelectItem value="8">{t("calc.guests.seats8")}</SelectItem>
                  <SelectItem value="10">{t("calc.guests.seats10")}</SelectItem>
                  <SelectItem value="12">{t("calc.guests.seats12")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("calc.guests.noShowRate")}</Label>
              <Input
                type="number"
                min={0}
                max={40}
                value={noShowRate}
                onChange={(e) => setNoShowRate(Number(e.target.value) || 0)}
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t("calc.guests.noShowHint")}
              </p>
            </div>
            <div>
              <Label>{t("calc.guests.headTableSeats")}</Label>
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
          <h2 className="mb-2 font-heading text-lg font-semibold">{t("calc.guests.methodTitle")}</h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• {t("calc.guests.method.attendance")}</li>
            <li>• {t("calc.guests.method.tables")}</li>
            <li>• {t("calc.guests.method.bathrooms")}</li>
            <li>• {t("calc.guests.method.waiters")}</li>
            <li>• {t("calc.guests.method.parking")}</li>
          </ul>
        </div>
      </div>

      <aside className="lg:sticky lg:top-20 self-start">
        <div className="overflow-hidden rounded-2xl border border-gold/30 bg-card">
          <div className="bg-gold/10 p-5 text-center">
            <Users className="mx-auto mb-2 h-6 w-6 text-gold" />
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {t("calc.guests.expectedAttendance")}
            </p>
            <p className="mt-1 font-heading text-3xl font-bold text-gold">
              {result.expectedAttendance}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("calc.guests.outOf", { count: plural(guestCount, locale, NOUNS.guests) })}
            </p>
          </div>
          <div className="divide-y divide-border/40">
            {stats.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.key} className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <Icon className="h-5 w-5 text-gold" />
                  </div>
                  <div className="flex-1 text-sm">{t(`calc.guests.stats.${s.key}`)}</div>
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
