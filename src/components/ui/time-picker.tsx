"use client";

// TimePicker — themed replacement for <input type="time">.
// Uses a portal popover so it escapes any overflow-clipping parent.
// Hours 0–23 and minutes in 15-minute steps by default; the popover
// snaps the current selection into view and supports keyboard input
// via a direct typing fallback.

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TimePickerProps {
  value: string; // "HH:MM" 24-hour, or "" for empty
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  /** Minutes step — defaults to 15 (00, 15, 30, 45). Use 5 or 1 for finer grain. */
  minuteStep?: number;
  /** Already-booked time ranges (HH:MM). Matching slots are hidden/disabled. */
  bookedRanges?: Array<{ startTime: string; endTime: string }>;
  /** If true, the whole day is unavailable (all slots disabled). */
  wholeDayBlocked?: boolean;
  /**
   * Working hours window for the selected day:
   *   { start: "HH:MM", end: "HH:MM" } — only show hours within window.
   *   null  — explicit day off (everything hidden)
   *   undefined — no restriction (full 0–23 range)
   */
  workingHours?: { start: string; end: string } | null;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function parseTime(value: string): { h: number; m: number } | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

/** Check if a given HH:MM is inside any of the booked ranges (inclusive of start, exclusive of end). */
function isTimeBooked(
  h: number,
  m: number,
  bookedRanges: Array<{ startTime: string; endTime: string }> | undefined,
): boolean {
  if (!bookedRanges || bookedRanges.length === 0) return false;
  const minutes = h * 60 + m;
  for (const r of bookedRanges) {
    const s = parseTime(r.startTime);
    const e = parseTime(r.endTime);
    if (!s || !e) continue;
    const sMin = s.h * 60 + s.m;
    const eMin = e.h * 60 + e.m;
    if (minutes >= sMin && minutes < eMin) return true;
  }
  return false;
}

export function TimePicker({
  value,
  onChange,
  disabled,
  className,
  placeholder = "--:--",
  minuteStep = 15,
  bookedRanges,
  wholeDayBlocked,
  workingHours,
}: TimePickerProps) {
  const parsed = parseTime(value);
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(value);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [popPos, setPopPos] = useState<{
    top: number;
    left: number;
    width: number;
  }>({ top: 0, left: 0, width: 0 });

  // Keep the typing buffer in sync when value is changed externally.
  useEffect(() => {
    setTyping(value);
  }, [value]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Position the popover below the trigger, right-aligned if it would
  // overflow the viewport.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const update = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      const popWidth = 240;
      let left = rect.left + window.scrollX;
      if (left + popWidth > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - popWidth - 8);
      }
      setPopPos({
        top: rect.bottom + window.scrollY + 6,
        left,
        width: rect.width,
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        popRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      )
        return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Scroll active hour/minute into view when popover opens.
  useLayoutEffect(() => {
    if (!open || !popRef.current) return;
    requestAnimationFrame(() => {
      popRef.current
        ?.querySelector<HTMLElement>('[data-active-hour="true"]')
        ?.scrollIntoView({ block: "center" });
      popRef.current
        ?.querySelector<HTMLElement>('[data-active-minute="true"]')
        ?.scrollIntoView({ block: "center" });
    });
  }, [open]);

  // Resolve the working-hours window. null = day off (hide everything).
  // undefined / no value = no restriction (full 0..23 range).
  const wsWindow = useMemo(() => {
    if (workingHours === null) return { offDay: true as const };
    if (workingHours) {
      const s = parseTime(workingHours.start);
      const e = parseTime(workingHours.end);
      if (s && e) {
        // 00:00 close means midnight (24h)
        const startMin = s.h * 60 + s.m;
        const endMinRaw = e.h * 60 + e.m;
        const endMin = endMinRaw === 0 ? 24 * 60 : endMinRaw;
        return { offDay: false as const, startMin, endMin };
      }
    }
    return { offDay: false as const, startMin: 0, endMin: 24 * 60 };
  }, [workingHours]);

  // Hours that contain at least one selectable minute inside the window.
  const allHours = useMemo(() => {
    if (wsWindow.offDay) return [] as number[];
    const out: number[] = [];
    for (let h = 0; h < 24; h++) {
      const hStart = h * 60;
      const hEnd = (h + 1) * 60;
      // Hour is visible if any minute of it is inside the window
      if (hEnd > wsWindow.startMin && hStart < wsWindow.endMin) out.push(h);
    }
    return out;
  }, [wsWindow]);

  const allMinutes = useMemo(() => {
    const step = Math.max(1, Math.min(30, minuteStep));
    const out: number[] = [];
    for (let m = 0; m < 60; m += step) out.push(m);
    return out;
  }, [minuteStep]);

  // Restrict minutes to those inside the working-hours window for the
  // currently-active hour. E.g. if window ends at 22:00 and the user is
  // on hour 21, all four minute slots are valid; on hour 22, only :00.
  const allowedMinutesForHour = useMemo(() => {
    if (wsWindow.offDay) return new Set<number>();
    const h = parsed?.h;
    if (h === undefined) return new Set(allMinutes);
    const set = new Set<number>();
    for (const m of allMinutes) {
      const total = h * 60 + m;
      if (total >= wsWindow.startMin && total < wsWindow.endMin) set.add(m);
    }
    return set;
  }, [wsWindow, parsed?.h, allMinutes]);

  // An hour is fully booked if every minute step inside it is booked.
  const fullyBookedHours = useMemo(() => {
    if (wholeDayBlocked) return new Set(allHours);
    const set = new Set<number>();
    if (!bookedRanges?.length) return set;
    for (const h of allHours) {
      const allMinutesBlocked = allMinutes.every((m) =>
        isTimeBooked(h, m, bookedRanges),
      );
      if (allMinutesBlocked) set.add(h);
    }
    return set;
  }, [allHours, allMinutes, bookedRanges, wholeDayBlocked]);

  // For the currently-selected hour, which minutes are booked OR outside
  // the working-hours window?
  const bookedMinutesForHour = useMemo(() => {
    if (wholeDayBlocked) return new Set(allMinutes);
    const set = new Set<number>();
    const h = parsed?.h;
    // Mark minutes outside the working window as disabled
    for (const m of allMinutes) {
      if (!allowedMinutesForHour.has(m)) set.add(m);
    }
    if (!bookedRanges?.length) return set;
    if (h === undefined) return set;
    for (const m of allMinutes) {
      if (isTimeBooked(h, m, bookedRanges)) set.add(m);
    }
    return set;
  }, [allMinutes, bookedRanges, wholeDayBlocked, parsed?.h, allowedMinutesForHour]);

  const hours = allHours;
  const minutes = allMinutes;

  function setHM(h: number, m: number) {
    onChange(`${pad2(h)}:${pad2(m)}`);
  }

  function commitTyping() {
    const p = parseTime(typing);
    if (p) {
      setHM(p.h, p.m);
    } else {
      setTyping(value); // revert
    }
  }

  const displayValue = parsed ? `${pad2(parsed.h)}:${pad2(parsed.m)}` : "";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "group flex h-11 w-full items-center gap-2.5 rounded-lg border border-border/60 bg-background/80 px-3 text-left text-sm transition-all",
          "hover:border-gold/50 hover:bg-background focus:border-gold/70 focus:outline-none focus:ring-2 focus:ring-gold/20",
          open && "border-gold/70 ring-2 ring-gold/20",
          disabled && "cursor-not-allowed opacity-60",
          className,
        )}
      >
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors",
            open || displayValue
              ? "bg-gold/15 text-gold"
              : "bg-accent/40 text-foreground/70 group-hover:bg-gold/10 group-hover:text-gold",
          )}
        >
          <Clock className="h-3.5 w-3.5" />
        </div>
        <input
          type="text"
          inputMode="numeric"
          value={typing}
          onChange={(e) => setTyping(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={commitTyping}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitTyping();
              setOpen(false);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          disabled={disabled}
          placeholder={placeholder}
          className="flex-1 bg-transparent font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
          aria-label="Selector oră"
        />
        {!displayValue && (
          <span className="font-mono text-xs text-muted-foreground/60">
            HH:MM
          </span>
        )}
      </button>

      {open &&
        mounted &&
        createPortal(
          <div
            ref={popRef}
            style={{
              position: "absolute",
              top: popPos.top,
              left: popPos.left,
              width: 240,
              zIndex: 9999,
            }}
            className="overflow-hidden rounded-xl border border-gold/30 bg-card shadow-[0_20px_60px_-10px_rgba(201,168,76,0.25)] backdrop-blur-sm"
          >
            <div className="flex items-center justify-between border-b border-border/40 bg-gradient-to-r from-gold/5 to-transparent px-3 py-2.5 text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-3 w-3" />
                Alege ora
              </span>
              <span className="rounded-md bg-gold/10 px-2 py-0.5 font-mono text-sm font-bold text-gold">
                {displayValue || "--:--"}
              </span>
            </div>
            <div className="grid grid-cols-2 divide-x divide-border/30">
              <TimeColumn
                label="Oră"
                items={hours}
                active={parsed?.h}
                format={pad2}
                onPick={(h) => setHM(h, parsed?.m ?? 0)}
                dataKey="active-hour"
                disabledItems={fullyBookedHours}
              />
              <TimeColumn
                label="Min"
                items={minutes}
                active={parsed?.m}
                format={pad2}
                onPick={(m) => setHM(parsed?.h ?? 0, m)}
                dataKey="active-minute"
                disabledItems={bookedMinutesForHour}
              />
            </div>
            {/* Quick-pick strip — common event start times. */}
            <div className="flex flex-wrap gap-1.5 border-t border-border/30 bg-background/40 p-2">
              {[
                "12:00",
                "14:00",
                "16:00",
                "17:00",
                "18:00",
                "19:00",
                "20:00",
              ].map((q) => {
                const p = parseTime(q)!;
                const isBooked = wholeDayBlocked || isTimeBooked(p.h, p.m, bookedRanges);
                if (isBooked) return null; // hide booked quick picks
                // Hide quick picks outside working hours
                if (wsWindow.offDay) return null;
                const totalMin = p.h * 60 + p.m;
                if (
                  totalMin < wsWindow.startMin ||
                  totalMin >= wsWindow.endMin
                ) {
                  return null;
                }
                const selected = displayValue === q;
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => {
                      setHM(p.h, p.m);
                      setOpen(false);
                    }}
                    className={cn(
                      "rounded-md border px-2 py-1 text-[11px] transition-all",
                      selected
                        ? "border-gold bg-gold/10 text-gold"
                        : "border-border/40 text-muted-foreground hover:border-gold/40 hover:text-foreground",
                    )}
                  >
                    {q}
                  </button>
                );
              })}
            </div>
            {(bookedRanges?.length ?? 0) > 0 && !wholeDayBlocked && (
              <div className="border-t border-border/30 bg-amber-500/5 px-3 py-1.5 text-[10px] text-amber-600 dark:text-amber-400">
                Intervale indisponibile: {bookedRanges?.map((r) => `${r.startTime}–${r.endTime}`).join(", ")}
              </div>
            )}
            {wholeDayBlocked && (
              <div className="border-t border-border/30 bg-red-500/5 px-3 py-1.5 text-[10px] text-red-600 dark:text-red-400">
                Această zi este complet indisponibilă.
              </div>
            )}
            {!wholeDayBlocked && wsWindow.offDay && (
              <div className="border-t border-border/30 bg-red-500/5 px-3 py-1.5 text-[10px] text-red-600 dark:text-red-400">
                Această zi nu este zi de lucru.
              </div>
            )}
            {!wholeDayBlocked && !wsWindow.offDay && workingHours && (
              <div className="border-t border-border/30 bg-emerald-500/5 px-3 py-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                Program: {workingHours.start}–{workingHours.end}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

function TimeColumn({
  label,
  items,
  active,
  onPick,
  format,
  dataKey,
  disabledItems,
}: {
  label: string;
  items: number[];
  active: number | undefined;
  onPick: (n: number) => void;
  format: (n: number) => string;
  dataKey: string;
  disabledItems?: Set<number>;
}) {
  return (
    <div className="flex flex-col">
      <div className="border-b border-border/30 bg-background/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="max-h-56 overflow-y-auto">
        {items.map((n) => {
          const isActive = active === n;
          const isDisabled = disabledItems?.has(n) ?? false;
          if (isDisabled) return null; // hide booked times entirely
          return (
            <button
              key={n}
              type="button"
              onClick={() => onPick(n)}
              {...{ [`data-${dataKey}`]: isActive ? "true" : undefined }}
              className={cn(
                "flex w-full items-center justify-center px-3 py-1.5 text-sm font-mono transition-colors",
                isActive
                  ? "bg-gold/15 font-semibold text-gold"
                  : "text-foreground/80 hover:bg-accent hover:text-foreground",
              )}
            >
              {format(n)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
