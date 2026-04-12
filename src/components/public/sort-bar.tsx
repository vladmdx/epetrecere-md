"use client";

// Reusable sort-button strip used on /artisti and /sali listing pages.
// Each page provides its own `options` so the labels can differ (e.g.
// "Capacitate" for venues vs "Nou" for artists) while the UX pattern
// stays consistent.

import { Button } from "@/components/ui/button";
import { SlidersHorizontal } from "lucide-react";

export type SortOption = { value: string; label: string };

interface SortBarProps {
  options: SortOption[];
  current: string;
  onChange: (value: string) => void;
}

export function SortBar({ options, current, onChange }: SortBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
      {options.map((opt) => (
        <Button
          key={opt.value}
          variant={current === opt.value ? "default" : "outline"}
          size="sm"
          className={
            current === opt.value
              ? "bg-gold text-background hover:bg-gold-dark"
              : ""
          }
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
