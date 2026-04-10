"use client";

import { useState, useRef, useEffect } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

function getTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
}

function formatDisplay(d: Date) {
  return d.toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" });
}

interface CustomCalendarProps {
  /** Optional label rendered above the trigger button */
  label?: string;
  /** Selected date or null for empty state */
  value: Date | null;
  /** Called when the user picks a day */
  onChange: (d: Date) => void;
  /** Placeholder shown when value is null */
  placeholder?: string;
  /** Extra classes applied to the outer wrapper */
  className?: string;
}

/**
 * The custom dark-themed calendar used both in the homepage search bar
 * and in the /planifica wizard. Picks a single date, disables past days,
 * and offers "Mâine" / "Sâmbătă viitoare" shortcuts in the footer.
 */
export function CustomCalendar({
  label,
  value,
  onChange,
  placeholder = "Alege data",
  className,
}: CustomCalendarProps) {
  const [open, setOpen] = useState(false);
  // Track the visible month as an offset from the "base" month (selected value
  // or today). This way the view auto-follows external value changes without
  // needing an effect-driven setState.
  const [monthOffset, setMonthOffset] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const baseDate = value ?? new Date();
  const viewDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + monthOffset, 1);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const monthNames = ["Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie", "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"];
  const dayNames = ["Lu", "Ma", "Mi", "Jo", "Vi", "Sâ", "Du"];

  // Start from Monday (adjust firstDay)
  const startDay = firstDay === 0 ? 6 : firstDay - 1;

  const cells: { day: number; current: boolean; date: Date }[] = [];

  // Previous month days
  for (let i = startDay - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    cells.push({ day: d, current: false, date: new Date(year, month - 1, d) });
  }
  // Current month
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({ day: i, current: true, date: new Date(year, month, i) });
  }
  // Next month
  const remaining = 42 - cells.length;
  for (let i = 1; i <= remaining; i++) {
    cells.push({ day: i, current: false, date: new Date(year, month + 1, i) });
  }

  function isSelected(d: Date) {
    return value ? d.toDateString() === value.toDateString() : false;
  }
  function isToday(d: Date) {
    return d.toDateString() === today.toDateString();
  }
  function isPast(d: Date) {
    return d < today;
  }

  return (
    <div className={cn("flex-1 relative", className)} ref={ref}>
      {label && (
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gold/70">
          {label}
        </label>
      )}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "relative flex h-12 w-full items-center gap-3 rounded-xl border px-4 text-sm transition-all duration-200",
          "bg-[#1A1A2E]/80 backdrop-blur-sm",
          open
            ? "border-gold/50 shadow-[0_0_15px_rgba(201,168,76,0.15)] ring-1 ring-gold/20"
            : "border-white/10 hover:border-gold/30 hover:shadow-[0_0_10px_rgba(201,168,76,0.08)]"
        )}
      >
        <CalendarDays className="h-4 w-4 text-gold shrink-0" />
        <span className={cn("flex-1 text-left", value ? "text-white/90" : "text-white/40")}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-gold/60 transition-transform duration-200", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-50 mt-2 left-0 w-[300px] rounded-xl border border-gold/20 bg-[#141428]/98 backdrop-blur-xl p-4 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() => setMonthOffset((o) => o - 1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-gold transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold text-white">
              {monthNames[month]} {year}
            </span>
            <button
              type="button"
              onClick={() => setMonthOffset((o) => o + 1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-gold transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Day names */}
          <div className="grid grid-cols-7 mb-1">
            {dayNames.map((d) => (
              <div key={d} className="text-center text-[10px] font-medium uppercase tracking-wider text-gold/50 py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((cell, i) => (
              <button
                key={i}
                type="button"
                disabled={isPast(cell.date)}
                onClick={() => {
                  onChange(cell.date);
                  setMonthOffset(0);
                  setOpen(false);
                }}
                className={cn(
                  "h-9 w-full rounded-lg text-xs font-medium transition-all duration-150",
                  !cell.current && "text-white/20",
                  cell.current && !isPast(cell.date) && !isSelected(cell.date) && !isToday(cell.date) && "text-white/70 hover:bg-gold/15 hover:text-gold",
                  cell.current && isPast(cell.date) && "text-white/15 cursor-not-allowed",
                  isToday(cell.date) && !isSelected(cell.date) && "border border-gold/40 text-gold",
                  isSelected(cell.date) && "bg-gold text-[#0D0D0D] font-bold shadow-[0_0_12px_rgba(201,168,76,0.3)]",
                )}
              >
                {cell.day}
              </button>
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
            <button
              type="button"
              onClick={() => {
                onChange(getTomorrow());
                setMonthOffset(0);
                setOpen(false);
              }}
              className="text-xs text-gold/70 hover:text-gold transition-colors"
            >
              Mâine
            </button>
            <button
              type="button"
              onClick={() => {
                const next = new Date();
                next.setDate(next.getDate() + ((6 - next.getDay() + 7) % 7 || 7));
                onChange(next);
                setMonthOffset(0);
                setOpen(false);
              }}
              className="text-xs text-gold/70 hover:text-gold transition-colors"
            >
              Sâmbătă viitoare
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
