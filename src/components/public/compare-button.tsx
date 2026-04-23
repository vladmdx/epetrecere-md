"use client";

// Small "Add to compare" pill rendered on artist/venue cards.
// Tapping toggles membership in the local compare list (useCompare hook).
// Disabled when 3 already selected and current entity isn't in the set.

import { Scale, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCompare, type CompareEntity } from "@/hooks/use-compare";

interface Props {
  entityType: CompareEntity;
  entityId: number;
  className?: string;
}

export function CompareButton({ entityType, entityId, className }: Props) {
  const { ids, toggle, has, max } = useCompare(entityType);
  const active = has(entityId);

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const result = toggle(entityId);
    if (result.reason === "max") {
      toast.error(`Poți compara până la ${max} elemente — șterge unul înainte`);
      return;
    }
    if (result.added) {
      toast.success(
        ids.length + 1 >= 2
          ? `${ids.length + 1} selectate · apasă "Compară" în lista de jos`
          : "Adăugat la comparare",
      );
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={active}
      aria-label={active ? "Scoate din comparare" : "Adaugă la comparare"}
      title={active ? "În comparare" : "Adaugă la comparare"}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
        active
          ? "border-blue-500/40 bg-blue-500/10 text-blue-400"
          : "border-border/60 bg-background/80 text-muted-foreground backdrop-blur-sm hover:border-blue-500/40 hover:text-blue-400",
        className,
      )}
    >
      {active ? <Check className="h-3 w-3" /> : <Scale className="h-3 w-3" />}
      {active ? "În comparare" : "Compară"}
    </button>
  );
}
