"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Ban,
  Check,
  Loader2,
  Users,
  Clock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CalendarEvent {
  date: string;
  status: string;
  eventType: string | null;
  note: string | null;
  source: string | null;
}

interface Booking {
  id: number;
  eventDate: string;
  eventType: string | null;
  clientName: string;
  guestCount: number | null;
  agreedPrice: number | null;
  status: string;
  startTime: string | null;
  endTime: string | null;
}

interface Props {
  venueId: number;
  venueName: string;
  monthYear: number;
  monthIndex: number;
  events: CalendarEvent[];
  bookings: Booking[];
  initialDate: string | null;
}

const MONTHS_RO = [
  "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
  "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie",
];

const WEEKDAYS_RO = ["Lu", "Ma", "Mi", "Jo", "Vi", "Sâ", "Du"];

const EVENT_TYPE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  wedding: { label: "Nuntă", bg: "bg-red-500/25 border-red-500/60", text: "text-red-400" },
  nunta: { label: "Nuntă", bg: "bg-red-500/25 border-red-500/60", text: "text-red-400" },
  baptism: { label: "Botez", bg: "bg-blue-500/25 border-blue-500/60", text: "text-blue-400" },
  botez: { label: "Botez", bg: "bg-blue-500/25 border-blue-500/60", text: "text-blue-400" },
  cumatrie: { label: "Cumătrie", bg: "bg-cyan-500/25 border-cyan-500/60", text: "text-cyan-400" },
  corporate: { label: "Corporate", bg: "bg-purple-500/25 border-purple-500/60", text: "text-purple-400" },
  birthday: { label: "Aniversare", bg: "bg-orange-500/25 border-orange-500/60", text: "text-orange-400" },
  aniversare: { label: "Aniversare", bg: "bg-orange-500/25 border-orange-500/60", text: "text-orange-400" },
};

const TENTATIVE_STYLE = { label: "Tentativ", bg: "bg-yellow-500/25 border-yellow-500/60", text: "text-yellow-400" };

