"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  const requestGeneration = useRef(0);
  const latestFields = useRef(fields);
  const latestOnTranslated = useRef(onTranslated);

  useLayoutEffect(() => {
    latestFields.current = fields;
    latestOnTranslated.current = onTranslated;
  }, [fields, onTranslated]);

  useEffect(() => {
    requestGeneration.current += 1;
    setBusy(false);
    return () => {
      requestGeneration.current += 1;
    };
  }, [hallId, sourceLanguage, venueId]);

  async function run() {
    const payload: Record<string, string> = {};
    const missingTargets: Record<string, Array<"ro" | "ru" | "en">> = {};
    for (const [key, value] of Object.entries(fields)) {
      const source = value[sourceLanguage]?.trim();
      if (!source) continue;
      const missing = (["ro", "ru", "en"] as const).filter((lang) => lang !== sourceLanguage && !value[lang]?.trim());
      if (missing.length) {
        payload[key] = source;
        missingTargets[key] = missing;
      }
    }
    if (!Object.keys(payload).length) {
      toast.message("Nu sunt câmpuri goale de tradus.");
      return;
    }
    const generation = ++requestGeneration.current;
    setBusy(true);
    try {
      const res = await fetch("/api/ai/translate-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId, hallId, sourceLanguage, fields: payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (generation !== requestGeneration.current) return;
      if (!res.ok) {
        toast.error(data.error === "TRANSLATION_UNAVAILABLE" ? "Traducerea AI nu este disponibilă. Editează manual." : (data.error || "Traducere eșuată"));
        return;
      }
      const merged: Record<string, { ro?: string; ru?: string; en?: string }> = {};
      for (const [key, translated] of Object.entries(data.translations ?? {})) {
        const current = latestFields.current[key] ?? {};
        // If the source changed while AI was running, its response belongs to
        // an obsolete draft. If a target was filled manually, keep it.
        if (current[sourceLanguage]?.trim() !== payload[key]) continue;
        const next: { ro?: string; ru?: string; en?: string } = {};
        for (const language of missingTargets[key] ?? []) {
          if (current[language]?.trim()) continue;
          const value = (translated as { ro?: string; ru?: string; en?: string })[language];
          if (typeof value === "string" && value.trim()) next[language] = value;
        }
        if (Object.keys(next).length > 0) merged[key] = next;
      }
      if (Object.keys(merged).length === 0) {
        toast.message("Textul s-a schimbat între timp; traducerea veche nu a fost aplicată.");
        return;
      }
      latestOnTranslated.current(merged);
      toast.success("Traducerile goale au fost completate. Verifică-le înainte de salvare.");
    } catch {
      if (generation === requestGeneration.current) {
        toast.error("Traducerea nu a putut fi finalizată. Reîncearcă.");
      }
    } finally {
      if (generation === requestGeneration.current) setBusy(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void run()} disabled={busy}>
      {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Languages className="mr-1.5 h-3.5 w-3.5" />}
      Tradu câmpurile lipsă în RU și EN
    </Button>
  );
}
