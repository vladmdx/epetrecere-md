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

export function TimePicker({
  value,
  onChange,
  disabled,
  className,
  placeholder = "--:--",
  minuteStep = 15,
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

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minutes = useMemo(() => {
    const step = Math.max(1, Math.min(30, minuteStep));
    const out: number[] = [];
    for (let m = 0; m < 60; m += step) out.push(m);
    return out;
  }, [minuteStep]);

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
          "flex h-10 w-full items-center gap-2 rounded-lg border border-border/50 bg-background px-3 text-left text-sm transition-colors",
          "hover:border-gold/40 focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/20",
          disabled && "cursor-not-allowed opacity-60",
          className,
        )}
      >
        <Clock className="h-4 w-4 shrink-0 text-gold" />
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
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          aria-label="Selector oră"
        />
        {!displayValue && (
          <span className="text-xs text-muted-foreground">HH:MM</span>
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
            className="overflow-hidden rounded-xl border border-gold/30 bg-card shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-border/40 bg-background/60 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Alege ora</span>
              <span className="font-mono font-semibold text-gold">
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
              />
              <TimeColumn
                label="Min"
                items={minutes}
                active={parsed?.m}
                format={pad2}
                onPick={(m) => setHM(parsed?.h ?? 0, m)}
                dataKey="active-minute"
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
                const selected = displayValue === q;
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => {
                      const p = parseTime(q)!;
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
}: {
  label: string;
  items: number[];
  active: number | undefined;
  onPick: (n: number) => void;
  format: (n: number) => string;
  dataKey: string;
}) {
  return (
    <div className="flex flex-col">
      <div className="border-b border-border/30 bg-background/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="max-h-56 overflow-y-auto">
        {items.map((n) => {
          const isActive = active === n;
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
