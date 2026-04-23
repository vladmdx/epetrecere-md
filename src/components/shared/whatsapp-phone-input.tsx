"use client";

// WhatsApp phone number input — single responsibility: let the user set
// (or clear) their personal contact phone. Used in client + vendor
// settings. Default prefix is +373; paste with or without the prefix is
// normalized server-side via /api/me/phone.

import { useEffect, useState } from "react";
import { Phone, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  /** Initial value from the server. Can be null. */
  initialValue: string | null;
}

export function WhatsAppPhoneInput({ initialValue }: Props) {
  const [value, setValue] = useState(initialValue ?? "");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    setValue(initialValue ?? "");
  }, [initialValue]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/me/phone", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: value.trim() || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Nu s-a putut salva");
        return;
      }
      const data = await res.json();
      setValue(data.phone ?? "");
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1800);
      toast.success("Număr salvat");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-green-500" />
          <input
            type="tel"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="+373 69 123 456"
            className="w-full rounded-lg border border-border/60 bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-gold/60"
          />
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving || value.trim() === (initialValue ?? "").trim()}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60",
            justSaved
              ? "bg-emerald-500/15 text-emerald-500"
              : "bg-gold text-[#0D0D0D] hover:bg-gold-dark",
          )}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : justSaved ? (
            <Check className="h-4 w-4" />
          ) : null}
          {justSaved ? "Salvat" : "Salvează"}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Folosim acest număr pentru a-ți trimite notificări urgente pe WhatsApp
        (booking confirmat, răspuns artist etc). Asigură-te că e asociat cu un
        cont WhatsApp activ.
      </p>
    </div>
  );
}
