"use client";

import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Price filter pills ──

interface PriceFilterProps {
  currentMin?: string;
  currentMax?: string;
  onChange: (min?: string, max?: string) => void;
}

const priceRanges = [
  { label: "< 200\u20AC", min: undefined, max: "200" },
  { label: "200-500\u20AC", min: "200", max: "500" },
  { label: "500-1000\u20AC", min: "500", max: "1000" },
  { label: "1000-2000\u20AC", min: "1000", max: "2000" },
  { label: "> 2000\u20AC", min: "2000", max: undefined },
];

export function PriceFilter({ currentMin, currentMax, onChange }: PriceFilterProps) {
  const isActive = (min?: string, max?: string) =>
    currentMin === min && currentMax === max;

  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="flex items-center text-xs font-medium text-muted-foreground mr-1">
        Preț:
      </span>
      {priceRanges.map((range) => (
        <Button
          key={`${range.min}-${range.max}`}
          variant="outline"
          size="sm"
          className={cn(
            "h-7 text-xs",
            isActive(range.min, range.max) && "bg-gold text-background hover:bg-gold-dark border-gold",
          )}
          aria-pressed={isActive(range.min, range.max)}
          aria-label={`Filtru preț: ${range.label}`}
          onClick={() =>
            isActive(range.min, range.max)
              ? onChange(undefined, undefined)
              : onChange(range.min, range.max)
          }
        >
          {range.label}
        </Button>
      ))}
    </div>
  );
}

// ── Category filter pills ──

interface CategoryFilterProps {
  categories: Array<{ id: number; nameRo: string }>;
  currentId?: string;
  onChange: (id?: string) => void;
}

export function CategoryFilter({ categories, currentId, onChange }: CategoryFilterProps) {
  if (!categories.length) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="flex items-center text-xs font-medium text-muted-foreground mr-1">
        Categorie:
      </span>
      {categories.map((cat) => (
        <Button
          key={cat.id}
          variant="outline"
          size="sm"
          className={cn(
            "h-7 text-xs",
            currentId === String(cat.id) && "bg-gold text-background hover:bg-gold-dark border-gold",
          )}
          aria-pressed={currentId === String(cat.id)}
          aria-label={`Filtru categorie: ${cat.nameRo}`}
          onClick={() =>
            currentId === String(cat.id) ? onChange(undefined) : onChange(String(cat.id))
          }
        >
          {cat.nameRo}
        </Button>
      ))}
    </div>
  );
}

// ── City filter pills ──

interface CityFilterProps {
  cities: string[];
  currentCity?: string;
  onChange: (city?: string) => void;
}

export function CityFilter({ cities, currentCity, onChange }: CityFilterProps) {
  if (!cities.length) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="flex items-center text-xs font-medium text-muted-foreground mr-1">
        Oraș:
      </span>
      {cities.map((city) => (
        <Button
          key={city}
          variant="outline"
          size="sm"
          className={cn(
            "h-7 text-xs",
            currentCity === city && "bg-gold text-background hover:bg-gold-dark border-gold",
          )}
          aria-pressed={currentCity === city}
          aria-label={`Filtru oraș: ${city}`}
          onClick={() => (currentCity === city ? onChange(undefined) : onChange(city))}
        >
          {city}
        </Button>
      ))}
    </div>
  );
}

// ── Capacity filter pills ──

interface CapacityFilterProps {
  currentMin?: string;
  onChange: (min?: string) => void;
}

const capacityOptions = [
  { label: "50+", min: "50" },
  { label: "100+", min: "100" },
  { label: "200+", min: "200" },
  { label: "300+", min: "300" },
  { label: "500+", min: "500" },
];

export function CapacityFilter({ currentMin, onChange }: CapacityFilterProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="flex items-center text-xs font-medium text-muted-foreground mr-1">
        Capacitate:
      </span>
      {capacityOptions.map((opt) => (
        <Button
          key={opt.min}
          variant="outline"
          size="sm"
          className={cn(
            "h-7 text-xs",
            currentMin === opt.min && "bg-gold text-background hover:bg-gold-dark border-gold",
          )}
          aria-pressed={currentMin === opt.min}
          aria-label={`Filtru capacitate: ${opt.label}`}
          onClick={() => (currentMin === opt.min ? onChange(undefined) : onChange(opt.min))}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}

// ── Active filter reset ──

interface ActiveFiltersProps {
  hasFilters: boolean;
  onReset: () => void;
}

export function ActiveFiltersReset({ hasFilters, onReset }: ActiveFiltersProps) {
  if (!hasFilters) return null;
  return (
    <Button variant="ghost" size="sm" onClick={onReset} className="h-7 text-xs text-muted-foreground gap-1">
      <X className="h-3 w-3" /> Resetează filtrele
    </Button>
  );
}
