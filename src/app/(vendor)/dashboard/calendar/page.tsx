"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimePicker } from "@/components/ui/time-picker";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronLeft,
  ChevronRight,
  Save,
  Loader2,
  X,
  Calendar as CalendarIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const DAYS = ["Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă", "Duminică"];
const MONTHS = [
  "Ianuarie",
  "Februarie",
  "Martie",
  "Aprilie",
  "Mai",
  "Iunie",
  "Iulie",
  "August",
  "Septembrie",
  "Octombrie",
  "Noiembrie",
  "Decembrie",
];

/** F-S6 — Event type catalog with color classes. Keep colors distinct from
 *  status colors so owners can see both at a glance (status = background,
 *  event type = left border accent). */
const EVENT_TYPES: Record<
  string,
  { label: string; dot: string; border: string; text: string }
> = {
  nunta: {
    label: "Nuntă",
    dot: "bg-rose-500",
    border: "border-l-rose-500",
    text: "text-rose-500",
  },
  cumetrie: {
    label: "Cumătrie",
    dot: "bg-sky-500",
    border: "border-l-sky-500",
    text: "text-sky-500",
  },
  botez: {
    label: "Botez",
    dot: "bg-cyan-500",
    border: "border-l-cyan-500",
    text: "text-cyan-500",
  },
  zi_nastere: {
    label: "Zi de naștere",
    dot: "bg-amber-500",
    border: "border-l-amber-500",
    text: "text-amber-500",
  },
  corporate: {
    label: "Corporate",
    dot: "bg-indigo-500",
    border: "border-l-indigo-500",
    text: "text-indigo-500",
  },
  revelion: {
    label: "Revelion",
    dot: "bg-violet-500",
    border: "border-l-violet-500",
    text: "text-violet-500",
  },
  altele: {
    label: "Altele",
    dot: "bg-slate-400",
    border: "border-l-slate-400",
    text: "text-slate-400",
  },
};

const statusColors: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  available: {
    label: "Disponibil",
    color: "text-success",
    bg: "bg-success/15 border-success/30",
  },
  booked: {
    label: "Ocupat",
    color: "text-destructive",
    bg: "bg-destructive/15 border-destructive/30",
  },
  tentative: {
    label: "Tentativ",
    color: "text-warning",
    bg: "bg-warning/15 border-warning/30",
  },
  blocked: {
    label: "Blocat",
    color: "text-muted-foreground",
    bg: "bg-muted border-muted-foreground/20",
  },
};

interface WorkDay {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isWorking: boolean;
}

interface CalendarEntry {
  date: string;
  status: string;
  note?: string | null;
  eventType?: string | null;
  startTime?: string;
  endTime?: string;
}

type EntityType = "artist" | "venue";

interface Entity {
  type: EntityType;
  id: number;
  name: string;
}

