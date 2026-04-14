"use client";

// M4 — Seating sub-view: create tables, assign guests, see who isn't
// seated yet. Minimal text-based layout (full drag canvas would be a
// follow-up). Honors table capacity via the API.

import { useMemo, useState } from "react";
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
import { toast } from "sonner";
import { Plus, Trash2, Loader2, UtensilsCrossed, UserMinus, Download } from "lucide-react";
import type { Guest } from "./guests-view";
import { cn } from "@/lib/utils";

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

export function SeatingView({
  planId,
  guests,
  tables,
  seats,
  onTablesChange,
  onSeatsChange,
}: Props) {
  const [tableName, setTableName] = useState("");
  const [tableSeats, setTableSeats] = useState("10");
  const [adding, setAdding] = useState(false);

  // Guest lookup by id + who's seated
  const guestById = useMemo(() => {
    const m = new Map<number, Guest>();
    for (const g of guests) m.set(g.id, g);
    return m;
  }, [guests]);

  const assignedGuestIds = useMemo(
    () => new Set(seats.map((s) => s.guestId)),
    [seats],
  );

  const unassigned = useMemo(
    () => guests.filter((g) => !assignedGuestIds.has(g.id) && g.rsvp !== "declined"),
    [guests, assignedGuestIds],
  );

  const seatsByTable = useMemo(() => {
    const m = new Map<number, SeatAssignment[]>();
    for (const s of seats) {
      if (!m.has(s.tableId)) m.set(s.tableId, []);
      m.get(s.tableId)!.push(s);
    }
    return m;
  }, [seats]);

  async function addTable() {
    if (tableName.trim().length < 1) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/event-plans/${planId}/tables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tableName.trim(),
          seats: Number(tableSeats) || 10,
        }),
      });
      if (!res.ok) {
        toast.error("Eroare la adăugare masă.");
        return;
      }
      const data = await res.json();
      onTablesChange([...tables, data.table]);
      setTableName("");
    } finally {
      setAdding(false);
    }
  }

  async function deleteTable(table: SeatingTable) {
    const prev = { tables, seats };
    onTablesChange(tables.filter((t) => t.id !== table.id));
    onSeatsChange(seats.filter((s) => s.tableId !== table.id));
    const res = await fetch(`/api/event-plans/${planId}/tables/${table.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Nu am putut șterge masa.");
      onTablesChange(prev.tables);
      onSeatsChange(prev.seats);
    }
  }

  async function assignGuest(guestId: number, tableId: number) {
    const res = await fetch(`/api/event-plans/${planId}/seats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestId, tableId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Nu am putut așeza invitatul.");
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
      toast.error("Nu am putut elibera locul.");
      onSeatsChange(prev);
    }
  }

  // C-40 — Export seating plan as PDF
  function exportSeatingPDF() {
    const tableRows = tables.map((table) => {
      const assigned = seats.filter((s) => s.tableId === table.id);
      const guestNames = assigned.map((s) => {
        const g = guests.find((gg) => gg.id === s.guestId);
        return g ? g.fullName : `Invitat #${s.guestId}`;
      });
      return `<div style="background:#1A1A2E;border:1px solid rgba(201,168,76,0.15);border-radius:12px;padding:16px;break-inside:avoid">
        <h3 style="color:#C9A84C;margin:0 0 8px;font-size:16px">${table.name}</h3>
        <p style="color:#A0A0B0;font-size:12px;margin:0 0 8px">${assigned.length}/${table.seats} locuri</p>
        ${guestNames.length > 0
          ? `<ul style="margin:0;padding-left:18px;color:#FAF8F2;font-size:13px">${guestNames.map((n) => `<li style="margin-bottom:2px">${n}</li>`).join("")}</ul>`
          : `<p style="color:#6B6B7B;font-size:12px;font-style:italic">Niciun invitat asignat</p>`}
      </div>`;
    });
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Plan Mese — ePetrecere.md</title>
      <style>body{font-family:system-ui,sans-serif;background:#0D0D0D;color:#FAF8F2;padding:40px}
      h1{color:#C9A84C}h2{color:#A0A0B0;font-size:14px;font-weight:normal}
      .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px;margin-top:20px}
      @media print{body{background:white;color:black}h3{color:#333}}</style></head>
      <body><h1>Plan Așezare Mese</h1><h2>ePetrecere.md — ${new Date().toLocaleDateString("ro-RO")} · ${unassigned.length} neasignați din ${guests.length} total</h2>
      <div class="grid">${tableRows.join("")}</div></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400); }
  }

  return (
    <div className="space-y-5">
      {/* Export button */}
      {tables.length > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" className="gap-2 border-gold/30 text-gold hover:bg-gold/10" onClick={exportSeatingPDF}>
            <Download className="h-4 w-4" /> Export PDF
          </Button>
        </div>
      )}
      {/* Add table */}
      <div className="rounded-xl border border-border/40 bg-card p-4">
        <p className="mb-3 text-xs font-medium uppercase text-muted-foreground">
          Adaugă masă
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1">
            <Label htmlFor="tname" className="text-xs">
              Nume masă
            </Label>
            <Input
              id="tname"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              placeholder="Masa 1 / Masa mirilor"
              onKeyDown={(e) => e.key === "Enter" && addTable()}
            />
          </div>
          <div>
            <Label htmlFor="tseats" className="text-xs">
              Locuri
            </Label>
            <Input
              id="tseats"
              type="number"
              min="2"
              max="30"
              value={tableSeats}
              onChange={(e) => setTableSeats(e.target.value)}
              className="w-24"
            />
          </div>
          <Button
            onClick={addTable}
            disabled={adding}
            className="gap-1 bg-gold text-background hover:bg-gold-dark"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Adaugă masă
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        {/* Unassigned column */}
        <div className="rounded-xl border border-border/40 bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-heading text-base font-semibold">Neașezați</h3>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {unassigned.length}
            </span>
          </div>
          {unassigned.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Toți invitații sunt la mese.
            </p>
          ) : (
            <ul className="space-y-2">
              {unassigned.map((g) => (
                <li
                  key={g.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border/20 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">{g.fullName}</span>
                  <Select onValueChange={(v) => assignGuest(g.id, Number(v))}>
                    <SelectTrigger className="h-8 w-[140px]">
                      <SelectValue placeholder="Așează la..." />
                    </SelectTrigger>
                    <SelectContent>
                      {tables.length === 0 ? (
                        <div className="p-2 text-xs text-muted-foreground">
                          Adaugă o masă mai întâi.
                        </div>
                      ) : (
                        tables.map((t) => {
                          const used = seatsByTable.get(t.id)?.length ?? 0;
                          const full = used >= t.seats;
                          return (
                            <SelectItem key={t.id} value={String(t.id)} disabled={full}>
                              {t.name} ({used}/{t.seats})
                            </SelectItem>
                          );
                        })
                      )}
                    </SelectContent>
                  </Select>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Tables grid */}
        <div className="grid gap-4 md:grid-cols-2">
          {tables.length === 0 ? (
            <div className="col-span-full rounded-xl border border-dashed border-border/40 bg-card py-12 text-center">
              <UtensilsCrossed className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Niciun aranjament încă. Adaugă prima masă deasupra.
              </p>
            </div>
          ) : (
            tables.map((table) => {
              const assigned = seatsByTable.get(table.id) ?? [];
              const full = assigned.length >= table.seats;
              return (
                <div
                  key={table.id}
                  className="rounded-xl border border-border/40 bg-card p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h3 className="font-heading text-base font-semibold">{table.name}</h3>
                      <p
                        className={cn(
                          "text-xs",
                          full ? "text-red-500" : "text-muted-foreground",
                        )}
                      >
                        {assigned.length} / {table.seats} locuri
                      </p>
                    </div>
                    <button
                      onClick={() => deleteTable(table)}
                      className="text-muted-foreground transition-colors hover:text-red-500"
                      aria-label="Șterge masa"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {assigned.length === 0 ? (
                    <p className="py-2 text-xs text-muted-foreground">
                      Nimeni la această masă.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {assigned.map((s) => {
                        const g = guestById.get(s.guestId);
                        if (!g) return null;
                        return (
                          <li
                            key={s.id}
                            className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1 text-xs"
                          >
                            <span className="truncate">
                              {g.fullName}
                              {g.plusOnes > 0 && ` +${g.plusOnes}`}
                            </span>
                            <button
                              onClick={() => unassign(g.id)}
                              className="text-muted-foreground transition-colors hover:text-red-500"
                              aria-label="Elibereză locul"
                            >
                              <UserMinus className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
