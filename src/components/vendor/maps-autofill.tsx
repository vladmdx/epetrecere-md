"use client";

import { useState } from "react";
import { Loader2, MapPin, Wand2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface MapsResult {
  lat?: number;
  lng?: number;
  city?: string;
  address?: string;
  placeName?: string;
}

interface Props {
  /** Called with whatever fields we managed to resolve. */
  onResult: (result: MapsResult) => void;
  className?: string;
}

/**
 * Paste a Google Maps URL → server expands it (handles maps.app.goo.gl
 * short links) → we reverse-geocode lat/lng via Nominatim → fields are
 * autofilled in the parent form. Falls back to the user typing manually
 * when the URL can't be parsed.
 */
export function MapsAutofill({ onResult, className }: Props) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleAutofill() {
    if (!url.trim()) {
      toast.error("Lipește mai întâi link-ul Google Maps.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/maps/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Nu am putut citi link-ul. Verifică URL-ul.");
        return;
      }
      const data: MapsResult = await res.json();
      if (!data.address && !data.city && !data.placeName) {
        toast.error("Nu am extras informații utile. Verifică link-ul.");
        return;
      }
      onResult(data);
      const filled = [data.city, data.address].filter(Boolean).join(", ");
      toast.success(`Completat: ${filled || data.placeName || "date noi"}`);
    } catch {
      toast.error("Eroare la procesarea link-ului.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <Label className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-gold" />
        Auto-completare din Google Maps (opțional)
      </Label>
      <div className="mt-1 flex gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://maps.app.goo.gl/... sau https://www.google.com/maps/place/..."
          className="text-sm"
        />
        <Button
          type="button"
          onClick={handleAutofill}
          disabled={loading || !url.trim()}
          variant="outline"
          className="shrink-0 gap-1.5"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Wand2 className="h-3.5 w-3.5" />
          )}
          Completează
        </Button>
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">
        Lipește link-ul de pe Google Maps al locației tale — completăm automat
        adresa și orașul. Poți edita după.
      </p>
    </div>
  );
}
