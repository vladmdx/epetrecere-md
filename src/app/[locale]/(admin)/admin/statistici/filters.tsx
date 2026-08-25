"use client";

/**
 * The filter row for /admin/statistici.
 *
 * State lives in the URL, so a filtered view is a link an admin can bookmark
 * or paste to someone else, and the page stays a server component that runs
 * its queries with the layout's admin guard already applied.
 */

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Loader2, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { ro } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { DateBasis, VendorFilter } from "@/lib/db/queries/admin-stats";

export interface FilterState {
  from: string;
  to: string;
  vendor: VendorFilter;
  categoryId: number | null;
  basis: DateBasis;
}

/** Ranges an admin actually asks for, rather than a generic date picker. */
const PRESETS: { key: string; label: string; days: number }[] = [
  { key: "30", label: "30 zile", days: 30 },
  { key: "90", label: "90 zile", days: 90 },
  { key: "365", label: "12 luni", days: 365 },
];

function iso(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function StatsFilters({
  value,
  categories,
}: {
  value: FilterState;
  categories: { id: number; name: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>({
    from: new Date(`${value.from}T00:00:00`),
    to: new Date(`${value.to}T00:00:00`),
  });

  function push(patch: Partial<Record<string, string | null>>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    startTransition(() => {
      const q = next.toString();
      router.push(q ? `/admin/statistici?${q}` : "/admin/statistici");
    });
  }

  function applyPreset(days: number) {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days + 1);
    setRange({ from, to });
    push({ from: iso(from), to: iso(to) });
  }

  const rangeLabel = `${format(new Date(`${value.from}T00:00:00`), "d MMM yyyy", { locale: ro })} – ${format(new Date(`${value.to}T00:00:00`), "d MMM yyyy", { locale: ro })}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:border-gold/50"
        >
          <CalendarDays className="h-3.5 w-3.5 text-gold" />
          {rangeLabel}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          <Calendar
            mode="range"
            numberOfMonths={2}
            defaultMonth={range?.from}
            selected={range}
            onSelect={(r) => {
              setRange(r);
              if (r?.from && r?.to) {
                push({ from: iso(r.from), to: iso(r.to) });
                setOpen(false);
              }
            }}
            locale={ro}
          />
          <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border pt-2">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  applyPreset(p.days);
                  setOpen(false);
                }}
                className="rounded-md border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-gold/50 hover:text-foreground"
              >
                {p.label}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Select
        value={value.vendor}
        onValueChange={(v) => push({ vendor: v === "all" ? null : v })}
      >
        <SelectTrigger className="h-9 w-[132px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Toți furnizorii</SelectItem>
          <SelectItem value="artist">Doar artiști</SelectItem>
          <SelectItem value="venue">Doar săli</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={value.categoryId == null ? "all" : String(value.categoryId)}
        onValueChange={(v) => push({ categorie: v === "all" ? null : v })}
      >
        <SelectTrigger className="h-9 w-[168px] text-xs">
          <SelectValue placeholder="Toate categoriile" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Toate categoriile</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.basis}
        onValueChange={(v) => push({ dupa: v === "created" ? null : v })}
      >
        <SelectTrigger className="h-9 w-[168px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="created">După data cererii</SelectItem>
          <SelectItem value="event">După data evenimentului</SelectItem>
        </SelectContent>
      </Select>

      <Button
        variant="ghost"
        size="sm"
        className="h-9 gap-1.5 text-xs text-muted-foreground"
        onClick={() => startTransition(() => router.push("/admin/statistici"))}
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Resetează
      </Button>

      {pending && <Loader2 className="h-4 w-4 animate-spin text-gold" />}
    </div>
  );
}
