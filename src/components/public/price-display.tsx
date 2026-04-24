"use client";

// Dual-currency price widget. Primary display is EUR (source of truth);
// MDL shown in smaller muted text below. User's preferred primary
// currency is remembered in localStorage via "currency-pref" so power
// users can swap which is shown large.

import { useEffect, useState } from "react";
import { EUR_TO_MDL_RATE } from "@/lib/currency";
import { cn } from "@/lib/utils";

interface Props {
  /** Amount in EUR (how it's stored in DB). */
  eur: number | null | undefined;
  /** Optional prefix: "de la", "preț/pers", etc. */
  prefix?: string;
  /** Size variant. */
  size?: "sm" | "md" | "lg";
  className?: string;
}

const STORAGE_KEY = "currency-pref";

export function PriceDisplay({ eur, prefix, size = "md", className }: Props) {
  const [primary, setPrimary] = useState<"EUR" | "MDL">("EUR");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "MDL" || saved === "EUR") setPrimary(saved);
    } catch {
      /* ignore */
    }
  }, []);

  function toggle() {
    const next = primary === "EUR" ? "MDL" : "EUR";
    setPrimary(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  if (!eur || !Number.isFinite(eur)) {
    return <span className="text-muted-foreground">—</span>;
  }

  const mdl = Math.round((eur * EUR_TO_MDL_RATE) / 10) * 10;
  const eurStr = `${Math.round(eur).toLocaleString("ro-RO")} €`;
  const mdlStr = `${mdl.toLocaleString("ro-MD")} MDL`;
  const primaryValue = primary === "EUR" ? eurStr : mdlStr;
  const secondaryValue = primary === "EUR" ? mdlStr : eurStr;

  const primarySize =
    size === "sm" ? "text-sm" : size === "lg" ? "text-3xl" : "text-lg";
  const secondarySize =
    size === "sm" ? "text-[10px]" : size === "lg" ? "text-sm" : "text-xs";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }}
      title="Schimbă moneda afișată"
      className={cn(
        "inline-flex flex-col items-start text-left transition-opacity hover:opacity-80",
        className,
      )}
    >
      {prefix && (
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {prefix}
        </span>
      )}
      <span className={cn("font-heading font-bold text-gold", primarySize)}>
        {primaryValue}
      </span>
      <span className={cn("text-muted-foreground", secondarySize)}>
        ≈ {secondaryValue}
      </span>
    </button>
  );
}
