"use client";

// Small "Add to compare" pill rendered on artist/venue cards.
// Tapping toggles membership in the local compare list (useCompare hook).
// Disabled when 3 already selected and current entity isn't in the set.

import { Scale, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCompare, type CompareEntity } from "@/hooks/use-compare";
import { useLocale } from "@/hooks/use-locale";

interface Props {
  entityType: CompareEntity;
  entityId: number;
  className?: string;
  /** Named so repeated buttons in a list are distinguishable. */
  entityName?: string;
}

export function CompareButton({ entityType, entityId,
  entityName, className }: Props) {
  const { t } = useLocale();
  const { ids, toggle, has, max } = useCompare(entityType);
  const active = has(entityId);

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const result = toggle(entityId);
    if (result.reason === "max") {
      toast.error(t("compare.maxReached", { max }));
      return;
    }
    if (result.added) {
      toast.success(
        ids.length + 1 >= 2
          ? t("compare.selectedHint", { count: ids.length + 1 })
          : t("compare.added"),
      );
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={active}
      aria-label={`${t(active ? "a11y.removeCompare" : "a11y.addCompare")}${entityName ? `: ${entityName}` : ""}`}
      title={t(active ? "compare.inCompare" : "a11y.addCompare")}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
        active
          ? "border-blue-500/40 bg-blue-500/10 text-blue-400"
          : "border-border/60 bg-background/80 text-muted-foreground backdrop-blur-sm hover:border-blue-500/40 hover:text-blue-400",
        className,
      )}
    >
      {active ? <Check className="h-3 w-3" /> : <Scale className="h-3 w-3" />}
      {t(active ? "compare.inCompare" : "compare.compare")}
    </button>
  );
}
