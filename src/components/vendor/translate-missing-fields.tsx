"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";

type FieldBag = Record<string, { ro?: string | null; ru?: string | null; en?: string | null }>;

export function TranslateMissingFields({
  venueId,
  hallId,
  sourceLanguage = "ro",
  fields,
  onTranslated,
}: {
  venueId: number;
  hallId?: number;
  sourceLanguage?: "ro" | "ru" | "en";
  fields: FieldBag;
  onTranslated: (next: Record<string, { ro?: string; ru?: string; en?: string }>) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function run() {
    const payload: Record<string, string> = {};
    for (const [key, value] of Object.entries(fields)) {
      const source = value[sourceLanguage]?.trim();
      if (!source) continue;
      const missing = (["ro", "ru", "en"] as const).filter((lang) => lang !== sourceLanguage && !value[lang]?.trim());
      if (missing.length) payload[key] = source;
    }
    if (!Object.keys(payload).length) {
      toast.message("Nu sunt câmpuri goale de tradus.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/ai/translate-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId, hallId, sourceLanguage, fields: payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error === "TRANSLATION_UNAVAILABLE" ? "Traducerea AI nu este disponibilă. Editează manual." : (data.error || "Traducere eșuată"));
        return;
      }
      const merged: Record<string, { ro?: string; ru?: string; en?: string }> = {};
      for (const [key, translated] of Object.entries(data.translations ?? {})) {
        const current = fields[key] ?? {};
        merged[key] = {
          ro: current.ro?.trim() ? current.ro : (translated as { ro?: string }).ro,
          ru: current.ru?.trim() ? current.ru : (translated as { ru?: string }).ru,
          en: current.en?.trim() ? current.en : (translated as { en?: string }).en,
        };
      }
      onTranslated(merged);
      toast.success("Traducerile goale au fost completate. Verifică-le înainte de salvare.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void run()} disabled={busy}>
      {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Languages className="mr-1.5 h-3.5 w-3.5" />}
      Tradu câmpurile lipsă în RU și EN
    </Button>
  );
}
