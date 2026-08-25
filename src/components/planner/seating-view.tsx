"use client";

// Seating planner — drag & drop guests onto tables, quick-add shape buttons,
// auto-assignment by group, color-coded table fill states.

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Loader2,
  UtensilsCrossed,
  UserMinus,
  Circle,
  Square,
  RectangleHorizontal,
  Search,
  Sparkles,
  Printer,
  Users,
  Settings2,
} from "lucide-react";
import type { Guest } from "./guests-view";
import { cn } from "@/lib/utils";
import { useLocale } from "@/hooks/use-locale";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export interface SeatingTable {
  id: number;
  name: string;
  seats: number;
  posX: number | null;
  posY: number | null;
  sortOrder: number | null;
}

export interface SeatAssignment {
  id: number;
  tableId: number;
  guestId: number;
  seatNumber: number | null;
}

interface Props {
  planId: number;
  guests: Guest[];
  tables: SeatingTable[];
  seats: SeatAssignment[];
  onTablesChange: (tables: SeatingTable[]) => void;
  onSeatsChange: (seats: SeatAssignment[]) => void;
}

type TableShape = "round" | "rectangular" | "long";

/** `nameBase` is deliberately NOT translated: it is written to the database as
 *  the table's name, so it has to stay stable whatever language the planner
 *  happens to be using. Only `labelKey`/`shortKey` are shown in the UI. */
const SHAPE_CONFIG: Record<
  TableShape,
  { labelKey: string; shortKey: string; nameBase: string; seats: number; icon: typeof Circle }
> = {
  round: {
    labelKey: "cabinet.seating.shapes.round",
    shortKey: "cabinet.seating.shapesShort.round",
    nameBase: "Rotundă",
    seats: 10,
    icon: Circle,
  },
  rectangular: {
    labelKey: "cabinet.seating.shapes.rectangular",
    shortKey: "cabinet.seating.shapesShort.rectangular",
    nameBase: "Dreptunghiulară",
    seats: 8,
    icon: Square,
  },
  long: {
    labelKey: "cabinet.seating.shapes.long",
    shortKey: "cabinet.seating.shapesShort.long",
    nameBase: "Masa de Onoare",
    seats: 14,
    icon: RectangleHorizontal,
  },
};

const GROUP_LABEL_KEYS: Record<string, string> = {
  bride: "cabinet.seating.groups.bride",
  groom: "cabinet.seating.groups.groom",
  family: "cabinet.seating.groups.family",
  friends: "cabinet.seating.groups.friends",
  work: "cabinet.seating.groups.work",
  other: "cabinet.seating.groups.other",
};

