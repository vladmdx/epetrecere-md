"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronLeft,
  ChevronRight,
  Save,
  Loader2,
  X,
  Copy,
  Calendar as CalendarIcon,
  Check,
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
  const [selectedEndTime, setSelectedEndTime] = useState("22:00");
  const [saving, setSaving] = useState(false);
  const [schedule, setSchedule] = useState<WorkDay[]>(
    DAYS.map((_, i) => ({
      dayOfWeek: i,
      startTime: i < 5 ? "10:00" : "12:00",
      endTime: i < 5 ? "22:00" : "23:00",
      isWorking: true,
    })),
  );

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

  const { year, month } = currentMonth;
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDay = (firstDay.getDay() + 6) % 7;
  const daysInMonth = lastDay.getDate();

  function handleDayClick(dateStr: string) {
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
                    const statusCfg = entry ? statusColors[entry.status] : null;
                    const evCfg = entry?.eventType
                      ? EVENT_TYPES[entry.eventType]
                      : null;
                    const isSelected = selectedDate === dateStr;
                    return (
                      <button
                        key={day}
                        onClick={() => handleDayClick(dateStr)}
                        className={cn(
                          "relative flex h-16 flex-col items-center justify-center rounded-lg border text-sm font-medium transition-all",
                          isSelected &&
                            "ring-2 ring-gold ring-offset-1 ring-offset-background",
                          statusCfg
                            ? statusCfg.bg
                            : "border-border/20 hover:border-gold/30",
                          // F-S6 — left-border accent for event type
                          evCfg && `border-l-4 ${evCfg.border}`,
                        )}
                        title={
                          entry
                            ? `${statusCfg?.label}${evCfg ? ` · ${evCfg.label}` : ""}${entry.note ? ` — ${entry.note}` : ""}`
                            : undefined
                        }
                      >
                        <span className={cn(statusCfg?.color)}>{day}</span>
                        {evCfg && (
                          <span
                            className={cn(
                              "mt-0.5 h-1.5 w-1.5 rounded-full",
                              evCfg.dot,
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
                    <div>
                      <Label>Status</Label>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {Object.entries(statusColors).map(([key, cfg]) => (
                          <button
                            key={key}
                            onClick={() => setSelectedStatus(key)}
                            className={cn(
                              "rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                              selectedStatus === key
                                ? `${cfg.bg} ring-1 ring-offset-1`
                                : "border-border/40",
                              cfg.color,
                            )}
                          >
                            {cfg.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* F-S6 — Event type picker (only relevant for booked/tentative) */}
                    {(selectedStatus === "booked" ||
                      selectedStatus === "tentative") && (
                      <div>
                        <Label>Tip eveniment</Label>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {Object.entries(EVENT_TYPES).map(([key, cfg]) => (
                            <button
                              key={key}
                              onClick={() => setSelectedEventType(key)}
                              className={cn(
                                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                                selectedEventType === key
                                  ? `border-l-4 ${cfg.border} bg-accent/50`
                                  : "border-border/40",
                              )}
                            >
                              <span
                                className={cn("h-2 w-2 rounded-full", cfg.dot)}
                              />
                              {cfg.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label>Ora început</Label>
                        <Input
                          type="time"
                          value={selectedStartTime}
                          onChange={(e) => setSelectedStartTime(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Ora sfârșit</Label>
                        <Input
                          type="time"
                          value={selectedEndTime}
                          onChange={(e) => setSelectedEndTime(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Detalii / Note</Label>
                      <Input
                        value={selectedNote}
                        onChange={(e) => setSelectedNote(e.target.value)}
                        placeholder="Ex: Nuntă Popescu, Restaurant Codru"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={saveDay}
                        disabled={saving}
                        className="flex-1 bg-gold text-background hover:bg-gold-dark"
                      >
                        {saving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Save className="mr-1 h-4 w-4" /> Salvează Ziua
                          </>
                        )}
                      </Button>
                      {events[selectedDate] && (
                        <Button
                          variant="outline"
                          className="text-destructive"
                          onClick={removeDay}
                          disabled={saving}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Click pe o zi din calendar pentru a seta disponibilitatea,
                    tipul evenimentului și detaliile.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {entity.type === "artist" && (
          <TabsContent value="schedule" className="mt-6 space-y-4">
            <div className="flex justify-end">
              <Button
                onClick={saveSchedule}
                disabled={saving}
                className="gap-2 bg-gold text-background hover:bg-gold-dark"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}{" "}
                Salvează Grafic
              </Button>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Grafic de Lucru Săptămânal</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {schedule.map((day, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="w-24 text-sm font-medium">{DAYS[i]}</div>
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
                        <Input
                          type="time"
                          value={day.startTime}
                          onChange={(e) => {
                            const copy = [...schedule];
                            copy[i] = { ...copy[i], startTime: e.target.value };
                            setSchedule(copy);
                          }}
                          className="w-28"
                        />
                        <span className="text-muted-foreground">—</span>
                        <Input
                          type="time"
                          value={day.endTime}
                          onChange={(e) => {
                            const copy = [...schedule];
                            copy[i] = { ...copy[i], endTime: e.target.value };
                            setSchedule(copy);
                          }}
                          className="w-28"
                        />
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        Zi liberă
                      </span>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {entity.type === "artist" && <IcalSubscribeCard />}
    </div>
  );
}

// M5 — iCal subscription URL widget. Fetches the HMAC-signed personal URL
// from /api/vendor/ical-info and lets the vendor copy it into Google /
// Apple / Outlook calendar.
function IcalSubscribeCard() {
  const [path, setPath] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/vendor/ical-info")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.path) setPath(data.path);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !path) return null;
  const fullUrl =
    typeof window !== "undefined" ? `${window.location.origin}${path}` : path;

  async function copy() {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      toast.success("Link copiat!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Nu am putut copia linkul.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarIcon className="h-4 w-4 text-gold" /> Sincronizează cu
          calendarul tău
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Abonează-te la acest link în Google Calendar, Apple Calendar sau
          Outlook și toate rezervările tale confirmate vor apărea automat.
          Linkul este personal — nu-l da nimănui.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input readOnly value={fullUrl} className="flex-1 font-mono text-xs" />
          <Button onClick={copy} variant="outline" className="gap-1.5">
            {copied ? (
              <Check className="h-4 w-4 text-success" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copied ? "Copiat" : "Copiază"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
