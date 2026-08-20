"use client";

/**
 * Per-event pricing.
 *
 * Artists said the hourly grid does not match how they actually sell: a
 * photographer quotes one figure for a wedding and another for a christening,
 * each covering a typical event length, rather than an hourly rate. This
 * editor writes rows with pricing_mode='per_event' and an optional
 * event_type, alongside the hourly tiers in the same table.
 *
 * The average duration is informational — it tells the client roughly how
 * long the artist stays — and deliberately does not enter the hourly
 * resolver, so a "wedding, ~6h, 800 €" row never competes with a real 6-hour
 * hourly tier.
 */

import { useCallback, useEffect, useState } from "react";
import {
  CalendarHeart,
  Check,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatDuration } from "@/lib/pricing/resolve";
import { ALL_EVENT_TYPES, eventTypeLabel, type EventTypeKey } from "@/lib/events/normalize";
import { formatPrice } from "@/lib/format/price";

interface Row {
  id: number;
  nameRo: string | null;
  price: number | null;
  durationHours: number | null;
  durationMinutes: number | null;
  pricingMode: string | null;
  eventType: string | null;
  isVisible: boolean;
}

interface Draft {
  eventType: string; // "" = any event type
  price: string;
  hours: string;
  minutes: string;
  nameRo: string;
}

const EMPTY: Draft = {
  eventType: "wedding",
  price: "",
  hours: "",
  minutes: "",
  nameRo: "",
};

/** Sorted so the artist's list reads in the same order as the picker. */
const ORDER = new Map<string, number>(ALL_EVENT_TYPES.map((k, i) => [k, i]));

