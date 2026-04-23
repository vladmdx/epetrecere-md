"use client";

// Floating bottom bar that appears on listing pages (/artisti, /sali,
// /categorie/[slug]) when the user has 2+ items in the compare selection.
// Clicking the CTA navigates to /artisti/compare?ids=... or /sali/compare?ids=...
//
// Auto-hides when selection drops below 2.

import Link from "next/link";
import { Scale, X, ArrowRight } from "lucide-react";
import { useCompare, type CompareEntity } from "@/hooks/use-compare";

interface Props {
  entityType: CompareEntity;
}

export function CompareBar({ entityType }: Props) {
  const { ids, clear } = useCompare(entityType);
  if (ids.length < 2) return null;

  const base = entityType === "venue" ? "/sali/compare" : "/artisti/compare";
  const href = `${base}?ids=${ids.join(",")}`;
  const label = entityType === "venue" ? "săli" : "artiști";

  return (
    <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 px-4">
      <div className="flex items-center gap-3 rounded-2xl border border-blue-500/40 bg-card/95 px-4 py-3 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-medium">
            {ids.length} {label} în comparare
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={clear}
            aria-label="Curăță selecția"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <Link
            href={href}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-600"
          >
            Compară acum
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
