"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useCompare } from "@/hooks/use-compare";

export function ClearCompareButton() {
  const router = useRouter();
  const { clear } = useCompare("artist");

  return (
    <button
      onClick={() => {
        clear();
        router.push("/artisti");
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground hover:border-red-500/40 hover:text-red-400"
    >
      <Trash2 className="h-3.5 w-3.5" />
      Curăță comparația
    </button>
  );
}