export function EventPricingManager({ artistId }: { artistId: number }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/artist-packages?artist_id=${artistId}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as Row[];
      setRows(
        data
          .filter((r) => r.pricingMode === "per_event")
          .sort(
            (a, b) =>
              (ORDER.get(a.eventType ?? "") ?? 99) -
                (ORDER.get(b.eventType ?? "") ?? 99) ||
              (a.price ?? 0) - (b.price ?? 0),
          ),
      );
    } catch {
      toast.error("Nu s-au putut încărca prețurile per eveniment");
    } finally {
      setLoading(false);
    }
  }, [artistId]);

  useEffect(() => {
    void load();
  }, [load]);

  function parse(d: Draft) {
    const price = Number(d.price);
    if (!Number.isFinite(price) || price <= 0) {
      toast.error("Prețul trebuie să fie un număr pozitiv");
      return null;
    }
    const hours = d.hours === "" ? 0 : Number(d.hours.replace(",", "."));
    const minutes = d.minutes === "" ? 0 : Number(d.minutes);
    if (
      !Number.isFinite(hours) || hours < 0 || hours > 24 ||
      !Number.isFinite(minutes) || minutes < 0 || minutes > 59
    ) {
      toast.error("Durata medie trebuie completată corect (ore 0–24, minute 0–59)");
      return null;
    }
    if (hours === 0 && minutes === 0) {
      toast.error("Completează durata medie a evenimentului");
      return null;
    }
    return {
      price: Math.round(price),
      durationHours: Math.floor(hours),
      durationMinutes: minutes + Math.round((hours - Math.floor(hours)) * 60),
      eventType: d.eventType === "" ? null : d.eventType,
    };
  }

  function defaultName(eventType: string | null): string {
    return eventType
      ? eventTypeLabel(eventType as EventTypeKey)
      : "Orice eveniment";
  }

  async function create() {
    const p = parse(draft);
    if (!p) return;
    setSaving(true);
    try {
      const res = await fetch("/api/artist-packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artistId,
          nameRo: draft.nameRo.trim() || defaultName(p.eventType),
          price: p.price,
          durationHours: p.durationHours,
          durationMinutes: p.durationMinutes,
          pricingMode: "per_event",
          eventType: p.eventType,
          scope: "base",
          isVisible: true,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Preț adăugat");
      setDraft(EMPTY);
      setAdding(false);
      await load();
    } catch {
      toast.error("Nu s-a putut salva prețul");
    } finally {
      setSaving(false);
    }
  }

  async function update(id: number) {
    const p = parse(editDraft);
    if (!p) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/artist-packages/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nameRo: editDraft.nameRo.trim() || defaultName(p.eventType),
          price: p.price,
          durationHours: p.durationHours,
          durationMinutes: p.durationMinutes,
          pricingMode: "per_event",
          eventType: p.eventType,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Preț actualizat");
      setEditingId(null);
      await load();
    } catch {
      toast.error("Nu s-a putut salva modificarea");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("Sigur ștergi acest preț?")) return;
    try {
      const res = await fetch(`/api/artist-packages/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Preț șters");
      await load();
    } catch {
      toast.error("Nu s-a putut șterge");
    }
  }

  function startEdit(row: Row) {
    setAdding(false);
    setEditingId(row.id);
    setEditDraft({
      eventType: row.eventType ?? "",
      price: String(row.price ?? ""),
      hours: String(row.durationHours ?? 0),
      minutes: String(row.durationMinutes ?? 0),
      nameRo: row.nameRo ?? "",
    });
  }

  const form = (
    d: Draft,
    setD: (x: Draft) => void,
    onSave: () => void,
    onCancel: () => void,
  ) => (
    <div className="space-y-3 rounded-lg border border-gold/30 bg-gold/5 p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-1">
          <Label className="text-xs">Tip eveniment *</Label>
          <select
            value={d.eventType}
            onChange={(e) => setD({ ...d, eventType: e.target.value })}
            className="mt-1 flex h-10 w-full rounded-md border border-border/50 bg-background px-3 text-sm"
          >
            {ALL_EVENT_TYPES.map((k) => (
              <option key={k} value={k}>
                {eventTypeLabel(k)}
              </option>
            ))}
            <option value="">Orice eveniment</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">Preț fix (€) *</Label>
          <Input
            type="number"
            min="1"
            value={d.price}
            onChange={(e) => setD({ ...d, price: e.target.value })}
            placeholder="800"
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">Durată medie — ore *</Label>
          <Input
            type="number"
            min="0"
            max="24"
            value={d.hours}
            onChange={(e) => setD({ ...d, hours: e.target.value })}
            placeholder="6"
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">…și minute</Label>
          <Input
            type="number"
            min="0"
            max="59"
            step="5"
            value={d.minutes}
            onChange={(e) => setD({ ...d, minutes: e.target.value })}
            placeholder="0"
            className="mt-1"
          />
        </div>
      </div>
      <div>
        <Label className="text-xs">Nume afișat (opțional)</Label>
        <Input
          value={d.nameRo}
          onChange={(e) => setD({ ...d, nameRo: e.target.value })}
          placeholder="Ex: Pachet nuntă complet"
          className="mt-1"
          maxLength={120}
        />
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={onSave}
          disabled={saving}
          className="gap-1.5 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Salvează
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={saving}>
          <X className="h-3.5 w-3.5" /> Anulează
        </Button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border/40 bg-card py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/40 bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarHeart className="h-4 w-4 text-rose-400" />
          <h3 className="font-heading text-base font-bold text-rose-400">
            Preț per eveniment
          </h3>
          {rows.length === 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              Opțional
            </span>
          )}
        </div>
        {!adding && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditingId(null);
              setDraft(EMPTY);
              setAdding(true);
            }}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Adaugă preț
          </Button>
        )}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Un preț fix pentru tot evenimentul, separat pe tip: de exemplu 800 € la
        nuntă și 500 € la botez. Durata medie spune clientului cât stai, dar nu
        se facturează pe oră — pentru tarif orar folosește secțiunile de mai
        jos.
      </p>

      {adding && <div className="mt-4">{form(draft, setDraft, create, () => setAdding(false))}</div>}

      {rows.length > 0 && (
        <div className="mt-3 space-y-2">
          {rows.map((row) => {
            if (editingId === row.id) {
              return (
                <div key={row.id}>
                  {form(editDraft, setEditDraft, () => update(row.id), () =>
                    setEditingId(null),
                  )}
                </div>
              );
            }
            const totalMin =
              (row.durationHours ?? 0) * 60 + (row.durationMinutes ?? 0);
            return (
              <div
                key={row.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border/40 bg-background/40 px-4 py-3 transition-colors hover:border-gold/30"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-400/10 text-rose-400">
                    <CalendarHeart className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-heading text-base font-bold">
                      {row.eventType
                        ? eventTypeLabel(row.eventType as EventTypeKey)
                        : "Orice eveniment"}
                      {row.price != null && (
                        <span className="ml-2 text-gold">
                          {formatPrice(row.price)}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {totalMin > 0 && <>~{formatDuration(totalMin)} în medie</>}
                      {row.nameRo && totalMin > 0 && <span> · </span>}
                      {row.nameRo}
                    </p>
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => startEdit(row)}
                    className="gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editează
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove(row.id)}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
