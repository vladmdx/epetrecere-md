"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, Save, Clock, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const DAYS = ["Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă", "Duminică"];
const MONTHS = ["Ianuarie","Februarie","Martie","Aprilie","Mai","Iunie","Iulie","August","Septembrie","Octombrie","Noiembrie","Decembrie"];

const statusColors: Record<string, { label: string; color: string; bg: string }> = {
  available: { label: "Disponibil", color: "text-success", bg: "bg-success/15 border-success/30" },
  booked: { label: "Ocupat", color: "text-destructive", bg: "bg-destructive/15 border-destructive/30" },
  tentative: { label: "Tentativ", color: "text-warning", bg: "bg-warning/15 border-warning/30" },
  blocked: { label: "Blocat", color: "text-muted-foreground", bg: "bg-muted border-muted-foreground/20" },
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
  note?: string;
  startTime?: string;
  endTime?: string;
}

export default function VendorCalendarPage() {
  const [currentMonth, setCurrentMonth] = useState({ year: 2026, month: 3 });
  const [events, setEvents] = useState<Record<string, CalendarEntry>>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState("booked");
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
      setSelectedNote(existing.note || "");
      setSelectedStartTime(existing.startTime || "10:00");
      setSelectedEndTime(existing.endTime || "22:00");
    } else {
      setSelectedStatus("booked");
      setSelectedNote("");
      setSelectedStartTime("10:00");
      setSelectedEndTime("22:00");
    }
  }

  function saveEvent() {
    if (!selectedDate) return;
    setEvents((prev) => ({
      ...prev,
      [selectedDate]: {
        date: selectedDate,
        status: selectedStatus,
        note: selectedNote,
        startTime: selectedStartTime,
        endTime: selectedEndTime,
      },
    }));
    setSelectedDate(null);
    toast.success("Ziua actualizată!");
  }

  function removeEvent() {
    if (!selectedDate) return;
    setEvents((prev) => {
      const copy = { ...prev };
      delete copy[selectedDate];
      return copy;
    });
    setSelectedDate(null);
  }

  async function saveSchedule() {
    setSaving(true);
    try {
      await fetch("/api/work-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artistId: 1, schedule }),
      });
      toast.success("Graficul de lucru salvat!");
    } catch {
      toast.error("Eroare la salvare");
    } finally {
      setSaving(false);
    }
  }

  async function saveCalendar() {
    setSaving(true);
    const entries = Object.values(events);
    try {
      for (const entry of entries) {
        await fetch("/api/calendar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity_type: "artist",
            entity_id: 1,
            dates: [entry.date],
            status: entry.status,
          }),
        });
      }
      toast.success("Calendarul salvat!");
    } catch {
      toast.error("Eroare la salvare");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Calendar & Program</h1>
          <p className="text-sm text-muted-foreground">Gestionează disponibilitatea și graficul de lucru</p>
        </div>
      </div>

      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="schedule">Grafic de Lucru</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="mt-6 space-y-4">
          <div className="flex justify-end">
            <Button onClick={saveCalendar} disabled={saving} className="bg-gold text-background hover:bg-gold-dark gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvează Calendar
            </Button>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3">
            {Object.entries(statusColors).map(([key, cfg]) => (
              <span key={key} className="flex items-center gap-1.5 text-xs">
                <span className={cn("h-3 w-3 rounded-full", key === "available" ? "bg-success" : key === "booked" ? "bg-destructive" : key === "tentative" ? "bg-warning" : "bg-muted-foreground")} />
                {cfg.label}
              </span>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Calendar Grid */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(c => c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 })}>
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <CardTitle>{MONTHS[month]} {year}</CardTitle>
                  <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(c => c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 })}>
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-2 grid grid-cols-7 text-center">
                  {DAYS.map(d => <div key={d} className="py-2 text-xs font-medium text-muted-foreground">{d.substring(0, 2)}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: startDay }).map((_, i) => <div key={`e-${i}`} />)}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const entry = events[dateStr];
                    const cfg = entry ? statusColors[entry.status] : null;
                    const isSelected = selectedDate === dateStr;
                    return (
                      <button key={day} onClick={() => handleDayClick(dateStr)} className={cn(
                        "flex h-16 flex-col items-center justify-center rounded-lg border text-sm font-medium transition-all",
                        isSelected && "ring-2 ring-gold ring-offset-1 ring-offset-background",
                        cfg ? cfg.bg : "border-border/20 hover:border-gold/30",
                      )}>
                        <span className={cn(cfg?.color)}>{day}</span>
                        {entry && <span className={cn("text-[9px] mt-0.5", cfg?.color)}>{entry.startTime}-{entry.endTime}</span>}
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
                          <button key={key} onClick={() => setSelectedStatus(key)} className={cn(
                            "rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                            selectedStatus === key ? `${cfg.bg} ring-1 ring-offset-1` : "border-border/40",
                            cfg.color,
                          )}>
                            {cfg.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label>Ora început</Label><Input type="time" value={selectedStartTime} onChange={e => setSelectedStartTime(e.target.value)} /></div>
                      <div><Label>Ora sfârșit</Label><Input type="time" value={selectedEndTime} onChange={e => setSelectedEndTime(e.target.value)} /></div>
                    </div>
                    <div><Label>Detalii / Note</Label><Input value={selectedNote} onChange={e => setSelectedNote(e.target.value)} placeholder="Ex: Nuntă Popescu, Restaurant Codru" /></div>
                    <div className="flex gap-2">
                      <Button onClick={saveEvent} className="flex-1 bg-gold text-background hover:bg-gold-dark">Salvează Ziua</Button>
                      {events[selectedDate] && (
                        <Button variant="outline" className="text-destructive" onClick={removeEvent}><X className="h-4 w-4" /></Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Click pe o zi din calendar pentru a seta disponibilitatea, orele și detaliile.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="schedule" className="mt-6 space-y-4">
          <div className="flex justify-end">
            <Button onClick={saveSchedule} disabled={saving} className="bg-gold text-background hover:bg-gold-dark gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvează Grafic
            </Button>
          </div>
          <Card>
            <CardHeader><CardTitle>Grafic de Lucru Săptămânal</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {schedule.map((day, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="w-24 text-sm font-medium">{DAYS[i]}</div>
                  <Switch checked={day.isWorking} onCheckedChange={v => {
                    const copy = [...schedule];
                    copy[i] = { ...copy[i], isWorking: v };
                    setSchedule(copy);
                  }} />
                  {day.isWorking ? (
                    <>
                      <Input type="time" value={day.startTime} onChange={e => {
                        const copy = [...schedule]; copy[i] = { ...copy[i], startTime: e.target.value }; setSchedule(copy);
                      }} className="w-28" />
                      <span className="text-muted-foreground">—</span>
                      <Input type="time" value={day.endTime} onChange={e => {
                        const copy = [...schedule]; copy[i] = { ...copy[i], endTime: e.target.value }; setSchedule(copy);
                      }} className="w-28" />
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">Zi liberă</span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
