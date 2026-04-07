"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

const statusColors: Record<string, string> = {
  available: "bg-success/20 text-success hover:bg-success/30 cursor-pointer",
  booked: "bg-destructive/20 text-destructive",
  tentative: "bg-warning/20 text-warning",
  blocked: "bg-muted text-muted-foreground",
};

export function CalendarWidget({ entityType, entityId, enabled, onDateSelect }: CalendarWidgetProps) {
  const { t } = useLocale();
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [events, setEvents] = useState<CalendarDay[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchEvents = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const monthStr = `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, "0")}`;
      const res = await fetch(
        `/api/calendar?entity_type=${entityType}&entity_id=${entityId}&month=${monthStr}`,
      );
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      }
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, enabled, currentMonth]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  if (!enabled) {
    return (
      <div className="rounded-xl border border-border/40 bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">{t("artist.calendar_unavailable")}</p>
        <Button className="mt-4 bg-gold text-background hover:bg-gold-dark">
          {t("artist.send_request")}
        </Button>
      </div>
    );
  }

  const { year, month } = currentMonth;
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDay = (firstDay.getDay() + 6) % 7;
  const daysInMonth = lastDay.getDate();

  const eventMap = new Map(events.map((e) => [e.date, e.status]));

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

  return (
    <div className="rounded-xl border border-border/40 bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={prev}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="font-heading text-sm font-bold">
          {MONTHS_RO[month]} {year}
        </h3>
        <Button variant="ghost" size="icon" onClick={next}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="mb-2 grid grid-cols-7 text-center text-xs font-medium text-muted-foreground">
        {DAYS_RO.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className={cn("grid grid-cols-7 gap-1", loading && "opacity-50")}>
        {Array.from({ length: startDay }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const status = eventMap.get(dateStr);

          return (
            <button
              key={day}
              onClick={() => {
                if ((!status || status === "available") && onDateSelect) onDateSelect(dateStr);
              }}
              className={cn(
                "flex h-8 w-full items-center justify-center rounded text-xs font-medium transition-colors",
                status ? statusColors[status] : "text-muted-foreground hover:bg-accent",
              )}
            >
              {day}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-success" /> {t("common.available")}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive" /> {t("common.booked")}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-warning" /> {t("common.tentative")}
        </span>
      </div>
    </div>
  );
}
