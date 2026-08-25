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
  List,
  LayoutGrid,
  Link as LinkIcon,
  Copy,
  ExternalLink,
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
import {
  ALL_EVENT_TYPES,
  eventTypeLabel,
  normalizeEventType,
  type EventTypeKey,
} from "@/lib/events/normalize";
import { useLocale } from "@/hooks/use-locale";

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
  icalUrl: string;
  googleConnected: boolean;
}

/** Spec 2.8: calendar window capped at 18 months ahead of today. */
const MAX_FUTURE_MONTHS = 18;

/** Month and weekday captions come from the shared `calendar.months` /
 *  `calendar.days` arrays so every locale gets its own spelling. */
const WEEKDAY_INDEXES = [0, 1, 2, 3, 4, 5, 6];

/** Colour per event type, keyed by the canonical key — the labels themselves
 *  come from lib/events/normalize. A type with no entry here keeps the old
 *  generic "Rezervat" red so nothing regresses when the list grows. */
const EVENT_TYPE_STYLE: Partial<
  Record<EventTypeKey, { bg: string; text: string; chip: string }>
> = {
  wedding: { bg: "bg-red-500/25 border-red-500/60", text: "text-red-400", chip: "bg-red-500/40" },
  cununie: { bg: "bg-pink-500/25 border-pink-500/60", text: "text-pink-400", chip: "bg-pink-500/40" },
  baptism: { bg: "bg-blue-500/25 border-blue-500/60", text: "text-blue-400", chip: "bg-blue-500/40" },
  cumatrie: { bg: "bg-cyan-500/25 border-cyan-500/60", text: "text-cyan-400", chip: "bg-cyan-500/40" },
  birthday: { bg: "bg-orange-500/25 border-orange-500/60", text: "text-orange-400", chip: "bg-orange-500/40" },
  kids_birthday: { bg: "bg-amber-500/25 border-amber-500/60", text: "text-amber-400", chip: "bg-amber-500/40" },
  corporate: { bg: "bg-purple-500/25 border-purple-500/60", text: "text-purple-400", chip: "bg-purple-500/40" },
};

/** Colour + label for a raw event_type value, whatever spelling it was stored
 *  in (English key, Romanian slug or a hand-typed label). Undefined for a type
 *  we don't colour, which the callers already render as a generic booking. */
function eventTypeVisual(raw: string | null | undefined) {
  const key = normalizeEventType(raw);
  const style = key ? EVENT_TYPE_STYLE[key] : undefined;
  return style ? { ...style, label: eventTypeLabel(key) } : undefined;
}

const TENTATIVE_STYLE = { bg: "bg-yellow-500/25 border-yellow-500/60", text: "text-yellow-400" };

