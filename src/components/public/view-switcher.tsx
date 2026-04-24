"use client";

// Shared view switcher for listing pages — grid (3/4/5 cols) or
// list (compact/detailed). State is kept in localStorage so the
// user's preference persists across category pages.

import { useEffect, useState } from "react";
import { LayoutGrid, List as ListIcon, Rows2, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";

export type GridCols = 3 | 4 | 5;
export type ListDensity = "compact" | "detailed";
export type ViewMode =
  | { kind: "grid"; cols: GridCols }
  | { kind: "list"; density: ListDensity };

const STORAGE_KEY = "epetrecere.view-mode";
const DEFAULT_VIEW: ViewMode = { kind: "grid", cols: 4 };

export function useViewMode(): [ViewMode, (v: ViewMode) => void, boolean] {
  const [mode, setMode] = useState<ViewMode>(DEFAULT_VIEW);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ViewMode;
        if (
          (parsed.kind === "grid" && [3, 4, 5].includes(parsed.cols)) ||
          (parsed.kind === "list" &&
            ["compact", "detailed"].includes(parsed.density))
        ) {
          setMode(parsed);
        }
      }
    } catch {}
    setHydrated(true);
  }, []);

  const update = (v: ViewMode) => {
    setMode(v);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
    } catch {}
  };

  return [mode, update, hydrated];
}

export function gridClassName(cols: GridCols): string {
  // Responsive up to the chosen desktop column count
  if (cols === 3) return "grid gap-4 sm:grid-cols-2 md:grid-cols-3";
  if (cols === 4)
    return "grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
  return "grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";
}

interface Props {
  mode: ViewMode;
  onChange: (v: ViewMode) => void;
}

export function ViewSwitcher({ mode, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Grid mode + column count */}
      <div
        className={cn(
          "flex items-center gap-0.5 rounded-lg border p-0.5",
          mode.kind === "grid"
            ? "border-gold/40 bg-gold/5"
            : "border-border/40",
        )}
      >
        <button
          type="button"
          onClick={() => onChange({ kind: "grid", cols: 4 })}
          aria-label="Grid view"
          className={cn(
            "flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-all",
            mode.kind === "grid"
              ? "text-gold"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          Grid
        </button>
        {mode.kind === "grid" && (
          <div className="flex items-center gap-0.5 border-l border-gold/20 pl-1 ml-0.5">
            {([3, 4, 5] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onChange({ kind: "grid", cols: c })}
                aria-label={`${c} coloane`}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold transition-all",
                  mode.cols === c
                    ? "bg-gold text-[#0D0D0D]"
                    : "text-muted-foreground hover:bg-muted/50",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* List mode + density */}
      <div
        className={cn(
          "flex items-center gap-0.5 rounded-lg border p-0.5",
          mode.kind === "list"
            ? "border-gold/40 bg-gold/5"
            : "border-border/40",
        )}
      >
        <button
          type="button"
          onClick={() => onChange({ kind: "list", density: "compact" })}
          aria-label="List view"
          className={cn(
            "flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-all",
            mode.kind === "list"
              ? "text-gold"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <ListIcon className="h-3.5 w-3.5" />
          Listă
        </button>
        {mode.kind === "list" && (
          <div className="flex items-center gap-0.5 border-l border-gold/20 pl-1 ml-0.5">
            <button
              type="button"
              onClick={() => onChange({ kind: "list", density: "compact" })}
              aria-label="Compact"
              className={cn(
                "flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium transition-all",
                mode.density === "compact"
                  ? "bg-gold text-[#0D0D0D]"
                  : "text-muted-foreground hover:bg-muted/50",
              )}
            >
              <Rows3 className="h-3 w-3" />
              Compact
            </button>
            <button
              type="button"
              onClick={() => onChange({ kind: "list", density: "detailed" })}
              aria-label="Detaliat"
              className={cn(
                "flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium transition-all",
                mode.density === "detailed"
                  ? "bg-gold text-[#0D0D0D]"
                  : "text-muted-foreground hover:bg-muted/50",
              )}
            >
              <Rows2 className="h-3 w-3" />
              Detaliat
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
