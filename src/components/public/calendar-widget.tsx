"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLocale } from "@/hooks/use-locale";

interface CalendarWidgetProps {
  entityType: "artist" | "venue";
  entityId: number;
  enabled: boolean;
  onDateSelect?: (date: string) => void;
}

interface CalendarDay {
  date: string;
  status: "available" | "booked" | "tentative" | "blocked";
}

const DAYS_RO = ["Lu", "Ma", "Mi", "Jo", "Vi", "Sâ", "Du"];
const MONTHS_RO = [
  "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
  "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie",
];

export function CalendarWidget({ entityType, entityId, enabled, onDateSelect }: CalendarWidgetProps) {
  const { t } = useLocale();
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [events, setEvents] = useState<CalendarDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const monthStr = `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, "0")}`;
      const res = await fetch(
        `/api/calendar?entity_type=${entityType}&entity_id=${entityId}&month=${monthStr}`,
      );
      if (res.ok) {
        const data = await res.json();
        setEvents(Array.isArray(data) ? data : []);
      }
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, currentMonth]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const { year, month } = currentMonth;
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDay = (firstDay.getDay() + 6) % 7;
  const daysInMonth = lastDay.getDate();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build event map from API data
  const eventMap = new Map(events.map((e) => {
    // Handle date strings that come as ISO timestamps
    const dateStr = e.date.includes("T") ? e.date.split("T")[0] : e.date;
    return [dateStr, e.status];
  }));

  const prev = () => {
    setCurrentMonth((c) =>
      c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 },
    );
  };
  const next = () => {
    setCurrentMonth((c) =>
      c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 },
    );
  };

  function handleDayClick(dateStr: string, status: string | undefined) {
    if (status === "booked" || status === "blocked") return;
    setSelectedDate(dateStr);
    if (onDateSelect) onDateSelect(dateStr);
  }

  return (
    <div className="rounded-xl border border-border/40 bg-card p-4">
      {/* Header */}
      <div className="mb-1 flex items-center gap-2 text-sm font-heading font-bold">
        <CalendarDays className="h-4 w-4 text-gold" />
        <span>Disponibilitate</span>
      </div>

      {/* Month nav */}
      <div className="mb-3 flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={prev} className="h-7 w-7">
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <h3 className="text-xs font-semibold text-muted-foreground">
          {MONTHS_RO[month]} {year}
        </h3>
        <Button variant="ghost" size="icon" onClick={next} className="h-7 w-7">
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Day names */}
      <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-medium uppercase tracking-wider text-gold/50">
        {DAYS_RO.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className={cn("grid grid-cols-7 gap-0.5", loading && "opacity-40")}>
        {Array.from({ length: startDay }).map((_, i) => (
          <div key={`empty-${i}`} className="h-7" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const status = eventMap.get(dateStr);
          const dateObj = new Date(year, month, day);
          const isPast = dateObj < today;
          const isToday = dateObj.toDateString() === today.toDateString();
          const isSelected = selectedDate === dateStr;

          // Determine display style
          let dayClass = "";
          if (isPast) {
            dayClass = "text-white/15 cursor-not-allowed";
          } else if (status === "booked" || status === "blocked") {
            dayClass = "bg-destructive/25 text-destructive/90 cursor-not-allowed";
          } else if (status === "tentative") {
            dayClass = "bg-warning/20 text-warning cursor-pointer hover:bg-warning/30";
          } else if (isSelected) {
            dayClass = "bg-gold text-[#0D0D0D] font-bold shadow-[0_0_8px_rgba(201,168,76,0.3)]";
          } else {
            // Available (explicitly or no record = free)
            dayClass = "bg-success/15 text-success/90 cursor-pointer hover:bg-success/25";
          }

          return (
            <button
              key={day}
              type="button"
              disabled={isPast || status === "booked" || status === "blocked"}
              onClick={() => handleDayClick(dateStr, status)}
              className={cn(
                "flex h-7 w-full items-center justify-center rounded-md text-[11px] font-medium transition-all",
                dayClass,
                isToday && !isSelected && "ring-1 ring-gold/50",
              )}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-success" /> Liber
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-destructive" /> Ocupat
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-warning" /> Tentativ
        </span>
      </div>

      {/* Selected date info */}
      {selectedDate && (
        <div className="mt-3 rounded-lg bg-gold/10 border border-gold/20 p-2.5 text-center">
          <p className="text-xs text-gold font-medium">
            {(() => {
              const d = new Date(selectedDate + "T00:00:00");
              return `${d.getDate()} ${MONTHS_RO[d.getMonth()]} ${d.getFullYear()}`;
            })()}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Data selectată — apăsați &quot;Solicită Rezervare&quot; pentru a rezerva
          </p>
        </div>
      )}
    </div>
  );
}
