"use client";

// Reusable compact sort selector used by all public catalog pages.

import { ArrowDownUp } from "lucide-react";
import { useLocale } from "@/hooks/use-locale";

export type SortOption = { value: string; label: string };

interface SortBarProps {
  options: SortOption[];
  current: string;
  onChange: (value: string) => void;
}

export function SortBar({ options, current, onChange }: SortBarProps) {
  const { t } = useLocale();
  const keys: Record<string, string> = {
    popular: "catalog.popular",
    price_asc: "catalog.priceAsc",
    price_desc: "catalog.priceDesc",
    rating: "catalog.rating",
    newest: "catalog.newest",
    capacity: "catalog.capacity",
  };

  return (
    <label className="relative inline-flex h-9 min-w-0 items-center gap-2 rounded-lg border border-gold/30 bg-[#0a0e15] px-3 text-xs text-white/78 transition-colors focus-within:border-gold/70 hover:border-gold/50">
      <ArrowDownUp className="h-3.5 w-3.5 shrink-0 text-gold" aria-hidden />
      <span className="sr-only">{t("catalog.sort")}</span>
      <select
        value={current}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 max-w-[9.5rem] cursor-pointer appearance-none bg-transparent pr-5 font-medium text-white outline-none sm:max-w-none"
        aria-label={t("catalog.sort")}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-[#0a0e15] text-white">
            {keys[opt.value] ? t(keys[opt.value]) : opt.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2.5 text-[10px] text-gold" aria-hidden>
        ▾
      </span>
    </label>
  );
}
