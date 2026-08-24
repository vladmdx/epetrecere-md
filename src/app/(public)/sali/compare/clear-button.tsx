"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useCompare } from "@/hooks/use-compare";
import { useLocale } from "@/hooks/use-locale";
import { localizePath } from "@/lib/i18n/routing";

export function ClearCompareButton() {
  const router = useRouter();
  const { locale } = useLocale();
  const { clear } = useCompare("venue");

  return (
    <button
      onClick={() => {
        clear();
        // Locale lives in the path, so an unprefixed push would send a Russian
        // or English visitor back to the Romanian catalogue.
        router.push(localizePath("/sali", locale));
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground hover:border-red-500/40 hover:text-red-400"
    >
      <Trash2 className="h-3.5 w-3.5" />
      Curăță comparația
    </button>
  );
}