const GROUP_COLORS: Record<string, string> = {
  bride: "bg-pink-500/15 text-pink-300 border-pink-500/30",
  groom: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  family: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  friends: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  work: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  other: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

export function SeatingView({
  planId,
  guests,
  tables,
  seats,
  onTablesChange,
  onSeatsChange,
}: Props) {
  const { t } = useLocale();
  const [adding, setAdding] = useState<TableShape | null>(null);
  const [search, setSearch] = useState("");
  const [autoPlacing, setAutoPlacing] = useState(false);
  const [dragGuest, setDragGuest] = useState<number | null>(null);
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customSeats, setCustomSeats] = useState("10");
  const [customShape, setCustomShape] = useState<TableShape>("round");
  const [addingCustom, setAddingCustom] = useState(false);

  const guestById = useMemo(() => {
    const m = new Map<number, Guest>();
    for (const g of guests) m.set(g.id, g);
    return m;
  }, [guests]);

  const assignedGuestIds = useMemo(
    () => new Set(seats.map((s) => s.guestId)),
    [seats],
  );

  // Only show confirmed or pending guests (decliners are hidden)
  const eligibleGuests = useMemo(
    () => guests.filter((g) => g.rsvp !== "declined"),
    [guests],
  );

  // Guests who actually confirmed RSVP — primary audience for seating
  const acceptedGuests = useMemo(
    () => guests.filter((g) => g.rsvp === "accepted"),
    [guests],
  );

  const unassigned = useMemo(() => {
    const list = eligibleGuests.filter((g) => !assignedGuestIds.has(g.id));
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter((g) => g.fullName.toLowerCase().includes(q));
  }, [eligibleGuests, assignedGuestIds, search]);

  const seatsByTable = useMemo(() => {
    const m = new Map<number, SeatAssignment[]>();
    for (const s of seats) {
      if (!m.has(s.tableId)) m.set(s.tableId, []);
      m.get(s.tableId)!.push(s);
    }
    return m;
  }, [seats]);

  const placedCount = seats.length;
  const totalGuests = guests.reduce(
    (sum, g) => sum + 1 + (g.plusOnes || 0),
    0,
  );
  const acceptedTotal = acceptedGuests.reduce(
    (sum, g) => sum + 1 + (g.plusOnes || 0),
    0,
  );
  const acceptedPct = totalGuests > 0 ? Math.round((acceptedTotal / totalGuests) * 100) : 0;
  const placedPct = acceptedTotal > 0 ? Math.round((placedCount / acceptedTotal) * 100) : 0;

  async function addTable(shape: TableShape) {
    const config = SHAPE_CONFIG[shape];
    const tableNumber = tables.length + 1;
    const name =
      shape === "long" ? config.nameBase : `${config.nameBase} ${tableNumber}`;
    setAdding(shape);
    try {
      const res = await fetch(`/api/event-plans/${planId}/tables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, seats: config.seats }),
      });
      if (!res.ok) {
        toast.error(t("cabinet.seating.err.addTable"));
        return;
      }
      const data = await res.json();
      onTablesChange([...tables, data.table]);
      toast.success(t("cabinet.seating.tableAdded", { name, seats: config.seats }));
    } catch {
      toast.error(t("cabinet.seating.err.addTable"));
    } finally {
      setAdding(null);
    }
  }

  async function addCustomTable() {
    const seatsNum = Number(customSeats);
    if (!customName.trim()) {
      toast.error(t("cabinet.seating.err.nameRequired"));
      return;
    }
    if (!Number.isFinite(seatsNum) || seatsNum < 1 || seatsNum > 30) {
      toast.error(t("cabinet.seating.err.seatsRange"));
      return;
    }
    setAddingCustom(true);
    try {
      const res = await fetch(`/api/event-plans/${planId}/tables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: customName.trim(), seats: seatsNum }),
      });
      if (!res.ok) {
        toast.error(t("cabinet.seating.err.addTable"));
        return;
      }
      const data = await res.json();
      onTablesChange([...tables, data.table]);
      toast.success(t("cabinet.seating.tableAdded", { name: customName, seats: seatsNum }));
      setCustomDialogOpen(false);
      setCustomName("");
      setCustomSeats("10");
      setCustomShape("round");
    } catch {
      toast.error(t("cabinet.seating.err.addTable"));
    } finally {
      setAddingCustom(false);
    }
  }

  async function renameTable(table: SeatingTable) {
    const newName = prompt(t("cabinet.seating.renamePrompt"), table.name);
    if (!newName || newName.trim() === table.name) return;
    const prev = tables;
    onTablesChange(tables.map((t) => (t.id === table.id ? { ...t, name: newName.trim() } : t)));
    const res = await fetch(`/api/event-plans/${planId}/tables/${table.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (!res.ok) {
      toast.error(t("cabinet.seating.err.rename"));
      onTablesChange(prev);
    }
  }

  async function deleteTable(table: SeatingTable) {
    if (!confirm(t("cabinet.seating.deleteConfirm", { name: table.name }))) return;
    const prev = { tables, seats };
    onTablesChange(tables.filter((t) => t.id !== table.id));
    onSeatsChange(seats.filter((s) => s.tableId !== table.id));
    const res = await fetch(`/api/event-plans/${planId}/tables/${table.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error(t("cabinet.seating.err.delete"));
      onTablesChange(prev.tables);
      onSeatsChange(prev.seats);
    }
  }

  async function assignGuest(guestId: number, tableId: number) {
    const table = tables.find((t) => t.id === tableId);
    if (!table) return;
    const current = seatsByTable.get(tableId)?.length ?? 0;
    if (current >= table.seats) {
      toast.error(t("cabinet.seating.err.tableFull", { name: table.name }));
      return;
    }
    const res = await fetch(`/api/event-plans/${planId}/seats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestId, tableId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || t("cabinet.seating.err.assign"));
      return;
    }
    const data = await res.json();
    const next = seats.filter((s) => s.guestId !== guestId).concat(data.assignment);
    onSeatsChange(next);
  }

  async function unassign(guestId: number) {
    const prev = seats;
    onSeatsChange(seats.filter((s) => s.guestId !== guestId));
    const res = await fetch(
      `/api/event-plans/${planId}/seats?guestId=${guestId}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      toast.error(t("cabinet.seating.err.release"));
      onSeatsChange(prev);
    }
  }

  // Auto-placement: group guests by their `group` field and fill tables sequentially
  async function autoPlace() {
    if (tables.length === 0) {
      toast.error(t("cabinet.seating.err.noTables"));
      return;
    }
    if (!confirm(t("cabinet.seating.autoConfirm"))) return;
    setAutoPlacing(true);
    try {
      const groupedUnassigned = new Map<string, Guest[]>();
      for (const g of unassigned) {
        const key = g.group || "other";
        if (!groupedUnassigned.has(key)) groupedUnassigned.set(key, []);
        groupedUnassigned.get(key)!.push(g);
      }

      const freeSeats = tables.map((t) => ({
        id: t.id,
        name: t.name,
        free: t.seats - (seatsByTable.get(t.id)?.length ?? 0),
      }));

      let assigned = 0;
      for (const [, guestList] of groupedUnassigned) {
        for (const guest of guestList) {
          const target = freeSeats.find((t) => t.free > 0);
          if (!target) break;
          const res = await fetch(`/api/event-plans/${planId}/seats`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ guestId: guest.id, tableId: target.id }),
          });
          if (res.ok) {
            const data = await res.json();
            seats.push(data.assignment);
            target.free -= 1;
            assigned += 1;
          }
        }
      }
      onSeatsChange([...seats]);
      toast.success(t("cabinet.seating.autoDone", { count: assigned }));
    } finally {
      setAutoPlacing(false);
    }
  }

  function exportSeatingPDF() {
    const tableRows = tables.map((table) => {
      const assigned = seats.filter((s) => s.tableId === table.id);
      const guestNames = assigned.map((s) => {
        const g = guests.find((gg) => gg.id === s.guestId);
        return g
          ? g.fullName + (g.plusOnes > 0 ? ` (+${g.plusOnes})` : "")
          : t("cabinet.seating.pdfGuestFallback", { id: s.guestId });
      });
      return `<div style="background:#fff;border:1px solid #ddd;border-radius:8px;padding:16px;break-inside:avoid;margin-bottom:16px">
        <h3 style="color:#A08839;margin:0 0 8px;font-size:16px">${table.name}</h3>
        <p style="color:#666;font-size:12px;margin:0 0 8px">${t("cabinet.seating.pdfSeats", { assigned: assigned.length, total: table.seats })}</p>
        ${guestNames.length > 0
          ? `<ul style="margin:0;padding-left:18px;font-size:13px">${guestNames.map((n) => `<li style="margin-bottom:2px">${n}</li>`).join("")}</ul>`
          : `<p style="color:#999;font-size:12px;font-style:italic">${t("cabinet.seating.pdfNoGuests")}</p>`}
      </div>`;
    });
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${t("cabinet.seating.pdfTitle")}</title>
      <style>body{font-family:system-ui,sans-serif;padding:40px;background:#fff;color:#222}
      h1{color:#A08839}h2{color:#666;font-size:14px;font-weight:normal}
      .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;margin-top:20px}
      @media print{@page{margin:20mm}}</style></head>
      <body><h1>${t("cabinet.seating.pdfTitle")}</h1><h2>ePetrecere.md · ${new Date().toLocaleDateString("ro-RO")} · ${t("cabinet.seating.pdfSummary", { placed: placedCount, total: totalGuests })}</h2>
      <div class="grid">${tableRows.join("")}</div></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400); }
  }

  // HTML5 Drag & Drop handlers
  function handleDragStart(guestId: number) {
    setDragGuest(guestId);
  }
  function handleDragEnd() {
    setDragGuest(null);
  }
  function handleDrop(tableId: number) {
    if (dragGuest !== null) {
      assignGuest(dragGuest, tableId);
      setDragGuest(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Progress bars — accepted RSVPs + seated */}
      <div className="rounded-xl border border-border/40 bg-card p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-gold" />
            <span className="font-medium">{t("cabinet.seating.progressTitle")}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={autoPlace}
              disabled={autoPlacing || unassigned.length === 0 || tables.length === 0}
              className="gap-1.5"
            >
              {autoPlacing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {t("cabinet.seating.autoSuggest")}
            </Button>
            {tables.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={exportSeatingPDF}
                className="gap-1.5 border-gold/30 text-gold hover:bg-gold/10"
              >
                <Printer className="h-3.5 w-3.5" /> {t("cabinet.seating.exportPrint")}
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {/* Bar 1: Accepted RSVPs */}
          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {t("cabinet.seating.confirmedLabel")}
              </span>
              <span className="font-medium">
                <strong>{acceptedTotal}</strong>
                <span className="text-muted-foreground"> {t("cabinet.seating.ofGuests", { total: totalGuests })}</span>
                <span className="ml-2 text-emerald-500">({acceptedPct}%)</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${acceptedPct}%` }}
              />
            </div>
          </div>

          {/* Bar 2: Seated from accepted */}
          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {t("cabinet.seating.seatedLabel")}
              </span>
              <span className="font-medium">
                <strong>{placedCount}</strong>
                <span className="text-muted-foreground"> {t("cabinet.seating.ofConfirmed", { total: acceptedTotal })}</span>
                <span className="ml-2 text-gold">({placedPct}%)</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-gold transition-all"
                style={{ width: `${placedPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Quick-add table shapes */}
      <div className="rounded-xl border border-border/40 bg-card p-4">
        <p className="mb-3 text-xs font-medium uppercase text-muted-foreground">
          {t("cabinet.seating.addTable")}
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(Object.keys(SHAPE_CONFIG) as TableShape[]).map((shape) => {
            const cfg = SHAPE_CONFIG[shape];
            const Icon = cfg.icon;
            return (
              <button
                key={shape}
                onClick={() => addTable(shape)}
                disabled={adding !== null}
                className="flex items-center gap-3 rounded-lg border border-border/40 bg-background/50 p-3 text-left transition-all hover:border-gold/40 hover:bg-gold/5 disabled:opacity-50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold/10 text-gold">
                  {adding === shape ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{t(cfg.labelKey)}</p>
                  <p className="text-xs text-muted-foreground">{t("cabinet.seating.seatsCount", { count: cfg.seats })}</p>
                </div>
                <Plus className="h-4 w-4 text-muted-foreground" />
              </button>
            );
          })}
          {/* Custom table */}
          <button
            onClick={() => setCustomDialogOpen(true)}
            disabled={adding !== null}
            className="flex items-center gap-3 rounded-lg border-2 border-dashed border-gold/40 bg-gold/5 p-3 text-left transition-all hover:border-gold/60 hover:bg-gold/10 disabled:opacity-50"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold/20 text-gold">
              <Settings2 className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{t("cabinet.seating.customTable")}</p>
              <p className="text-xs text-muted-foreground">{t("cabinet.seating.customTableHint")}</p>
            </div>
            <Plus className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Custom table dialog */}
      <Dialog open={customDialogOpen} onOpenChange={setCustomDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("cabinet.seating.customDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("cabinet.seating.customDialogDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="custom-name" className="text-xs">{t("cabinet.seating.nameLabel")}</Label>
              <Input
                id="custom-name"
                className="mt-1"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder={t("cabinet.seating.namePlaceholder")}
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs">{t("cabinet.seating.shapeLabel")}</Label>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {(Object.keys(SHAPE_CONFIG) as TableShape[]).map((shape) => {
                  const cfg = SHAPE_CONFIG[shape];
                  const Icon = cfg.icon;
                  const active = customShape === shape;
                  return (
                    <button
                      key={shape}
                      type="button"
                      onClick={() => setCustomShape(shape)}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition-all",
                        active
                          ? "border-gold bg-gold/10 text-gold"
                          : "border-border/40 hover:border-gold/30",
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-xs">{t(cfg.shortKey)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label htmlFor="custom-seats" className="text-xs">
                {t("cabinet.seating.seatsLabel")}
              </Label>
              <Input
                id="custom-seats"
                type="number"
                min="1"
                max="30"
                className="mt-1"
                value={customSeats}
                onChange={(e) => setCustomSeats(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCustomDialogOpen(false)}
              disabled={addingCustom}
            >
              {t("cabinet.seating.cancel")}
            </Button>
            <Button
              onClick={addCustomTable}
              disabled={addingCustom || !customName.trim()}
              className="bg-gold text-[#0D0D0D] hover:bg-gold-dark"
            >
              {addingCustom ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {t("cabinet.seating.addTableSubmit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        {/* Sidebar — unassigned guests */}
        <div className="rounded-xl border border-border/40 bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-heading text-base font-semibold">{t("cabinet.seating.guests")}</h3>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {unassigned.length}
            </span>
          </div>
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("cabinet.seating.searchPlaceholder")}
              className="h-8 pl-8 text-sm"
            />
          </div>
          {unassigned.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {search
                ? t("cabinet.seating.noResults")
                : t("cabinet.seating.allSeated")}
            </p>
          ) : (
            <ul className="max-h-[500px] space-y-1.5 overflow-y-auto pr-1">
              {unassigned.map((g) => {
                const groupColor = g.group ? GROUP_COLORS[g.group] : GROUP_COLORS.other;
                return (
                  <li
                    key={g.id}
                    draggable
                    onDragStart={() => handleDragStart(g.id)}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      "flex cursor-grab items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-all active:cursor-grabbing active:scale-95",
                      groupColor,
                      dragGuest === g.id && "opacity-50",
                    )}
                    title={t("cabinet.seating.dragHint", {
                      group: g.group ? (GROUP_LABEL_KEYS[g.group] ? t(GROUP_LABEL_KEYS[g.group]) : g.group) : "—",
                    })}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {g.fullName}
                      {g.plusOnes > 0 && ` +${g.plusOnes}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Main canvas — tables */}
        <div>
          {tables.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/40 bg-card py-16 text-center">
              <UtensilsCrossed className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-medium">{t("cabinet.seating.emptyTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("cabinet.seating.emptyHint")}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {tables.map((table) => {
                const assigned = seatsByTable.get(table.id) ?? [];
                const fillRatio = assigned.length / table.seats;
                const isEmpty = assigned.length === 0;
                const isFull = assigned.length >= table.seats;
                const isPartial = !isEmpty && !isFull;

                return (
                  <div
                    key={table.id}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(table.id)}
                    className={cn(
                      "rounded-xl border-2 bg-card p-4 transition-all",
                      isEmpty && "border-border/40",
                      isPartial && "border-amber-500/40 bg-amber-500/5",
                      isFull && "border-emerald-500/40 bg-emerald-500/5",
                      dragGuest !== null && "border-gold/60 shadow-lg shadow-gold/20",
                    )}
                  >
                    <div className="mb-3 flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <button
                          onClick={() => renameTable(table)}
                          className="text-left font-heading text-base font-semibold hover:text-gold"
                        >
                          {table.name}
                        </button>
                        <p
                          className={cn(
                            "text-xs",
                            isFull && "text-emerald-500",
                            isPartial && "text-amber-500",
                            isEmpty && "text-muted-foreground",
                          )}
                        >
                          {t("cabinet.seating.tableSeats", { assigned: assigned.length, total: table.seats })}
                          {isFull && t("cabinet.seating.fullSuffix")}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteTable(table)}
                        className="text-muted-foreground transition-colors hover:text-red-500"
                        aria-label={t("cabinet.seating.deleteTableAria")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Visual table representation */}
                    <div className="relative mb-3 flex h-20 items-center justify-center rounded-lg bg-muted/30">
                      <div
                        className={cn(
                          "rounded-full border-2 transition-all",
                          table.seats > 12 ? "h-12 w-20 rounded-lg" : "h-14 w-14",
                          isFull
                            ? "border-emerald-500 bg-emerald-500/20"
                            : isPartial
                              ? "border-amber-500 bg-amber-500/10"
                              : "border-muted-foreground/40 bg-muted/40",
                        )}
                      />
                      <div
                        className="absolute inset-0 flex items-center justify-center text-xs font-medium text-muted-foreground"
                        style={{ opacity: 0.8 }}
                      >
                        {Math.round(fillRatio * 100)}%
                      </div>
                    </div>

                    {/* Guest list */}
                    {assigned.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border/30 py-2 text-center text-xs text-muted-foreground">
                        {t("cabinet.seating.dropHere")}
                      </p>
                    ) : (
                      <ul className="space-y-1">
                        {assigned.map((s) => {
                          const g = guestById.get(s.guestId);
                          if (!g) return null;
                          const groupColor = g.group ? GROUP_COLORS[g.group] : GROUP_COLORS.other;
                          return (
                            <li
                              key={s.id}
                              className={cn(
                                "group flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-xs",
                                groupColor,
                              )}
                            >
                              <span className="truncate">
                                {g.fullName}
                                {g.plusOnes > 0 && ` +${g.plusOnes}`}
                              </span>
                              <button
                                onClick={() => unassign(g.id)}
                                className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500"
                                aria-label={t("cabinet.seating.removeGuestAria")}
                              >
                                <UserMinus className="h-3 w-3" />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