export default function VendorCalendarPage() {
  // F-S6 — resolve the current owner's entity (venue or artist) on mount so
  // the calendar can be used by both roles instead of hardcoding artistId=1.
  const [entity, setEntity] = useState<Entity | null>(null);
  const [entityLoading, setEntityLoading] = useState(true);

  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState({
    year: today.getFullYear(),
    month: today.getMonth(),
  });
  const [events, setEvents] = useState<Record<string, CalendarEntry>>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState("booked");
  const [selectedEventType, setSelectedEventType] = useState<string>("nunta");
  const [selectedNote, setSelectedNote] = useState("");
  const [selectedStartTime, setSelectedStartTime] = useState("10:00");
  const [_selectedEndTime, setSelectedEndTime] = useState("22:00");
  const [saving, setSaving] = useState(false);
  const [schedule, setSchedule] = useState<WorkDay[]>(
    DAYS.map((_, i) => ({
      dayOfWeek: i,
      startTime: i < 5 ? "10:00" : "12:00",
      endTime: i < 5 ? "22:00" : "23:00",
      isWorking: true,
    })),
  );
  const [applyingSchedule, setApplyingSchedule] = useState(false);
  const [blockFrom, setBlockFrom] = useState("");
  const [blockTo, setBlockTo] = useState("");
  const [blockingPeriod, setBlockingPeriod] = useState(false);
  const [blockedWeekdays, setBlockedWeekdays] = useState<number[]>([]);
  const [blockWeekdayMonths, setBlockWeekdayMonths] = useState(3);
  const [blockingWeekdays, setBlockingWeekdays] = useState(false);

  // Full bookings list so the day detail panel can show cereri/rezervări
  // that match the clicked date (with client name, slot, price, etc).
  interface DayBooking {
    id: number;
    status: string;
    clientName: string;
    clientPhone: string | null;
    clientEmail: string | null;
    eventDate: string;
    eventType: string | null;
    startTime: string | null;
    endTime: string | null;
    guestCount: number | null;
    message: string | null;
    agreedPrice: number | null;
    source?: string;
  }
  const [dayBookings, setDayBookings] = useState<DayBooking[]>([]);
  const [dayBookingsLoading, setDayBookingsLoading] = useState(false);
  const [monthBookingsByDate, setMonthBookingsByDate] = useState<
    Record<string, DayBooking[]>
  >({});

  // Manual-booking dialog state
  interface ArtistPackage {
    id: number;
    nameRo: string | null;
    price: number | null;
    durationHours: number | null;
    durationMinutes: number | null;
  }
  const [packages, setPackages] = useState<ArtistPackage[]>([]);
  const [manualDialog, setManualDialog] = useState(false);
  const [manualStartTime, setManualStartTime] = useState("18:00");
  const [manualPackageId, setManualPackageId] = useState<number | null>(null);
  const [manualPrice, setManualPrice] = useState<string>("");
  const [manualNote, setManualNote] = useState("");
  const [manualEventType, setManualEventType] = useState<string>("altele");
  const [manualSaving, setManualSaving] = useState(false);

  // Resolve entity on mount — venue first, fallback to artist.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [venueRes, artistRes] = await Promise.all([
          fetch("/api/me/venue"),
          fetch("/api/me/artist"),
        ]);
        const venueData = venueRes.ok ? await venueRes.json() : { venue: null };
        const artistData = artistRes.ok
          ? await artistRes.json()
          : { artist: null };
        if (cancelled) return;
        if (venueData.venue) {
          setEntity({
            type: "venue",
            id: venueData.venue.id,
            name: venueData.venue.nameRo,
          });
        } else if (artistData.artist) {
          setEntity({
            type: "artist",
            id: artistData.artist.id,
            name: artistData.artist.nameRo,
          });
        }
      } finally {
        if (!cancelled) setEntityLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the artist's pricing packages so the manual-booking dialog can
  // offer durations & auto-priced tiers.
  useEffect(() => {
    if (!entity || entity.type !== "artist") return;
    let cancelled = false;
    fetch(`/api/artist-packages?artist_id=${entity.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ArtistPackage[]) => {
        if (cancelled) return;
        const valid = (Array.isArray(rows) ? rows : []).filter((p) => {
          const total =
            Math.round((p.durationHours ?? 0) * 60) +
            (p.durationMinutes ?? 0);
          return total > 0;
        });
        valid.sort((a, b) => {
          const am =
            Math.round((a.durationHours ?? 0) * 60) +
            (a.durationMinutes ?? 0);
          const bm =
            Math.round((b.durationHours ?? 0) * 60) +
            (b.durationMinutes ?? 0);
          return am - bm;
        });
        setPackages(valid);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [entity]);

  // Load work schedule from server when entity is resolved
  useEffect(() => {
    if (!entity || entity.type !== "artist") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/work-schedule?artist_id=${entity.id}`);
        if (!res.ok || cancelled) return;
        const data: { dayOfWeek: number; startTime: string; endTime: string; isWorking: boolean }[] = await res.json();
        if (cancelled || data.length === 0) return;
        setSchedule((prev) =>
          prev.map((day) => {
            const serverDay = data.find((d) => d.dayOfWeek === day.dayOfWeek);
            return serverDay ? { ...day, ...serverDay } : day;
          }),
        );
      } catch {
        // Use defaults if fetch fails
      }
    })();
    return () => { cancelled = true; };
  }, [entity]);

  // Load events for the current entity + month whenever either changes.
  const loadEvents = useCallback(async () => {
    if (!entity) return;
    const monthStr = `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, "0")}`;
    const res = await fetch(
      `/api/calendar?entity_type=${entity.type}&entity_id=${entity.id}&month=${monthStr}`,
    );
    if (!res.ok) return;
    const data: Array<{
      date: string;
      status: string;
      note: string | null;
      eventType: string | null;
    }> = await res.json();
    const map: Record<string, CalendarEntry> = {};
    for (const row of data) {
      map[row.date] = {
        date: row.date,
        status: row.status,
        note: row.note,
        eventType: row.eventType,
      };
    }
    setEvents(map);
  }, [entity, currentMonth]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Load ALL bookings for the visible month so the calendar grid can show
  // a colored dot per booking (multiple dots on busy days).
  useEffect(() => {
    if (!entity || entity.type !== "artist") {
      setMonthBookingsByDate({});
      return;
    }
    const firstStr = `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, "0")}-01`;
    const lastDate = new Date(
      currentMonth.year,
      currentMonth.month + 1,
      0,
    ).getDate();
    const lastStr = `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, "0")}-${String(lastDate).padStart(2, "0")}`;
    let cancelled = false;
    fetch(`/api/booking-requests?artist_id=${entity.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: DayBooking[]) => {
        if (cancelled) return;
        const grouped: Record<string, DayBooking[]> = {};
        for (const b of Array.isArray(rows) ? rows : []) {
          if (!b.eventDate) continue;
          if (b.eventDate < firstStr || b.eventDate > lastStr) continue;
          // Ignore cancelled/rejected — they don't occupy the day
          if (b.status === "rejected" || b.status === "cancelled") continue;
          (grouped[b.eventDate] = grouped[b.eventDate] || []).push(b);
        }
        setMonthBookingsByDate(grouped);
      })
      .catch(() => {
        if (!cancelled) setMonthBookingsByDate({});
      });
    return () => {
      cancelled = true;
    };
  }, [entity, currentMonth, dayBookings]);

  const { year, month } = currentMonth;
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDay = (firstDay.getDay() + 6) % 7;
  const daysInMonth = lastDay.getDate();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // When the artist clicks a date we also fetch the booking-request rows
  // that target that date so we can show full details (client, slot, price).
  useEffect(() => {
    if (!entity || entity.type !== "artist" || !selectedDate) {
      setDayBookings([]);
      return;
    }
    let cancelled = false;
    setDayBookingsLoading(true);
    fetch(`/api/booking-requests?artist_id=${entity.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: DayBooking[]) => {
        if (cancelled) return;
        setDayBookings(
          (Array.isArray(rows) ? rows : []).filter(
            (b) => b.eventDate === selectedDate,
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setDayBookings([]);
      })
      .finally(() => {
        if (!cancelled) setDayBookingsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entity, selectedDate]);

  function handleDayClick(dateStr: string) {
    if (dateStr < todayStr) return; // past days are read-only
    setSelectedDate(dateStr);
    const existing = events[dateStr];
    if (existing) {
      setSelectedStatus(existing.status);
      setSelectedEventType(existing.eventType || "nunta");
      setSelectedNote(existing.note || "");
      setSelectedStartTime(existing.startTime || "10:00");
      setSelectedEndTime(existing.endTime || "22:00");
    } else {
      setSelectedStatus("booked");
      setSelectedEventType("nunta");
      setSelectedNote("");
      setSelectedStartTime("10:00");
      setSelectedEndTime("22:00");
    }
  }

  // Selected package → auto-fill price in the manual booking form
  const selectedManualPackage = packages.find((p) => p.id === manualPackageId);
  useEffect(() => {
    if (selectedManualPackage?.price != null) {
      setManualPrice(String(selectedManualPackage.price));
    }
  }, [selectedManualPackage]);

  async function refreshDayBookings() {
    if (!entity || entity.type !== "artist" || !selectedDate) return;
    try {
      const r = await fetch(`/api/booking-requests?artist_id=${entity.id}`);
      if (!r.ok) return;
      const rows: DayBooking[] = await r.json();
      setDayBookings(
        (Array.isArray(rows) ? rows : []).filter(
          (b) => b.eventDate === selectedDate,
        ),
      );
    } catch {
      // silent
    }
  }

  async function submitManualBooking() {
    if (!entity || entity.type !== "artist" || !selectedDate) return;
    if (manualPackageId == null) {
      toast.error("Alege durata (pachetul).");
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(manualStartTime)) {
      toast.error("Setează ora de început.");
      return;
    }
    const priceNum = manualPrice === "" ? null : Number(manualPrice);
    if (priceNum != null && (!Number.isFinite(priceNum) || priceNum < 0)) {
      toast.error("Preț invalid.");
      return;
    }
    setManualSaving(true);
    try {
      const res = await fetch("/api/artist-bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artistId: entity.id,
          eventDate: selectedDate,
          startTime: manualStartTime,
          packageId: manualPackageId,
          price: priceNum,
          note: manualNote.trim() || undefined,
          eventType: manualEventType || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Nu s-a putut adăuga rezervarea");
        return;
      }
      toast.success("Rezervare adăugată");
      setManualDialog(false);
      setManualNote("");
      setManualPackageId(null);
      setManualPrice("");
      await Promise.all([refreshDayBookings(), loadEvents()]);
    } catch {
      toast.error("Eroare la salvare");
    } finally {
      setManualSaving(false);
    }
  }

  async function deleteManualBooking(id: number) {
    if (!confirm("Sigur ștergi această rezervare manuală?")) return;
    try {
      const res = await fetch(`/api/artist-bookings?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Nu s-a putut șterge rezervarea");
        return;
      }
      toast.success("Rezervare ștearsă");
      await refreshDayBookings();
    } catch {
      toast.error("Eroare la ștergere");
    }
  }

  async function saveDay() {
    if (!selectedDate || !entity) return;
    setSaving(true);
    try {
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type: entity.type,
          entity_id: entity.id,
          dates: [selectedDate],
          status: selectedStatus,
          note: selectedNote || null,
          event_type:
            selectedStatus === "booked" || selectedStatus === "tentative"
              ? selectedEventType
              : null,
        }),
      });
      if (!res.ok) throw new Error("save failed");
      await loadEvents();
      toast.success("Ziua actualizată!");
      setSelectedDate(null);
    } catch {
      toast.error("Eroare la salvare");
    } finally {
      setSaving(false);
    }
  }

  async function removeDay() {
    if (!selectedDate || !entity) return;
    setSaving(true);
    try {
      await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type: entity.type,
          entity_id: entity.id,
          dates: [selectedDate],
          status: "available",
        }),
      });
      await loadEvents();
      setSelectedDate(null);
      toast.success("Ziua marcată disponibilă");
    } catch {
      toast.error("Eroare la ștergere");
    } finally {
      setSaving(false);
    }
  }

  async function saveSchedule() {
    if (!entity || entity.type !== "artist") return;
    setSaving(true);
    try {
      await fetch("/api/work-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artistId: entity.id, schedule }),
      });
      toast.success("Graficul de lucru salvat!");
    } catch {
      toast.error("Eroare la salvare");
    } finally {
      setSaving(false);
    }
  }

  /** Collect all non-working weekdays for the next N months and block them */
  async function applyScheduleToCalendar() {
    if (!entity) return;
    const offDays = schedule.filter((d) => !d.isWorking).map((d) => d.dayOfWeek);
    if (offDays.length === 0) {
      toast.error("Toate zilele sunt lucrătoare — nu e nimic de blocat.");
      return;
    }
    setApplyingSchedule(true);
    try {
      const dates: string[] = [];
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 3);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dow = (d.getDay() + 6) % 7; // 0=Mon
        if (offDays.includes(dow)) {
          dates.push(
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
          );
        }
      }
      if (dates.length === 0) {
        toast.error("Nu s-au găsit zile de blocat.");
        return;
      }
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type: entity.type,
          entity_id: entity.id,
          dates,
          status: "blocked",
          note: "Zi liberă (grafic săptămânal)",
        }),
      });
      if (!res.ok) throw new Error();
      await loadEvents();
      toast.success(`${dates.length} zile libere blocate pe calendar (3 luni)`);
    } catch {
      toast.error("Eroare la aplicarea graficului");
    } finally {
      setApplyingSchedule(false);
    }
  }

  /** Block a date range (vacation / unavailable period) */
  async function blockPeriod() {
    if (!entity || !blockFrom || !blockTo) {
      toast.error("Selectează data de început și sfârșit");
      return;
    }
    if (blockFrom < todayStr) {
      toast.error("Nu poți bloca zile din trecut");
      return;
    }
    if (blockFrom > blockTo) {
      toast.error("Data de început trebuie să fie înainte de data de sfârșit");
      return;
    }
    setBlockingPeriod(true);
    try {
      const dates: string[] = [];
      const start = new Date(blockFrom + "T00:00:00");
      const end = new Date(blockTo + "T00:00:00");
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        );
      }
      if (dates.length > 180) {
        toast.error("Perioada nu poate depăși 180 de zile");
        return;
      }
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type: entity.type,
          entity_id: entity.id,
          dates,
          status: "blocked",
          note: "Perioadă blocată",
        }),
      });
      if (!res.ok) throw new Error();
      await loadEvents();
      toast.success(`${dates.length} zile blocate!`);
      setBlockFrom("");
      setBlockTo("");
    } catch {
      toast.error("Eroare la blocarea perioadei");
    } finally {
      setBlockingPeriod(false);
    }
  }

  function toggleWeekday(dow: number) {
    setBlockedWeekdays((prev) =>
      prev.includes(dow) ? prev.filter((d) => d !== dow) : [...prev, dow],
    );
  }

  async function blockWeekdays() {
    if (!entity || blockedWeekdays.length === 0) {
      toast.error("Selectează cel puțin o zi din săptămână");
      return;
    }
    setBlockingWeekdays(true);
    try {
      const dates: string[] = [];
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setMonth(end.getMonth() + blockWeekdayMonths);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dow = (d.getDay() + 6) % 7; // 0=Mon
        if (blockedWeekdays.includes(dow)) {
          dates.push(
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
          );
        }
      }
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type: entity.type,
          entity_id: entity.id,
          dates,
          status: "blocked",
          note: `Zi blocată recurent (${blockedWeekdays.map((d) => DAYS[d]).join(", ")})`,
        }),
      });
      if (!res.ok) throw new Error();
      await loadEvents();
      toast.success(
        `${dates.length} zile blocate (fiecare ${blockedWeekdays.map((d) => DAYS[d]).join(", ")} pe ${blockWeekdayMonths} luni)`,
      );
      setBlockedWeekdays([]);
    } catch {
      toast.error("Eroare la blocarea zilelor");
    } finally {
      setBlockingWeekdays(false);
    }
  }

  if (entityLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (!entity) {
    return (
      <div className="rounded-xl border border-border/40 bg-card p-6 text-sm text-muted-foreground">
        Nu am găsit un profil de artist sau sală asociat contului tău.
        Finalizează mai întâi onboarding-ul.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Calendar & Program</h1>
          <p className="text-sm text-muted-foreground">
            {entity.type === "venue"
              ? `Gestionează disponibilitatea pentru ${entity.name}`
              : `Gestionează disponibilitatea și graficul de lucru pentru ${entity.name}`}
          </p>
        </div>
      </div>

      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          {entity.type === "artist" && (
            <TabsTrigger value="schedule">Grafic de Lucru</TabsTrigger>
          )}
        </TabsList>


        <TabsContent value="calendar" className="mt-6 space-y-4">
          {/* Status legend */}
          <div className="flex flex-wrap gap-3">
            {Object.entries(statusColors).map(([key, cfg]) => (
              <span key={key} className="flex items-center gap-1.5 text-xs">
                <span
                  className={cn(
                    "h-3 w-3 rounded-full",
                    key === "available"
                      ? "bg-success"
                      : key === "booked"
                        ? "bg-destructive"
                        : key === "tentative"
                          ? "bg-warning"
                          : "bg-muted-foreground",
                  )}
                />
                {cfg.label}
              </span>
            ))}
          </div>

          {/* F-S6 — Event-type legend */}
          <div className="flex flex-wrap gap-3 rounded-lg border border-border/40 bg-card/50 p-3">
            <span className="text-xs font-medium text-muted-foreground">
              Tip eveniment:
            </span>
            {Object.entries(EVENT_TYPES).map(([key, cfg]) => (
              <span key={key} className="flex items-center gap-1.5 text-xs">
                <span className={cn("h-3 w-3 rounded-sm", cfg.dot)} />
                {cfg.label}
              </span>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Calendar Grid */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Luna precedentă"
                    onClick={() =>
                      setCurrentMonth((c) =>
                        c.month === 0
                          ? { year: c.year - 1, month: 11 }
                          : { year: c.year, month: c.month - 1 },
                      )
                    }
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <CardTitle>
                    {MONTHS[month]} {year}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Luna următoare"
                    onClick={() =>
                      setCurrentMonth((c) =>
                        c.month === 11
                          ? { year: c.year + 1, month: 0 }
                          : { year: c.year, month: c.month + 1 },
                      )
                    }
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-2 grid grid-cols-7 text-center">
                  {DAYS.map((d) => (
                    <div
                      key={d}
                      className="py-2 text-xs font-medium text-muted-foreground"
                    >
                      {d.substring(0, 2)}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: startDay }).map((_, i) => (
                    <div key={`e-${i}`} />
                  ))}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const entry = events[dateStr];
                    const bookingsForDay = monthBookingsByDate[dateStr] ?? [];
                    const statusCfg = entry ? statusColors[entry.status] : null;
                    const isBlocked = entry?.status === "blocked";
                    const isSelected = selectedDate === dateStr;
                    const isPast = dateStr < todayStr;
                    const isToday = dateStr === todayStr;

                    // Build the list of dots — one per booking, colored by
                    // event type. Cap at 4; render a "+N" bubble for the rest.
                    const dots = bookingsForDay
                      .map((b) => {
                        const key = b.eventType && EVENT_TYPES[b.eventType]
                          ? b.eventType
                          : "altele";
                        return EVENT_TYPES[key];
                      })
                      .filter(Boolean);
                    const visibleDots = dots.slice(0, 4);
                    const extraDots = dots.length - visibleDots.length;

                    // Determine visual status for cell background:
                    // blocked → red, booked → red, tentative → orange, available → green
                    const isBooked = entry?.status === "booked";
                    const isTentative = entry?.status === "tentative";
                    const isAvailable = entry?.status === "available";

                    return (
                      <button
                        key={day}
                        onClick={() => handleDayClick(dateStr)}
                        disabled={isPast}
                        className={cn(
                          "relative flex h-12 flex-col items-center justify-center rounded-lg border text-xs font-medium transition-all sm:h-16 sm:text-sm",
                          isPast && "cursor-not-allowed opacity-40",
                          !isPast && isSelected &&
                            "ring-2 ring-gold ring-offset-1 ring-offset-background",
                          !isPast && isToday && "ring-1 ring-gold/50",
                          // Status-based backgrounds (priority: blocked > booked > tentative > bookings > available > default)
                          isBlocked
                            ? "bg-destructive/30 border-destructive/60 text-destructive hover:bg-destructive/40"
                            : isBooked
                              ? "bg-destructive/20 border-destructive/40 text-destructive"
                              : isTentative
                                ? "bg-warning/20 border-warning/40 text-warning"
                                : bookingsForDay.length > 0
                                  ? "bg-gold/10 border-gold/40"
                                  : isAvailable
                                    ? "bg-success/15 border-success/40 hover:bg-success/25"
                                    : isPast
                                      ? "border-border/10"
                                      : "border-border/20 hover:border-gold/30",
                        )}
                        title={
                          isPast
                            ? "Zilele trecute nu pot fi modificate"
                            : isBlocked
                              ? "Zi blocată — apasă pentru a debloca"
                              : isBooked
                                ? "Zi ocupată"
                                : isTentative
                                  ? "Zi tentativă"
                                  : isAvailable
                                    ? "Zi disponibilă"
                                    : bookingsForDay.length > 0
                                      ? `${bookingsForDay.length} ${bookingsForDay.length === 1 ? "rezervare" : "rezervări"}`
                                      : undefined
                        }
                      >
                        <span
                          className={cn(
                            isBlocked && "text-destructive font-bold",
                            isBooked && "text-destructive font-bold",
                            isTentative && "text-warning font-bold",
                            !isBlocked && !isBooked && !isTentative && bookingsForDay.length > 0 && "text-gold font-bold",
                            isAvailable && !bookingsForDay.length && "text-success font-semibold",
                            isToday && !isBlocked && !isBooked && !isTentative && bookingsForDay.length === 0 && !isAvailable && "text-gold font-bold",
                          )}
                        >
                          {day}
                        </span>
                        {/* Dots for each booking (colored by event type). */}
                        {visibleDots.length > 0 && (
                          <div className="mt-1 flex items-center gap-0.5">
                            {visibleDots.map((cfg, idx) => (
                              <span
                                key={idx}
                                className={cn(
                                  "h-1.5 w-1.5 rounded-full",
                                  cfg.dot,
                                )}
                              />
                            ))}
                            {extraDots > 0 && (
                              <span className="ml-0.5 text-[9px] font-bold text-gold/80">
                                +{extraDots}
                              </span>
                            )}
                          </div>
                        )}
                        {/* Fallback: legacy event-type dot from calendar_events
                            when no bookings exist but the day has a manual
                            status (e.g. "Blocked"). */}
                        {visibleDots.length === 0 && statusCfg && !isBlocked && (
                          <span
                            className={cn(
                              "mt-0.5 h-1.5 w-1.5 rounded-full",
                              "bg-muted-foreground/50",
                            )}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Day Detail Panel */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {selectedDate ? `Detalii: ${selectedDate}` : "Selectează o zi"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedDate ? (
                  <div className="space-y-4">
                    {/* Bookings for this date (only for artists) */}
                    {entity?.type === "artist" && (
                      <div className="rounded-lg border border-border/40 bg-background/40 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Rezervări pe {selectedDate}
                            {!dayBookingsLoading && (
                              <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-bold text-gold">
                                {dayBookings.length}
                              </span>
                            )}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              // Prefill time from currently-selected range or default
                              setManualStartTime(
                                selectedStartTime || "18:00",
                              );
                              setManualDialog(true);
                            }}
                            className="gap-1 border-gold/40 text-gold hover:bg-gold/10"
                          >
                            + Adaugă rezervare
                          </Button>
                        </div>
                        {dayBookingsLoading ? (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Se încarcă…
                          </div>
                        ) : dayBookings.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Nicio rezervare pe această zi.
                          </p>
                        ) : (
                          <ul className="space-y-2">
                            {dayBookings.map((b) => {
                              const statusLabel =
                                b.status === "pending"
                                  ? "În așteptare"
                                  : b.status === "accepted"
                                    ? "Acceptată"
                                    : b.status === "confirmed_by_client"
                                      ? "Confirmată"
                                      : b.status === "rejected"
                                        ? "Refuzată"
                                        : b.status === "cancelled"
                                          ? "Anulată"
                                          : b.status === "completed"
                                            ? "Finalizată"
                                            : b.status;
                              const statusColor =
                                b.status === "pending"
                                  ? "text-amber-400 bg-amber-500/10"
                                  : b.status === "accepted" ||
                                      b.status === "confirmed_by_client"
                                    ? "text-emerald-400 bg-emerald-500/10"
                                    : b.status === "completed"
                                      ? "text-blue-400 bg-blue-500/10"
                                      : "text-destructive bg-destructive/10";
                              return (
                                <li
                                  key={b.id}
                                  className="rounded-md border border-border/30 bg-card/60 p-2.5 text-xs"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="flex items-center gap-2 font-heading font-bold text-sm">
                                      {b.clientName}
                                      {b.source === "manual" && (
                                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted-foreground">
                                          Manual
                                        </span>
                                      )}
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                      <span
                                        className={cn(
                                          "rounded-full px-2 py-0.5 text-[10px] font-bold",
                                          statusColor,
                                        )}
                                      >
                                        {statusLabel}
                                      </span>
                                      {b.source === "manual" && (
                                        <button
                                          type="button"
                                          onClick={() => deleteManualBooking(b.id)}
                                          className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                          title="Șterge rezervarea manuală"
                                        >
                                          <X className="h-3 w-3" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                                    {b.startTime && b.endTime && (
                                      <span>
                                        🕐 {b.startTime}–{b.endTime}
                                      </span>
                                    )}
                                    {b.eventType && <span>📋 {b.eventType}</span>}
                                    {b.guestCount != null && (
                                      <span>👥 {b.guestCount} invitați</span>
                                    )}
                                    {b.agreedPrice != null && (
                                      <span className="font-bold text-gold">
                                        {b.agreedPrice}€
                                      </span>
                                    )}
                                  </div>
                                  {b.message && (
                                    <p className="mt-1 text-muted-foreground/80 italic">
                                      “{b.message}”
                                    </p>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    )}

                    {/* Block-day toggle. Rezervările individuale se adaugă
                        direct din lista de mai sus; restul controalelor au
                        fost scoase ca să rămână flow-ul simplu. */}
                    {events[selectedDate]?.status === "blocked" ? (
                      <Button
                        onClick={removeDay}
                        disabled={saving}
                        variant="outline"
                        className="w-full gap-2 border-muted-foreground/40"
                      >
                        {saving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <X className="h-4 w-4" />
                        )}
                        Deblochează ziua
                      </Button>
                    ) : (
                      <Button
                        onClick={async () => {
                          setSelectedStatus("blocked");
                          setSelectedEventType("");
                          setSelectedNote("Zi blocată");
                          setSelectedStartTime("00:00");
                          setSelectedEndTime("23:59");
                          // Defer actual save to the next tick so state is current
                          setTimeout(saveDay, 0);
                        }}
                        disabled={saving}
                        variant="outline"
                        className="w-full gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
                      >
                        {saving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <X className="h-4 w-4" />
                        )}
                        Blochează ziua
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Click pe o zi din calendar pentru a vedea rezervările și
                    pentru a adăuga altele noi.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {entity.type === "artist" && (
          <TabsContent value="schedule" className="mt-6 space-y-4">
            {/* Weekly schedule */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Grafic de Lucru Săptămânal</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Setează zilele și orele în care ești disponibil
                    </p>
                  </div>
                  <Button
                    onClick={saveSchedule}
                    disabled={saving}
                    className="gap-2 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}{" "}
                    Salvează
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {schedule.map((day, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-3 rounded-lg border border-border/40 p-3 sm:gap-4">
                    <div className="w-20 shrink-0 text-sm font-medium sm:w-24">{DAYS[i]}</div>
                    <Switch
                      checked={day.isWorking}
                      onCheckedChange={(v) => {
                        const copy = [...schedule];
                        copy[i] = { ...copy[i], isWorking: v };
                        setSchedule(copy);
                      }}
                    />
                    {day.isWorking ? (
                      <>
                        <div className="w-24 sm:w-32">
                          <TimePicker
                            value={day.startTime}
                            onChange={(v) => {
                              const copy = [...schedule];
                              copy[i] = { ...copy[i], startTime: v };
                              setSchedule(copy);
                            }}
                          />
                        </div>
                        <span className="text-muted-foreground">—</span>
                        <div className="w-24 sm:w-32">
                          <TimePicker
                            value={day.endTime}
                            onChange={(v) => {
                              const copy = [...schedule];
                              copy[i] = { ...copy[i], endTime: v };
                              setSchedule(copy);
                            }}
                          />
                        </div>
                      </>
                    ) : (
                      <span className="text-sm text-destructive/70 font-medium">
                        Zi liberă
                      </span>
                    )}
                  </div>
                ))}
                {/* Apply schedule to calendar */}
                {schedule.some((d) => !d.isWorking) && (
                  <div className="rounded-lg border border-dashed border-gold/40 bg-gold/5 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium">Aplică zilele libere pe calendar</p>
                        <p className="text-xs text-muted-foreground">
                          Marchează automat{" "}
                          {schedule
                            .filter((d) => !d.isWorking)
                            .map((d) => DAYS[d.dayOfWeek])
                            .join(", ")}{" "}
                          ca „blocate” pe următoarele 3 luni
                        </p>
                      </div>
                      <Button
                        onClick={applyScheduleToCalendar}
                        disabled={applyingSchedule}
                        variant="outline"
                        className="shrink-0 gap-2"
                      >
                        {applyingSchedule ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CalendarIcon className="h-4 w-4" />
                        )}
                        Aplică
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Block specific weekdays */}
            <Card>
              <CardHeader>
                <CardTitle>Blochează Zile din Săptămână</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Selectează zilele săptămânii care să fie marcate ca indisponibile recurent
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((day, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleWeekday(i)}
                      className={cn(
                        "rounded-lg border px-4 py-2.5 text-sm font-medium transition-all",
                        blockedWeekdays.includes(i)
                          ? "border-destructive bg-destructive/10 text-destructive"
                          : "border-border/40 hover:border-border hover:bg-accent",
                      )}
                    >
                      {day}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <Label>Pe câte luni înainte</Label>
                    <div className="mt-1 flex gap-2">
                      {[1, 2, 3, 6].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setBlockWeekdayMonths(m)}
                          className={cn(
                            "rounded-md border px-3 py-1.5 text-sm transition-all",
                            blockWeekdayMonths === m
                              ? "border-gold bg-gold/10 text-gold font-medium"
                              : "border-border/40 hover:bg-accent",
                          )}
                        >
                          {m} {m === 1 ? "lună" : "luni"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Button
                    onClick={blockWeekdays}
                    disabled={blockingWeekdays || blockedWeekdays.length === 0}
                    variant="destructive"
                    className="gap-2"
                  >
                    {blockingWeekdays ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CalendarIcon className="h-4 w-4" />
                    )}
                    Blochează zilele
                  </Button>
                </div>
                {blockedWeekdays.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Fiecare <strong>{blockedWeekdays.map((d) => DAYS[d]).join(", ")}</strong> va fi
                    marcat(ă) ca blocat(ă) pe următoarele {blockWeekdayMonths}{" "}
                    {blockWeekdayMonths === 1 ? "lună" : "luni"}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Block period */}
            <Card>
              <CardHeader>
                <CardTitle>Blochează Perioadă</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Marchează o perioadă ca indisponibilă (vacanță, concediu, etc.)
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[140px]">
                    <Label>De la</Label>
                    <Input
                      type="date"
                      value={blockFrom}
                      onChange={(e) => setBlockFrom(e.target.value)}
                      className="w-full sm:w-44"
                    />
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <Label>Până la</Label>
                    <Input
                      type="date"
                      value={blockTo}
                      onChange={(e) => setBlockTo(e.target.value)}
                      className="w-full sm:w-44"
                    />
                  </div>
                  <Button
                    onClick={blockPeriod}
                    disabled={blockingPeriod || !blockFrom || !blockTo}
                    variant="destructive"
                    className="w-full gap-2 sm:w-auto"
                  >
                    {blockingPeriod ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                    Blochează
                  </Button>
                </div>
                {blockFrom && blockTo && blockFrom <= blockTo && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {Math.ceil((new Date(blockTo).getTime() - new Date(blockFrom).getTime()) / 86400000) + 1} zile vor fi marcate ca blocate
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* ─── Manual booking dialog ─────────────────────────────── */}
      <Dialog open={manualDialog} onOpenChange={setManualDialog}>
        <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adaugă rezervare manuală</DialogTitle>
          </DialogHeader>
          {selectedDate && (
            <div className="space-y-3 py-2">
              <div className="rounded-md border border-border/40 bg-background/60 px-3 py-2 text-xs">
                <span className="text-muted-foreground">Ziua:</span>{" "}
                <span className="font-medium">{selectedDate}</span>
              </div>

              {/* Start time */}
              <div>
                <Label className="text-xs">Ora de început *</Label>
                <div className="mt-1">
                  <TimePicker
                    value={manualStartTime}
                    onChange={setManualStartTime}
                    bookedRanges={dayBookings
                      .filter(
                        (b) =>
                          b.eventDate === selectedDate &&
                          b.startTime &&
                          b.endTime &&
                          ["pending", "accepted", "confirmed_by_client"].includes(
                            b.status,
                          ),
                      )
                      .map((b) => ({
                        startTime: b.startTime!,
                        endTime: b.endTime!,
                      }))}
                  />
                </div>
              </div>

              {/* Duration — pick a package */}
              <div>
                <Label className="text-xs">Durata (pachet) *</Label>
                {packages.length === 0 ? (
                  <p className="mt-1 rounded-md border border-dashed border-border/40 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                    Nu ai pachete definite. Adaugă tarife la{" "}
                    <a
                      href="/dashboard/tarife"
                      className="text-gold underline"
                    >
                      /dashboard/tarife
                    </a>
                    .
                  </p>
                ) : (
                  <div className="mt-1 grid grid-cols-2 gap-1.5">
                    {packages.map((p) => {
                      const totalMin =
                        Math.round((p.durationHours ?? 0) * 60) +
                        (p.durationMinutes ?? 0);
                      const label =
                        totalMin < 60
                          ? `${totalMin} min`
                          : totalMin % 60 === 0
                            ? `${Math.floor(totalMin / 60)}h`
                            : `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;
                      const selected = manualPackageId === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setManualPackageId(p.id)}
                          className={cn(
                            "flex items-baseline justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-all",
                            selected
                              ? "border-gold bg-gold/10 text-gold"
                              : "border-border/40 hover:border-gold/40",
                          )}
                        >
                          <span className="font-heading font-bold">
                            {label}
                          </span>
                          {p.price != null && (
                            <span className="text-xs">{p.price}€</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Price (auto-filled, editable) */}
              <div>
                <Label className="text-xs">Preț (€)</Label>
                <Input
                  type="number"
                  min="0"
                  value={manualPrice}
                  onChange={(e) => setManualPrice(e.target.value)}
                  placeholder="Preluat automat din pachet"
                  className="mt-1"
                />
              </div>

              {/* Event type — drives the dot color on the calendar grid */}
              <div>
                <Label className="text-xs">Tip eveniment</Label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {Object.entries(EVENT_TYPES).map(([key, cfg]) => {
                    const selected = manualEventType === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setManualEventType(key)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-all",
                          selected
                            ? "border-gold bg-gold/10"
                            : "border-border/40 hover:border-gold/40",
                        )}
                      >
                        <span
                          className={cn("h-2 w-2 rounded-full", cfg.dot)}
                        />
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Note */}
              <div>
                <Label className="text-xs">
                  Note (ex: Nuntă Popescu, Restaurant Codru)
                </Label>
                <Textarea
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                  rows={2}
                  maxLength={500}
                  className="mt-1"
                  placeholder="Detalii despre rezervare…"
                />
              </div>

              {/* Summary */}
              {manualPackageId != null && (() => {
                const pkg = packages.find((p) => p.id === manualPackageId);
                if (!pkg) return null;
                const totalMin =
                  Math.round((pkg.durationHours ?? 0) * 60) +
                  (pkg.durationMinutes ?? 0);
                const [h, m] = manualStartTime.split(":").map(Number);
                const endMin = h * 60 + m + totalMin;
                const eh = Math.floor(endMin / 60) % 24;
                const em = endMin % 60;
                const endStr = `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
                return (
                  <div className="rounded-md border border-gold/30 bg-gold/5 px-3 py-2 text-xs">
                    Interval:{" "}
                    <strong>{manualStartTime}</strong>
                    {" – "}
                    <strong>{endStr}</strong>
                    {manualPrice && (
                      <>
                        {" · "}
                        <span className="font-bold text-gold">
                          {manualPrice}€
                        </span>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setManualDialog(false)}
              disabled={manualSaving}
            >
              Anulează
            </Button>
            {/* Save stays enabled — submitManualBooking surfaces a
                specific toast for each missing field. The earlier
                blanket-disabled state confused partners ("the button
                doesn't react") because they couldn't tell whether the
                form was waiting on a package, a time, or just broken. */}
            <Button
              onClick={submitManualBooking}
              disabled={manualSaving}
              className="gap-1.5 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
            >
              {manualSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salvează
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
