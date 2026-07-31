"use client";

// Shared view switcher for listing pages. Mobile users can choose one or
// two columns, while larger screens keep the denser desktop options.
// A compact mobile choice automatically maps to the desktop default, and a
// desktop choice automatically maps to two columns on mobile.

import { useEffect, useState } from "react";
import { LayoutGrid, List as ListIcon, Rows2, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/hooks/use-locale";

export type GridCols = 1 | 2 | 3 | 4 | 5;
export type ListDensity = "compact" | "detailed";
export type ViewMode =
  | { kind: "grid"; cols: GridCols }
  | { kind: "list"; density: ListDensity };

const STORAGE_KEY = "epetrecere.view-mode";
const DEFAULT_VIEW: ViewMode = { kind: "grid", cols: 4 };

function isValidViewMode(value: unknown): value is ViewMode {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ViewMode>;
  return (
    (candidate.kind === "grid" &&
      [1, 2, 3, 4, 5].includes(candidate.cols as number)) ||
    (candidate.kind === "list" &&
      ["compact", "detailed"].includes(candidate.density as string))
  );
}

export function useViewMode(): [ViewMode, (v: ViewMode) => void, boolean] {
  const [mode, setMode] = useState<ViewMode>(DEFAULT_VIEW);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (isValidViewMode(parsed)) setMode(parsed);
      } catch {}
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(hydrationTimer);
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
  if (cols === 1) return "grid grid-cols-1 gap-4 lg:grid-cols-4";
  if (cols === 2)
    return "grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4";
  if (cols === 3) return "grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4";
  if (cols === 4) return "grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4";
  return "grid grid-cols-2 gap-3 lg:grid-cols-5 lg:gap-4";
}

interface Props {
  mode: ViewMode;
  onChange: (v: ViewMode) => void;
}

export function ViewSwitcher({ mode, onChange }: Props) {
  const { t } = useLocale();
  const mobileCols = mode.kind === "grid" && mode.cols === 1 ? 1 : 2;
  const desktopCols = mode.kind === "grid" && mode.cols >= 3 ? mode.cols : 4;
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
          onClick={() => onChange({ kind: "grid", cols: 2 })}
          aria-label={t("catalog.grid")}
          className={cn(
            "flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-all",
            mode.kind === "grid"
              ? "text-gold"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          {t("catalog.grid")}
        </button>
        {mode.kind === "grid" && (
          <div className="flex items-center gap-0.5 border-l border-gold/20 pl-1 ml-0.5">
            <span className="flex items-center gap-0.5 lg:hidden">
              {([1, 2] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onChange({ kind: "grid", cols: c })}
                  aria-label={t("catalog.columns", { count: c })}
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold transition-all",
                    mobileCols === c
                      ? "bg-gold text-[#0D0D0D]"
                      : "text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  {c}
                </button>
              ))}
            </span>
            <span className="hidden items-center gap-0.5 lg:flex">
              {([3, 4, 5] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onChange({ kind: "grid", cols: c })}
                  aria-label={t("catalog.columns", { count: c })}
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold transition-all",
                    desktopCols === c
                      ? "bg-gold text-[#0D0D0D]"
                      : "text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  {c}
                </button>
              ))}
            </span>
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
          aria-label={t("catalog.list")}
          className={cn(
            "flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-all",
            mode.kind === "list"
              ? "text-gold"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <ListIcon className="h-3.5 w-3.5" />
          {t("catalog.list")}
        </button>
        {mode.kind === "list" && (
          <div className="flex items-center gap-0.5 border-l border-gold/20 pl-1 ml-0.5">
            <button
              type="button"
              onClick={() => onChange({ kind: "list", density: "compact" })}
              aria-label={t("catalog.compact")}
              className={cn(
                "flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium transition-all",
                mode.density === "compact"
                  ? "bg-gold text-[#0D0D0D]"
                  : "text-muted-foreground hover:bg-muted/50",
              )}
            >
              <Rows3 className="h-3 w-3" />
              {t("catalog.compact")}
            </button>
            <button
              type="button"
              onClick={() => onChange({ kind: "list", density: "detailed" })}
              aria-label={t("catalog.detailed")}
              className={cn(
                "flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium transition-all",
                mode.density === "detailed"
                  ? "bg-gold text-[#0D0D0D]"
                  : "text-muted-foreground hover:bg-muted/50",
              )}
            >
              <Rows2 className="h-3 w-3" />
              {t("catalog.detailed")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
