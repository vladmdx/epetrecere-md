"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Link as LinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const DAYS = ["Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă", "Duminică"];
const MONTHS = [
  "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
  "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie",
];

type DayStatus = "available" | "booked" | "tentative" | "blocked" | null;

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  available: { label: "Disponibil", color: "text-success", bg: "bg-success/15 border-success/30 hover:bg-success/25" },
  booked: { label: "Ocupat", color: "text-destructive", bg: "bg-destructive/15 border-destructive/30" },
  tentative: { label: "Tentativ", color: "text-warning", bg: "bg-warning/15 border-warning/30 hover:bg-warning/25" },
  blocked: { label: "Blocat", color: "text-muted-foreground", bg: "bg-muted border-muted-foreground/20" },
};

// Demo events
const demoEvents: Record<string, DayStatus> = {
  "2026-04-11": "booked",
  "2026-04-12": "booked",
  "2026-04-18": "tentative",
  "2026-04-25": "available",
  "2026-04-26": "available",
  "2026-05-02": "booked",
  "2026-05-09": "blocked",
  "2026-05-16": "available",
};

export default function VendorCalendarPage() {
  const [currentMonth, setCurrentMonth] = useState({ year: 2026, month: 3 }); // April 2026
  const [events, setEvents] = useState(demoEvents);
  const [selectedTool, setSelectedTool] = useState<DayStatus>("available");

  const { year, month } = currentMonth;
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDay = (firstDay.getDay() + 6) % 7;
  const daysInMonth = lastDay.getDate();

  const prev = () => setCurrentMonth((c) => c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 });
  const next = () => setCurrentMonth((c) => c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 });

  function toggleDay(dateStr: string) {
    setEvents((prev) => {
      const current = prev[dateStr];
      if (current === selectedTool) {
        const copy = { ...prev };
        delete copy[dateStr];
        return copy;
      }
      return { ...prev, [dateStr]: selectedTool };
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Calendar</h1>
          <p className="text-sm text-muted-foreground">Gestionează disponibilitatea ta</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2"><LinkIcon className="h-4 w-4" /> Google Calendar Sync</Button>
          <Button className="bg-gold text-background hover:bg-gold-dark">Salvează</Button>
        </div>
      </div>

      {/* Status tool selector */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-3">
          <span className="text-sm text-muted-foreground">Click pe zile pentru a marca:</span>
          {(Object.entries(statusConfig) as [DayStatus & string, typeof statusConfig[string]][]).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => setSelectedTool(key as DayStatus)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                selectedTool === key ? `${cfg.bg} ring-2 ring-offset-1 ring-offset-background` : "border-border/40 hover:border-gold/30",
                cfg.color,
              )}
            >
              <span className={cn("h-2.5 w-2.5 rounded-full", key === "available" ? "bg-success" : key === "booked" ? "bg-destructive" : key === "tentative" ? "bg-warning" : "bg-muted-foreground")} />
              {cfg.label}
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Calendar */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={prev}><ChevronLeft className="h-5 w-5" /></Button>
            <CardTitle>{MONTHS[month]} {year}</CardTitle>
            <Button variant="ghost" size="icon" onClick={next}><ChevronRight className="h-5 w-5" /></Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Day headers */}
          <div className="mb-2 grid grid-cols-7 text-center">
            {DAYS.map((d) => (
              <div key={d} className="py-2 text-xs font-medium text-muted-foreground">{d.substring(0, 2)}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: startDay }).map((_, i) => <div key={`e-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const status = events[dateStr];
              const cfg = status ? statusConfig[status] : null;
              const isWeekend = ((startDay + i) % 7) >= 5;

              return (
                <button
                  key={day}
                  onClick={() => toggleDay(dateStr)}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center rounded-lg border text-sm font-medium transition-all",
                    cfg ? cfg.bg : "border-border/20 hover:border-gold/30 hover:bg-accent",
                    isWeekend && !cfg && "bg-accent/30",
                  )}
                >
                  <span className={cn("text-base", cfg?.color)}>{day}</span>
                  {cfg && <span className={cn("text-[10px] mt-0.5", cfg.color)}>{cfg.label}</span>}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        {Object.entries(statusConfig).map(([key, cfg]) => {
          const count = Object.values(events).filter((s) => s === key).length;
          return (
            <Card key={key}>
              <CardContent className="flex items-center gap-3 pt-6">
                <span className={cn("h-4 w-4 rounded-full", key === "available" ? "bg-success" : key === "booked" ? "bg-destructive" : key === "tentative" ? "bg-warning" : "bg-muted-foreground")} />
                <div>
                  <p className="text-xl font-bold">{count}</p>
                  <p className="text-xs text-muted-foreground">{cfg.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