const STATUS_CONFIG: Record<string, { label: string; bg: string }> = {
  available: { label: "Disponibil", bg: "bg-emerald-500/20 border-emerald-500/50" },
  tentative: { label: "Tentativ", bg: "bg-yellow-500/20 border-yellow-500/50" },
  blocked: { label: "Blocat", bg: "bg-slate-500/25 border-slate-500/60" },
};

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Enumerate every ISO date string between start and end inclusive (dates already sorted). */
function enumerateRange(start: string, end: string): string[] {
  const a = start <= end ? start : end;
  const b = start <= end ? end : start;
  const out: string[] = [];
  const cur = new Date(a + "T00:00:00Z");
  const last = new Date(b + "T00:00:00Z");
  while (cur <= last) {
    out.push(
      `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, "0")}-${String(cur.getUTCDate()).padStart(2, "0")}`,
    );
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export function VenueCalendarClient({
  venueId,
  venueName,
  monthYear,
  monthIndex,
  events,
  bookings,
  initialDate,
}: Props) {
  const router = useRouter();
  const [dayDialog, setDayDialog] = useState<string | null>(initialDate);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [newStatus, setNewStatus] = useState<"available" | "blocked" | "tentative">(
    "available",
  );

  // Drag-select state
  const [dragStart, setDragStart] = useState<string | null>(null);
  const [dragEnd, setDragEnd] = useState<string | null>(null);
  const [rangeDialog, setRangeDialog] = useState<{ start: string; end: string } | null>(null);
  const [rangeStatus, setRangeStatus] = useState<"available" | "blocked" | "tentative">(
    "blocked",
  );
  const [rangeNote, setRangeNote] = useState("");

  // Build lookup maps
  const eventsByDate = useMemo(() => {
    const m = new Map<string, CalendarEvent>();
    for (const e of events) {
      const key = typeof e.date === "string" ? e.date.split("T")[0] : e.date;
      m.set(key, { ...e, date: key });
    }
    return m;
  }, [events]);

  const bookingsByDate = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const b of bookings) {
      const key = typeof b.eventDate === "string" ? b.eventDate.split("T")[0] : b.eventDate;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push({ ...b, eventDate: key });
    }
    return m;
  }, [bookings]);

  // Build grid
  const firstDay = new Date(monthYear, monthIndex, 1);
  const lastDay = new Date(monthYear, monthIndex + 1, 0);
  const firstWeekday = (firstDay.getDay() + 6) % 7; // Mon=0
  const daysInMonth = lastDay.getDate();
  const cells: Array<{ day: number | null; dateStr?: string }> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ day: null });
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, dateStr: toDateStr(monthYear, monthIndex, day) });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null });

  const today = new Date();
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  // Compute currently-highlighted drag range
  const dragRange = useMemo(() => {
    if (!dragStart || !dragEnd) return new Set<string>();
    return new Set(enumerateRange(dragStart, dragEnd));
  }, [dragStart, dragEnd]);

  // Release drag on pointer-up anywhere (guards against mouseup outside grid)
  useEffect(() => {
    function onUp() {
      if (dragStart && dragEnd && dragStart !== dragEnd) {
        setRangeDialog({
          start: dragStart <= dragEnd ? dragStart : dragEnd,
          end: dragStart <= dragEnd ? dragEnd : dragStart,
        });
        setRangeStatus("blocked");
        setRangeNote("");
      }
      setDragStart(null);
      setDragEnd(null);
    }
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
  }, [dragStart, dragEnd]);

  function navigateMonth(delta: number) {
    let y = monthYear;
    let m = monthIndex + delta;
    if (m < 0) {
      y -= 1;
      m = 11;
    } else if (m > 11) {
      y += 1;
      m = 0;
    }
    const monthStr = `${y}-${String(m + 1).padStart(2, "0")}`;
    router.push(`/dashboard/sala/calendar?month=${monthStr}`);
  }

  function goToday() {
    const ts = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());
    router.push(`/dashboard/sala/calendar?date=${ts}`);
  }

  async function saveDayStatus() {
    if (!dayDialog) return;
    setSaving(true);
    try {
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type: "venue",
          entity_id: venueId,
          dates: [dayDialog],
          status: newStatus,
          note: note.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Nu s-a putut salva");
        return;
      }
      toast.success("Calendar actualizat");
      setDayDialog(null);
      setNote("");
      setNewStatus("available");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function saveRangeStatus() {
    if (!rangeDialog) return;
    setSaving(true);
    try {
      const all = enumerateRange(rangeDialog.start, rangeDialog.end);
      // Filter out dates that already have accepted/confirmed bookings (never overwrite real bookings)
      const dates = all.filter((d) => {
        const books = bookingsByDate.get(d);
        if (!books) return true;
        return !books.some(
          (b) => b.status === "accepted" || b.status === "confirmed_by_client",
        );
      });
      if (dates.length === 0) {
        toast.error("Toate zilele din interval au rezervări confirmate — nu pot fi modificate");
        return;
      }
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type: "venue",
          entity_id: venueId,
          dates,
          status: rangeStatus,
          note: rangeNote.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Nu s-a putut salva");
        return;
      }
      const skipped = all.length - dates.length;
      toast.success(
        skipped > 0
          ? `${dates.length} zile actualizate · ${skipped} sărite (au rezervări)`
          : `${dates.length} zile actualizate`,
      );
      setRangeDialog(null);
      setRangeNote("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const dayBookings = dayDialog ? bookingsByDate.get(dayDialog) ?? [] : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Calendar & Disponibilitate</h1>
          <p className="text-muted-foreground">
            Gestionează disponibilitatea sălii <strong>{venueName}</strong>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            💡 <strong>Sfat:</strong> Apasă și trage peste mai multe zile pentru a le seta rapid (ex: vacanță, renovare)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={goToday}>
            Azi
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigateMonth(-1)}
            aria-label="Luna precedentă"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigateMonth(1)}
            aria-label="Luna următoare"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Legend */}
      <Card>
        <CardContent className="flex flex-wrap gap-4 p-4 text-xs">
          <LegendChip color="bg-emerald-500/40" label="Disponibil" />
          <LegendChip color="bg-red-500/40" label="Nuntă" />
          <LegendChip color="bg-blue-500/40" label="Botez" />
          <LegendChip color="bg-cyan-500/40" label="Cumătrie" />
          <LegendChip color="bg-purple-500/40" label="Corporate" />
          <LegendChip color="bg-orange-500/40" label="Aniversare" />
          <LegendChip color="bg-yellow-500/40" label="Tentativ (pending)" />
          <LegendChip color="bg-slate-500/50" label="Blocat" />
        </CardContent>
      </Card>

      {/* Main calendar grid */}
      <Card>
        <CardContent className="p-5">
          <h2 className="mb-4 text-center font-heading text-xl font-semibold">
            {MONTHS_RO[monthIndex]} {monthYear}
          </h2>

          <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] uppercase tracking-wider text-muted-foreground">
            {WEEKDAYS_RO.map((d) => (
              <div key={d} className="pb-2 font-medium">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5 select-none">
            {cells.map((c, i) => {
              if (!c.dateStr || c.day === null) return <div key={i} />;
              const event = eventsByDate.get(c.dateStr);
              const dayBook = bookingsByDate.get(c.dateStr) ?? [];
              // Prefer a confirmed/accepted booking visual, fall back to pending (tentative)
              const confirmed = dayBook.find(
                (b) => b.status === "accepted" || b.status === "confirmed_by_client",
              );
              const pending = dayBook.find((b) => b.status === "pending");
              const primaryBooking = confirmed || pending;

              // Determine cell visual
              let cellClass = "border-border/30 bg-background/50";
              let labelText = "";

              if (confirmed) {
                const cfg =
                  EVENT_TYPE_CONFIG[(confirmed.eventType || "").toLowerCase()];
                if (cfg) {
                  cellClass = cfg.bg;
                  labelText = cfg.label;
                } else {
                  cellClass = "bg-red-500/20 border-red-500/50";
                  labelText = "Rezervat";
                }
              } else if (pending) {
                // Pending = Tentativ (yellow) per spec
                cellClass = TENTATIVE_STYLE.bg;
                labelText = TENTATIVE_STYLE.label;
              } else if (event?.status) {
                const cfg = STATUS_CONFIG[event.status];
                if (cfg) cellClass = cfg.bg;
                if (event.eventType) {
                  const ec = EVENT_TYPE_CONFIG[event.eventType.toLowerCase()];
                  if (ec) {
                    cellClass = ec.bg;
                    labelText = ec.label;
                  }
                }
              }

              const isToday = c.dateStr === todayStr;
              const isPast = new Date(c.dateStr) < new Date(todayStr);
              const isInDragRange = dragRange.has(c.dateStr);
              const disabled = isPast && !primaryBooking && !event;

              return (
                <button
                  key={i}
                  onPointerDown={(e) => {
                    if (disabled) return;
                    // Only left-button drag on non-booked cells (range blocks/available)
                    if (e.button !== 0) return;
                    if (confirmed) return; // Never start a drag on a confirmed day
                    setDragStart(c.dateStr!);
                    setDragEnd(c.dateStr!);
                  }}
                  onPointerEnter={() => {
                    if (dragStart && !isPast) {
                      setDragEnd(c.dateStr!);
                    }
                  }}
                  onClick={(e) => {
                    // Only treat as click if no drag range (handled on pointerup)
                    if (dragStart && dragEnd && dragStart !== dragEnd) {
                      e.preventDefault();
                      return;
                    }
                    setDayDialog(c.dateStr!);
                    setNote(event?.note || "");
                    setNewStatus(
                      (event?.status as "available" | "blocked" | "tentative") || "available",
                    );
                  }}
                  disabled={disabled}
                  className={cn(
                    "group relative flex min-h-[80px] flex-col items-start rounded-lg border p-2 text-left text-xs transition-all hover:border-gold hover:shadow-lg hover:shadow-gold/10",
                    cellClass,
                    isToday && "ring-2 ring-gold",
                    isPast && "opacity-60",
                    isInDragRange && "ring-2 ring-gold ring-offset-1 ring-offset-background scale-[0.97]",
                  )}
                >
                  <span className="font-semibold">{c.day}</span>
                  {labelText && (
                    <span className="mt-1 text-[9px] font-medium uppercase tracking-wide opacity-80">
                      {labelText}
                    </span>
                  )}
                  {primaryBooking && (
                    <span className="mt-0.5 truncate text-[10px] opacity-90">
                      {primaryBooking.clientName.split(" ")[0]}
                      {primaryBooking.guestCount ? ` · ${primaryBooking.guestCount}p` : ""}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Single-day dialog */}
      <Dialog open={!!dayDialog} onOpenChange={(v) => !v && setDayDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dayDialog
                ? new Date(dayDialog).toLocaleDateString("ro-RO", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : ""}
            </DialogTitle>
            <DialogDescription>
              {dayBookings.length > 0
                ? `${dayBookings.length} ${dayBookings.length === 1 ? "rezervare" : "rezervări"} în această zi`
                : "Gestionează statusul zilei pentru sala ta"}
            </DialogDescription>
          </DialogHeader>

          {/* Bookings list */}
          {dayBookings.length > 0 && (
            <div className="space-y-2">
              {dayBookings.map((b) => {
                const isPending = b.status === "pending";
                const cfg = isPending
                  ? TENTATIVE_STYLE
                  : EVENT_TYPE_CONFIG[(b.eventType || "").toLowerCase()];
                return (
                  <div
                    key={b.id}
                    className={cn(
                      "rounded-lg border p-3",
                      cfg?.bg || "border-border/40 bg-card",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{b.clientName}</p>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          {cfg && (
                            <span className={cn("font-medium", cfg.text)}>
                              {isPending && b.eventType
                                ? `Tentativ · ${EVENT_TYPE_CONFIG[b.eventType.toLowerCase()]?.label ?? b.eventType}`
                                : cfg.label}
                            </span>
                          )}
                          {b.startTime && (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {b.startTime}
                              {b.endTime && `–${b.endTime}`}
                            </span>
                          )}
                          {b.guestCount && (
                            <span className="inline-flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {b.guestCount} pers.
                            </span>
                          )}
                          {b.agreedPrice && <span>{b.agreedPrice}€</span>}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium",
                          b.status === "accepted" || b.status === "confirmed_by_client"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-yellow-500/15 text-yellow-400",
                        )}
                      >
                        {b.status === "pending"
                          ? "În așteptare"
                          : b.status === "confirmed_by_client"
                            ? "Confirmat"
                            : "Acceptat"}
                      </span>
                    </div>
                  </div>
                );
              })}
              <Link
                href="/dashboard/sala/rezervari"
                className="block text-center text-xs text-gold hover:underline"
              >
                Vezi toate rezervările →
              </Link>
            </div>
          )}

          {/* Status control (no bookings → can edit freely) */}
          {dayBookings.length === 0 && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Status</Label>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {(["available", "tentative", "blocked"] as const).map((s) => {
                    const cfg = {
                      available: {
                        label: "Disponibil",
                        Icon: Check,
                        bg: "bg-emerald-500/10 border-emerald-500/40 text-emerald-400",
                      },
                      tentative: {
                        label: "Tentativ",
                        Icon: Clock,
                        bg: "bg-yellow-500/10 border-yellow-500/40 text-yellow-400",
                      },
                      blocked: {
                        label: "Blocat",
                        Icon: Ban,
                        bg: "bg-slate-500/10 border-slate-500/40 text-slate-400",
                      },
                    }[s];
                    const active = newStatus === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setNewStatus(s)}
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-lg border-2 p-2.5 text-xs transition-all",
                          active
                            ? cfg.bg + " ring-2 ring-gold"
                            : "border-border/40 text-muted-foreground hover:border-gold/30",
                        )}
                      >
                        <cfg.Icon className="h-4 w-4" />
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label htmlFor="note" className="text-xs">
                  Notă (opțional)
                </Label>
                <Textarea
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className="mt-1"
                  placeholder={
                    newStatus === "blocked"
                      ? "Ex: renovare, vacanță..."
                      : "Notiță personală pentru această zi"
                  }
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDayDialog(null)}
              disabled={saving}
            >
              Închide
            </Button>
            {dayBookings.length === 0 && (
              <Button
                onClick={saveDayStatus}
                disabled={saving}
                className="bg-gold text-[#0D0D0D] hover:bg-gold-dark"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CalendarIcon className="h-4 w-4" />
                )}
                Salvează
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Range (drag-select) dialog */}
      <Dialog open={!!rangeDialog} onOpenChange={(v) => !v && setRangeDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Setare interval</DialogTitle>
            <DialogDescription>
              {rangeDialog
                ? `Setează status pentru ${enumerateRange(rangeDialog.start, rangeDialog.end).length} zile: ${new Date(
                    rangeDialog.start,
                  ).toLocaleDateString("ro-RO", { day: "numeric", month: "short" })} – ${new Date(
                    rangeDialog.end,
                  ).toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" })}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Status pentru întregul interval</Label>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {(["available", "tentative", "blocked"] as const).map((s) => {
                  const cfg = {
                    available: {
                      label: "Disponibil",
                      Icon: Check,
                      bg: "bg-emerald-500/10 border-emerald-500/40 text-emerald-400",
                    },
                    tentative: {
                      label: "Tentativ",
                      Icon: Clock,
                      bg: "bg-yellow-500/10 border-yellow-500/40 text-yellow-400",
                    },
                    blocked: {
                      label: "Blocat",
                      Icon: Ban,
                      bg: "bg-slate-500/10 border-slate-500/40 text-slate-400",
                    },
                  }[s];
                  const active = rangeStatus === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setRangeStatus(s)}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-lg border-2 p-2.5 text-xs transition-all",
                        active
                          ? cfg.bg + " ring-2 ring-gold"
                          : "border-border/40 text-muted-foreground hover:border-gold/30",
                      )}
                    >
                      <cfg.Icon className="h-4 w-4" />
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label htmlFor="range-note" className="text-xs">
                Notă (opțional)
              </Label>
              <Textarea
                id="range-note"
                value={rangeNote}
                onChange={(e) => setRangeNote(e.target.value)}
                rows={2}
                className="mt-1"
                placeholder={
                  rangeStatus === "blocked"
                    ? "Ex: renovare, vacanță..."
                    : "Aplicat la toate zilele din interval"
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              ℹ️ Zilele cu rezervări confirmate nu vor fi modificate.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRangeDialog(null)}
              disabled={saving}
            >
              Anulează
            </Button>
            <Button
              onClick={saveRangeStatus}
              disabled={saving}
              className="bg-gold text-[#0D0D0D] hover:bg-gold-dark"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CalendarIcon className="h-4 w-4" />
              )}
              Aplică interval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2.5 w-2.5 rounded-sm", color)} />
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}