const STATUS_CONFIG: Record<string, { labelKey: string; bg: string }> = {
  available: { labelKey: "common.available", bg: "bg-emerald-500/20 border-emerald-500/50" },
  tentative: { labelKey: "common.tentative", bg: "bg-yellow-500/20 border-yellow-500/50" },
  blocked: { labelKey: "common.blocked", bg: "bg-slate-500/25 border-slate-500/60" },
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
  icalUrl,
  googleConnected,
}: Props) {
  const { t } = useLocale();
  const router = useRouter();
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [showIcalSheet, setShowIcalSheet] = useState(false);
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

  const today = useMemo(() => new Date(), []);
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

  // Spec 2.8: clamp forward navigation to 18 months out; clamp backward to
  // 12 months ago (bookings older than a year are archive-only).
  const maxFuture = useMemo(() => {
    const d = new Date(today.getFullYear(), today.getMonth() + MAX_FUTURE_MONTHS, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  }, [today]);
  const minPast = useMemo(() => {
    const d = new Date(today.getFullYear(), today.getMonth() - 12, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  }, [today]);

  const canGoNext =
    monthYear < maxFuture.year ||
    (monthYear === maxFuture.year && monthIndex < maxFuture.month);
  const canGoPrev =
    monthYear > minPast.year ||
    (monthYear === minPast.year && monthIndex > minPast.month);

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
    // Enforce the 18-month cap / 12-month floor silently.
    if (y > maxFuture.year || (y === maxFuture.year && m > maxFuture.month)) return;
    if (y < minPast.year || (y === minPast.year && m < minPast.month)) return;
    const monthStr = `${y}-${String(m + 1).padStart(2, "0")}`;
    router.push(`/dashboard/sala/calendar?month=${monthStr}`);
  }

  function jumpToMonth(y: number, m: number) {
    if (y > maxFuture.year || (y === maxFuture.year && m > maxFuture.month)) return;
    if (y < minPast.year || (y === minPast.year && m < minPast.month)) return;
    router.push(
      `/dashboard/sala/calendar?month=${y}-${String(m + 1).padStart(2, "0")}`,
    );
  }

  /** Build the list of (year, month) pairs we're allowed to jump to. */
  const availableMonths = useMemo(() => {
    const out: Array<{ year: number; month: number; label: string }> = [];
    let y = minPast.year;
    let m = minPast.month;
    while (y < maxFuture.year || (y === maxFuture.year && m <= maxFuture.month)) {
      out.push({ year: y, month: m, label: `${t(`calendar.months.${m}`)} ${y}` });
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
    return out;
  }, [minPast, maxFuture, t]);

  function goToday() {
    const ts = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());
    router.push(`/dashboard/sala/calendar?date=${ts}`);
  }

  async function copyIcalUrl() {
    try {
      await navigator.clipboard.writeText(icalUrl);
      toast.success(t("vendorSalaCalendar.icalCopied"));
    } catch {
      toast.error(t("vendorSalaCalendar.copyFailed"));
    }
  }

  function connectGoogle() {
    // Pass the current calendar page as return-to via `state`.
    const returnPath = "/dashboard/sala/calendar";
    window.location.href = `/api/auth/google/callback?return=${encodeURIComponent(returnPath)}`;
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
        toast.error(err.error || t("vendorSalaCalendar.saveFailed"));
        return;
      }
      toast.success(t("vendorSalaCalendar.calendarUpdated"));
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
        toast.error(t("vendorSalaCalendar.rangeAllBooked"));
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
        toast.error(err.error || t("vendorSalaCalendar.saveFailed"));
        return;
      }
      const skipped = all.length - dates.length;
      toast.success(
        skipped > 0
          ? t("vendorSalaCalendar.daysUpdatedSkipped", { count: dates.length, skipped })
          : t("vendorSalaCalendar.daysUpdated", { count: dates.length }),
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
          <h1 className="font-heading text-2xl font-bold">{t("vendorSalaCalendar.title")}</h1>
          <p className="text-muted-foreground">
            {t("vendorSalaCalendar.subtitle")} <strong>{venueName}</strong>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            💡 <strong>{t("vendorSalaCalendar.tipLabel")}</strong> {t("vendorSalaCalendar.tipText")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* View toggle — spec 2.5 */}
          <div
            className="inline-flex rounded-lg border border-border/50 p-0.5"
            role="tablist"
            aria-label={t("vendorSalaCalendar.viewToggleLabel")}
          >
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "calendar"}
              onClick={() => setViewMode("calendar")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                viewMode === "calendar"
                  ? "bg-gold text-[#0D0D0D]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              {t("dashboard.calendar")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "list"}
              onClick={() => setViewMode("list")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                viewMode === "list"
                  ? "bg-gold text-[#0D0D0D]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <List className="h-3.5 w-3.5" />
              {t("vendorSalaCalendar.viewList")}
            </button>
          </div>

          {/* Month dropdown jumper — spec 2.4.5 */}
          <select
            aria-label={t("vendorSalaCalendar.jumpToMonth")}
            value={`${monthYear}-${monthIndex}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split("-").map(Number);
              jumpToMonth(y, m);
            }}
            className="h-8 rounded-md border border-border/50 bg-background px-2 text-xs"
          >
            {availableMonths.map((opt) => (
              <option key={opt.label} value={`${opt.year}-${opt.month}`}>
                {opt.label}
              </option>
            ))}
          </select>

          <Button variant="outline" size="sm" onClick={goToday}>
            {t("vendorSalaCalendar.today")}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigateMonth(-1)}
            disabled={!canGoPrev}
            aria-label={t("vendorSalaCalendar.prevMonth")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigateMonth(1)}
            disabled={!canGoNext}
            aria-label={t("calendar.nextMonth")}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Google Calendar sync + iCal feed — spec 2.6 */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <LinkIcon className="h-3.5 w-3.5 text-gold" />
            <span>
              <strong className="text-foreground">{t("vendorSalaCalendar.syncLabel")}</strong>{" "}
              {t("vendorSalaCalendar.syncDescription")}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {googleConnected ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-400">
                <Check className="h-3 w-3" /> {t("vendorSalaCalendar.googleConnected")}
              </span>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={connectGoogle}
                className="h-7 text-xs"
              >
                <ExternalLink className="mr-1 h-3 w-3" /> {t("vendorSalaCalendar.connectGoogle")}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowIcalSheet(true)}
              className="h-7 text-xs"
            >
              <LinkIcon className="mr-1 h-3 w-3" /> {t("vendorSalaCalendar.icalLink")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardContent className="flex flex-wrap gap-4 p-4 text-xs">
          <LegendChip color="bg-emerald-500/40" label={t("common.available")} />
          {ALL_EVENT_TYPES.map((k) => {
            const style = EVENT_TYPE_STYLE[k];
            return style ? (
              <LegendChip key={k} color={style.chip} label={eventTypeLabel(k)} />
            ) : null;
          })}
          <LegendChip color="bg-yellow-500/40" label={t("vendorSalaCalendar.legendTentative")} />
          <LegendChip color="bg-slate-500/50" label={t("common.blocked")} />
        </CardContent>
      </Card>

      {/* Main calendar grid */}
      {viewMode === "calendar" && (
      <Card>
        <CardContent className="p-5">
          <h2 className="mb-4 text-center font-heading text-xl font-semibold">
            {t(`calendar.months.${monthIndex}`)} {monthYear}
          </h2>

          <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] uppercase tracking-wider text-muted-foreground">
            {WEEKDAY_INDEXES.map((d) => (
              <div key={d} className="pb-2 font-medium">
                {t(`calendar.days.${d}`)}
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
                const cfg = eventTypeVisual(confirmed.eventType);
                if (cfg) {
                  cellClass = cfg.bg;
                  labelText = cfg.label;
                } else {
                  cellClass = "bg-red-500/20 border-red-500/50";
                  labelText = t("vendorSalaCalendar.booked");
                }
              } else if (pending) {
                // Pending = Tentativ (yellow) per spec
                cellClass = TENTATIVE_STYLE.bg;
                labelText = t("common.tentative");
              } else if (event?.status) {
                const cfg = STATUS_CONFIG[event.status];
                if (cfg) cellClass = cfg.bg;
                if (event.eventType) {
                  const ec = eventTypeVisual(event.eventType);
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
      )}

      {/* List view — spec 2.5 */}
      {viewMode === "list" && (
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-4 font-heading text-xl font-semibold">
              {t(`calendar.months.${monthIndex}`)} {monthYear} — {t("vendorSalaCalendar.daysWithStatus")}
            </h2>
            <ListView
              monthYear={monthYear}
              monthIndex={monthIndex}
              eventsByDate={eventsByDate}
              bookingsByDate={bookingsByDate}
              onRowClick={(dateStr) => {
                const event = eventsByDate.get(dateStr);
                setDayDialog(dateStr);
                setNote(event?.note || "");
                setNewStatus(
                  (event?.status as "available" | "blocked" | "tentative") ||
                    "available",
                );
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* iCal link dialog — spec 2.6 */}
      <Dialog open={showIcalSheet} onOpenChange={setShowIcalSheet}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("vendorSalaCalendar.icalDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("vendorSalaCalendar.icalDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-accent/30 p-2 font-mono text-[10px] break-all">
              {icalUrl}
            </div>
            <Button
              onClick={copyIcalUrl}
              className="w-full bg-gold text-[#0D0D0D] hover:bg-gold-dark"
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" /> {t("vendorSalaCalendar.copyLink")}
            </Button>
            <p className="text-xs text-muted-foreground">
              {t("vendorSalaCalendar.icalPrivateWarning")}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowIcalSheet(false)}>
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                ? t(
                    dayBookings.length === 1
                      ? "vendorSalaCalendar.bookingsOnDaySingular"
                      : "vendorSalaCalendar.bookingsOnDayPlural",
                    { count: dayBookings.length },
                  )
                : t("vendorSalaCalendar.dayDialogDescription")}
            </DialogDescription>
          </DialogHeader>

          {/* Bookings list */}
          {dayBookings.length > 0 && (
            <div className="space-y-2">
              {dayBookings.map((b) => {
                const isPending = b.status === "pending";
                const typeKey = normalizeEventType(b.eventType);
                const cfg = isPending
                  ? TENTATIVE_STYLE
                  : eventTypeVisual(b.eventType);
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
                              {isPending
                                ? typeKey
                                  ? t("vendorSalaCalendar.tentativeWithType", {
                                      type: eventTypeLabel(typeKey),
                                    })
                                  : t("common.tentative")
                                : eventTypeVisual(b.eventType)?.label}
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
                              {b.guestCount} {t("vendorSalaCalendar.personsShort")}
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
                          ? t("vendorSalaCalendar.statusPending")
                          : b.status === "confirmed_by_client"
                            ? t("vendorSalaCalendar.statusConfirmed")
                            : t("vendorSalaCalendar.statusAccepted")}
                      </span>
                    </div>
                  </div>
                );
              })}
              <Link
                href="/dashboard/sala/rezervari"
                className="block text-center text-xs text-gold hover:underline"
              >
                {t("vendorSalaCalendar.seeAllBookings")}
              </Link>
            </div>
          )}

          {/* Status control (no bookings → can edit freely) */}
          {dayBookings.length === 0 && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">{t("vendorSalaCalendar.statusLabel")}</Label>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {(["available", "tentative", "blocked"] as const).map((s) => {
                    const cfg = {
                      available: {
                        labelKey: "common.available",
                        Icon: Check,
                        bg: "bg-emerald-500/10 border-emerald-500/40 text-emerald-400",
                      },
                      tentative: {
                        labelKey: "common.tentative",
                        Icon: Clock,
                        bg: "bg-yellow-500/10 border-yellow-500/40 text-yellow-400",
                      },
                      blocked: {
                        labelKey: "common.blocked",
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
                        {t(cfg.labelKey)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label htmlFor="note" className="text-xs">
                  {t("vendorSalaCalendar.noteOptional")}
                </Label>
                <Textarea
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className="mt-1"
                  placeholder={
                    newStatus === "blocked"
                      ? t("vendorSalaCalendar.notePlaceholderBlocked")
                      : t("vendorSalaCalendar.notePlaceholderDay")
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
              {t("common.close")}
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
                {t("common.save")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Range (drag-select) dialog */}
      <Dialog open={!!rangeDialog} onOpenChange={(v) => !v && setRangeDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("vendorSalaCalendar.rangeDialogTitle")}</DialogTitle>
            <DialogDescription>
              {rangeDialog
                ? t("vendorSalaCalendar.rangeDialogDescription", {
                    count: enumerateRange(rangeDialog.start, rangeDialog.end).length,
                    from: new Date(rangeDialog.start).toLocaleDateString("ro-RO", {
                      day: "numeric",
                      month: "short",
                    }),
                    to: new Date(rangeDialog.end).toLocaleDateString("ro-RO", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    }),
                  })
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">{t("vendorSalaCalendar.rangeStatusLabel")}</Label>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {(["available", "tentative", "blocked"] as const).map((s) => {
                  const cfg = {
                    available: {
                      labelKey: "common.available",
                      Icon: Check,
                      bg: "bg-emerald-500/10 border-emerald-500/40 text-emerald-400",
                    },
                    tentative: {
                      labelKey: "common.tentative",
                      Icon: Clock,
                      bg: "bg-yellow-500/10 border-yellow-500/40 text-yellow-400",
                    },
                    blocked: {
                      labelKey: "common.blocked",
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
                      {t(cfg.labelKey)}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label htmlFor="range-note" className="text-xs">
                {t("vendorSalaCalendar.noteOptional")}
              </Label>
              <Textarea
                id="range-note"
                value={rangeNote}
                onChange={(e) => setRangeNote(e.target.value)}
                rows={2}
                className="mt-1"
                placeholder={
                  rangeStatus === "blocked"
                    ? t("vendorSalaCalendar.notePlaceholderBlocked")
                    : t("vendorSalaCalendar.notePlaceholderRange")
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("vendorSalaCalendar.rangeConfirmedNote")}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRangeDialog(null)}
              disabled={saving}
            >
              {t("common.cancel")}
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
              {t("vendorSalaCalendar.applyRange")}
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

/** Spec 2.5 — Lista arată doar zilele cu status non-gol, sortate cronologic. */
function ListView({
  monthYear,
  monthIndex,
  eventsByDate,
  bookingsByDate,
  onRowClick,
}: {
  monthYear: number;
  monthIndex: number;
  eventsByDate: Map<string, CalendarEvent>;
  bookingsByDate: Map<string, Booking[]>;
  onRowClick: (dateStr: string) => void;
}) {
  const { t } = useLocale();
  const monthStart = new Date(monthYear, monthIndex, 1);
  const monthEnd = new Date(monthYear, monthIndex + 1, 0);
  const days: Array<{
    dateStr: string;
    statusLabel: string;
    statusClass: string;
    eventType: string | null;
    client: string | null;
    guestCount: number | null;
    agreedPrice: number | null;
    note: string | null;
    kind: "booking" | "event";
  }> = [];

  for (let d = 1; d <= monthEnd.getDate(); d++) {
    const dateStr = toDateStr(monthYear, monthIndex, d);
    const dayBookings = bookingsByDate.get(dateStr) ?? [];
    const confirmed = dayBookings.find(
      (b) => b.status === "accepted" || b.status === "confirmed_by_client",
    );
    const pending = dayBookings.find((b) => b.status === "pending");
    const event = eventsByDate.get(dateStr);

    if (confirmed) {
      const cfg = eventTypeVisual(confirmed.eventType);
      days.push({
        dateStr,
        statusLabel: cfg?.label || t("vendorSalaCalendar.booked"),
        statusClass: cfg?.text || "text-red-400",
        eventType: confirmed.eventType,
        client: confirmed.clientName,
        guestCount: confirmed.guestCount,
        agreedPrice: confirmed.agreedPrice,
        note: null,
        kind: "booking",
      });
    } else if (pending) {
      const pendingKey = normalizeEventType(pending.eventType);
      days.push({
        dateStr,
        statusLabel: pendingKey
          ? t("vendorSalaCalendar.tentativeWithType", { type: eventTypeLabel(pendingKey) })
          : t("common.tentative"),
        statusClass: "text-yellow-400",
        eventType: pending.eventType,
        client: pending.clientName,
        guestCount: pending.guestCount,
        agreedPrice: pending.agreedPrice,
        note: null,
        kind: "booking",
      });
    } else if (event && event.status !== "available") {
      const s = STATUS_CONFIG[event.status];
      days.push({
        dateStr,
        statusLabel: s ? t(s.labelKey) : event.status,
        statusClass:
          event.status === "blocked"
            ? "text-slate-400"
            : event.status === "tentative"
              ? "text-yellow-400"
              : "text-emerald-400",
        eventType: event.eventType,
        client: null,
        guestCount: null,
        agreedPrice: null,
        note: event.note,
        kind: "event",
      });
    }
  }

  if (days.length === 0) {
    void monthStart; // referenced for hypothetical future filtering
    return (
      <div className="rounded-lg border border-dashed border-border/40 py-10 text-center">
        <p className="text-sm text-muted-foreground">
          {t("vendorSalaCalendar.listEmptyTitle")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          {t("vendorSalaCalendar.listEmptyHint")}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="pb-2 pr-3">{t("vendorSalaCalendar.colDate")}</th>
            <th className="pb-2 pr-3">{t("vendorSalaCalendar.colStatusEvent")}</th>
            <th className="pb-2 pr-3">{t("vendorSalaCalendar.colClient")}</th>
            <th className="pb-2 pr-3 text-right">{t("vendorSalaCalendar.colGuests")}</th>
            <th className="pb-2 pr-3 text-right">{t("vendorSalaCalendar.colPrice")}</th>
            <th className="pb-2 text-right">{t("vendorSalaCalendar.colActions")}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => {
            const dateObj = new Date(d.dateStr + "T00:00:00");
            const label = dateObj.toLocaleDateString("ro-RO", {
              weekday: "short",
              day: "numeric",
              month: "short",
            });
            return (
              <tr
                key={d.dateStr}
                className="border-b border-border/20 last:border-0 hover:bg-accent/30"
              >
                <td className="py-3 pr-3 font-medium capitalize">{label}</td>
                <td className={cn("py-3 pr-3 font-medium", d.statusClass)}>
                  {d.statusLabel}
                  {d.note && (
                    <span className="block text-[11px] font-normal text-muted-foreground">
                      {d.note}
                    </span>
                  )}
                </td>
                <td className="py-3 pr-3 text-muted-foreground">
                  {d.client ?? "—"}
                </td>
                <td className="py-3 pr-3 text-right text-muted-foreground">
                  {d.guestCount ?? "—"}
                </td>
                <td className="py-3 pr-3 text-right">
                  {d.agreedPrice ? `${d.agreedPrice}€` : "—"}
                </td>
                <td className="py-3 text-right">
                  <button
                    onClick={() => onRowClick(d.dateStr)}
                    className="text-xs text-gold hover:underline"
                  >
                    {d.kind === "booking" ? t("vendorSalaCalendar.rowDetails") : t("common.edit")} →
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
