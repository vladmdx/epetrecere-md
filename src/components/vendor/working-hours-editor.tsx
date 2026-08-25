"use client";

// Weekly working-hours grid for venues. 7 rows (Mo..Su) each with an
// "Închis/Deschis" toggle and two time pickers. Emits the full object
// to the parent via onChange so the parent's Save button persists it
// alongside the rest of the venue fields.

import { useState } from "react";
import { Clock, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useLocale } from "@/hooks/use-locale";

export type DayHours = { open: string; close: string } | null;

export type WorkingHours = {
  mon: DayHours;
  tue: DayHours;
  wed: DayHours;
  thu: DayHours;
  fri: DayHours;
  sat: DayHours;
  sun: DayHours;
};

const DAY_KEYS: Array<keyof WorkingHours> = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];

const DAY_LABEL_KEYS: Record<keyof WorkingHours, string> = {
  mon: "vendorHours.dayMon",
  tue: "vendorHours.dayTue",
  wed: "vendorHours.dayWed",
  thu: "vendorHours.dayThu",
  fri: "vendorHours.dayFri",
  sat: "vendorHours.daySat",
  sun: "vendorHours.daySun",
};

const DEFAULT_OPEN = "10:00";
const DEFAULT_CLOSE = "22:00";

interface Props {
  value: WorkingHours | null;
  onChange: (next: WorkingHours) => void;
}

export function WorkingHoursEditor({ value, onChange }: Props) {
  const { t } = useLocale();
  const [draft, setDraft] = useState<WorkingHours>(
    value ?? {
      mon: null,
      tue: null,
      wed: null,
      thu: null,
      fri: null,
      sat: null,
      sun: null,
    },
  );

  function update(next: WorkingHours) {
    setDraft(next);
    onChange(next);
  }

  function toggleDay(key: keyof WorkingHours) {
    update({
      ...draft,
      [key]:
        draft[key] === null
          ? { open: DEFAULT_OPEN, close: DEFAULT_CLOSE }
          : null,
    });
  }

  function setOpenTime(key: keyof WorkingHours, open: string) {
    const day = draft[key];
    if (!day) return;
    update({ ...draft, [key]: { ...day, open } });
  }

  function setCloseTime(key: keyof WorkingHours, close: string) {
    const day = draft[key];
    if (!day) return;
    update({ ...draft, [key]: { ...day, close } });
  }

  /** "Duplică în toată săptămâna" — copies Monday's hours to Tue-Sun. */
  function copyToAllWeekdays() {
    const src = draft.mon;
    if (!src) return;
    update({
      mon: src,
      tue: { ...src },
      wed: { ...src },
      thu: { ...src },
      fri: { ...src },
      sat: draft.sat,
      sun: draft.sun,
    });
  }

  function setWeekendClosed() {
    update({ ...draft, sat: null, sun: null });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {t("vendorHours.hint")}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copyToAllWeekdays}
            disabled={!draft.mon}
            className="h-7 gap-1 text-xs"
          >
            <Copy className="h-3 w-3" />
            {t("vendorHours.copyWeekdays")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={setWeekendClosed}
            className="h-7 text-xs"
          >
            {t("vendorHours.weekendClosed")}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border/40 overflow-hidden">
        {DAY_KEYS.map((key, idx) => {
          const day = draft[key];
          const open = day !== null;
          return (
            <div
              key={key}
              className={
                idx % 2 === 0
                  ? "flex flex-wrap items-center gap-3 bg-muted/20 px-4 py-2.5"
                  : "flex flex-wrap items-center gap-3 px-4 py-2.5"
              }
            >
              <span className="w-20 shrink-0 text-sm font-medium">
                {t(DAY_LABEL_KEYS[key])}
              </span>
              <Switch checked={open} onCheckedChange={() => toggleDay(key)} />
              {open && day ? (
                <>
                  <Label htmlFor={`open-${key}`} className="text-xs text-muted-foreground">
                    {t("vendorHours.from")}
                  </Label>
                  <input
                    id={`open-${key}`}
                    type="time"
                    value={day.open}
                    onChange={(e) => setOpenTime(key, e.target.value)}
                    className="h-8 w-24 rounded-md border border-border/40 bg-background px-2 text-xs font-mono"
                  />
                  <Label htmlFor={`close-${key}`} className="text-xs text-muted-foreground">
                    {t("vendorHours.to")}
                  </Label>
                  <input
                    id={`close-${key}`}
                    type="time"
                    value={day.close}
                    onChange={(e) => setCloseTime(key, e.target.value)}
                    className="h-8 w-24 rounded-md border border-border/40 bg-background px-2 text-xs font-mono"
                  />
                </>
              ) : (
                <span className="text-xs text-muted-foreground">{t("vendorHours.closed")}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Compact human-readable summary for public display, e.g.
 *  "Lu-Vi 10:00-22:00 · Sâ-Du 10:00-24:00". Groups consecutive days
 *  with identical hours. */
export function formatWorkingHours(hours: WorkingHours | null): string {
  if (!hours) return "La cerere";
  const keys = DAY_KEYS;
  // Build runs of contiguous days with identical hours (or both null).
  const runs: Array<{ days: (keyof WorkingHours)[]; hours: DayHours }> = [];
  for (const k of keys) {
    const h = hours[k];
    const last = runs[runs.length - 1];
    const sameAsLast =
      last &&
      ((last.hours === null && h === null) ||
        (last.hours !== null &&
          h !== null &&
          last.hours.open === h.open &&
          last.hours.close === h.close));
    if (sameAsLast) {
      last.days.push(k);
    } else {
      runs.push({ days: [k], hours: h });
    }
  }
  const short: Record<keyof WorkingHours, string> = {
    mon: "Lu",
    tue: "Ma",
    wed: "Mi",
    thu: "Jo",
    fri: "Vi",
    sat: "Sâ",
    sun: "Du",
  };
  return runs
    .map((r) => {
      const range =
        r.days.length === 1
          ? short[r.days[0]]
          : `${short[r.days[0]]}-${short[r.days[r.days.length - 1]]}`;
      return r.hours
        ? `${range} ${r.hours.open}-${r.hours.close}`
        : `${range} închis`;
    })
    .join(" · ");
}
