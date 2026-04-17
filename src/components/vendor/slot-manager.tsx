"use client";

// Artist-facing editor for artist_availability_slots. Multiple slots per
// day are allowed (day-gig + evening-gig with different prices). Used
// inside the /dashboard/calendar "Sloturi & Prețuri" tab.

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Clock, Trash2, Loader2, CalendarDays } from "lucide-react";
import { CustomCalendar } from "@/components/public/custom-calendar";

type Slot = {
  id: number;
  artistId: number;
  date: string;
  startTime: string;
  endTime: string;
  price: number | null;
  note: string | null;
  isBooked: boolean;
};

export function SlotManager({ artistId }: { artistId: number }) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state for the add dialog.
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("23:00");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");

  // Fetch the next 6 months so the day list has real data to show.
  useEffect(() => {
    const today = new Date();
    const sixMonthsOut = new Date();
    sixMonthsOut.setMonth(today.getMonth() + 6);
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    fetch(
      `/api/availability-slots?artist_id=${artistId}&from=${fmt(today)}&to=${fmt(sixMonthsOut)}`,
      { cache: "no-store" },
    )
      .then((r) => (r.ok ? r.json() : { slots: [] }))
      .then((data) => setSlots(data.slots ?? []))
      .catch(() => setSlots([]))
      .finally(() => setLoading(false));
  }, [artistId]);

  function fmtDate(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  const selectedDateIso = selectedDate ? fmtDate(selectedDate) : null;
  const daySlots = slots
    .filter((s) => s.date === selectedDateIso)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  async function addSlot() {
    if (!selectedDateIso) {
      toast.error("Alege o dată mai întâi.");
      return;
    }
    if (startTime >= endTime) {
      toast.error("Ora de sfârșit trebuie să fie după cea de început.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/availability-slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selectedDateIso,
          startTime,
          endTime,
          price: price ? Number(price) : null,
          note: note || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Eroare la salvare.");
        return;
      }
      const data = await res.json();
      setSlots((prev) => [...prev, data.slot]);
      toast.success("Slot adăugat.");
      setAddOpen(false);
      setNote("");
      setPrice("");
    } finally {
      setSaving(false);
    }
  }

  async function removeSlot(slotId: number, isBooked: boolean) {
    if (isBooked) {
      if (!confirm("Acest slot e rezervat. Sigur vrei să îl ștergi?")) return;
    }
    try {
      const res = await fetch(`/api/availability-slots/${slotId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Eroare la ștergere.");
        return;
      }
      setSlots((prev) => prev.filter((s) => s.id !== slotId));
      toast.success("Slot șters.");
    } catch {
      toast.error("Eroare de rețea.");
    }
  }

  // Group upcoming slots by month so the artist can scan next few weeks.
  const upcoming = [...slots]
    .filter((s) => !s.isBooked)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    .slice(0, 20);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ─── Day selector & slot list ─────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Sloturi pe zi</CardTitle>
          <p className="text-xs text-muted-foreground">
            Alege o zi, apoi adaugă unul sau mai multe intervale cu preț.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <CustomCalendar
            value={selectedDate}
            onChange={setSelectedDate}
            placeholder="Alege o zi"
          />

          {selectedDateIso && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  {new Date(selectedDateIso).toLocaleDateString("ro-RO", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </p>
                <Button
                  size="sm"
                  onClick={() => setAddOpen(true)}
                  className="gap-1 bg-gold text-background hover:bg-gold-dark"
                >
                  <Plus className="h-3.5 w-3.5" /> Adaugă slot
                </Button>
              </div>

              {daySlots.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/40 py-6 text-center text-sm text-muted-foreground">
                  Nu ai sloturi pe această zi.
                </div>
              ) : (
                <div className="space-y-2">
                  {daySlots.map((s) => (
                    <div
                      key={s.id}
                      className={`flex items-center gap-3 rounded-lg border p-3 ${
                        s.isBooked
                          ? "border-destructive/30 bg-destructive/5"
                          : "border-success/30 bg-success/5"
                      }`}
                    >
                      <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          {s.startTime} – {s.endTime}
                          {s.isBooked && (
                            <span className="ml-2 text-xs text-destructive">REZERVAT</span>
                          )}
                        </p>
                        {s.note && (
                          <p className="text-xs text-muted-foreground truncate">
                            {s.note}
                          </p>
                        )}
                      </div>
                      {s.price != null && (
                        <span className="text-sm font-semibold text-gold">
                          {s.price}€
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeSlot(s.id, s.isBooked)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Șterge slot"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Upcoming list ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Următoarele sloturi libere</CardTitle>
          <p className="text-xs text-muted-foreground">
            Cele mai apropiate 20 sloturi neocupate din calendar.
          </p>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <CalendarDays className="mx-auto mb-2 h-6 w-6 opacity-40" />
              Nu ai sloturi libere în următoarele 6 luni.
            </div>
          ) : (
            <div className="space-y-1.5">
              {upcoming.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedDate(new Date(s.date + "T00:00:00"))}
                  className="flex w-full items-center gap-3 rounded-lg border border-border/30 px-3 py-2 text-left transition-colors hover:border-gold/40 hover:bg-accent/20"
                >
                  <span className="text-xs text-muted-foreground w-20 shrink-0">
                    {new Date(s.date).toLocaleDateString("ro-RO", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                  <span className="text-sm flex-1 truncate">
                    {s.startTime}–{s.endTime}
                    {s.note && <span className="text-muted-foreground"> · {s.note}</span>}
                  </span>
                  {s.price != null && (
                    <span className="text-sm font-semibold text-gold">{s.price}€</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Add Slot Dialog ───────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adaugă slot disponibil</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="start">Ora început</Label>
                <Input
                  id="start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="end">Ora sfârșit</Label>
                <Input
                  id="end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="price">Preț pentru acest interval (EUR)</Label>
              <Input
                id="price"
                type="number"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Ex: 200"
              />
              <p className="text-[11px] text-muted-foreground">
                Lasă gol pentru "preț la cerere".
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="note">Notă (opțional)</Label>
              <Textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Ex: Nunți, include echipament."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Anulează
            </Button>
            <Button
              disabled={saving}
              onClick={addSlot}
              className="bg-gold text-background hover:bg-gold-dark"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvează slot"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
