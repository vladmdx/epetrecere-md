"use client";

import { useState } from "react";
import { Loader2, MapPin, Wand2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useLocale } from "@/hooks/use-locale";

export type WorkingHoursMap = {
  mon: { open: string; close: string } | null;
  tue: { open: string; close: string } | null;
  wed: { open: string; close: string } | null;
  thu: { open: string; close: string } | null;
  fri: { open: string; close: string } | null;
  sat: { open: string; close: string } | null;
  sun: { open: string; close: string } | null;
};

export interface MapsResult {
  lat?: number;
  lng?: number;
  city?: string;
  address?: string;
  placeName?: string;
  phone?: string;
  website?: string;
  /** Plain-text editorial summary from Places, when available. */
  summary?: string;
  /** Place categories from Places (e.g. "restaurant", "wedding_hall"). */
  categories?: string[];
  /** Cover photo URL from the Places API photo proxy. */
  photoUrl?: string;
  /** Localized primary type — "Sală pentru evenimente", "Restaurant" etc. */
  primaryTypeDisplay?: string;
  /** Weekly opening hours, mon..sun. Each value is `{ open, close }` or null. */
  workingHours?: WorkingHoursMap;
}

interface Props {
  /** Called with whatever fields we managed to resolve. */
  onResult: (result: MapsResult) => void;
  className?: string;
}

/**
 * Paste a Google Maps URL → server expands it (handles maps.app.goo.gl
 * short links) → we hit the Places API (when GOOGLE_PLACES_API_KEY is
 * set) for phone/website/summary/photo, and fall back to OpenStreetMap
 * Nominatim for the address+city otherwise. Whatever we resolve flows
 * up to the parent via `onResult` so it can decide which fields to
 * apply (we don't overwrite user-typed values from inside this comp).
 */
export function MapsAutofill({ onResult, className }: Props) {
  const { t } = useLocale();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleAutofill() {
    if (!url.trim()) {
      toast.error(t("vendor.mapsAutofill.pasteFirst"));
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
        toast.error(err.error || t("vendor.mapsAutofill.readFailed"));
        return;
      }
      const data: MapsResult = await res.json();
      if (
        !data.address &&
        !data.city &&
        !data.placeName &&
        !data.phone &&
        !data.website
      ) {
        toast.error(t("vendor.mapsAutofill.nothingUseful"));
        return;
      }
      onResult(data);
      // Build a feedback message naming whatever we filled — gives the
      // owner a quick check before saving.
      const filledParts: string[] = [];
      if (data.placeName) filledParts.push(data.placeName);
      if (data.address) filledParts.push(data.address);
      else if (data.city) filledParts.push(data.city);
      const extras: string[] = [];
      if (data.phone) extras.push(t("vendor.mapsAutofill.extraPhone"));
      if (data.website) extras.push(t("vendor.mapsAutofill.extraWebsite"));
      if (data.summary) extras.push(t("vendor.mapsAutofill.extraDescription"));
      if (data.workingHours) extras.push(t("vendor.mapsAutofill.extraHours"));
      if (data.lat && data.lng) extras.push(t("vendor.mapsAutofill.extraCoords"));
      if (data.photoUrl) extras.push(t("vendor.mapsAutofill.extraPhoto"));
      const extrasMsg = extras.length ? ` (+${extras.join(", ")})` : "";
      toast.success(
        t("vendor.mapsAutofill.filled", {
          fields:
            filledParts.join(" — ") || t("vendor.mapsAutofill.newData"),
        }) + extrasMsg,
      );
    } catch {
      toast.error(t("vendor.mapsAutofill.processError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <Label className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-gold" />
        {t("vendor.mapsAutofill.label")}
      </Label>
      <div className="mt-1 flex gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t("vendor.mapsAutofill.placeholder")}
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
          {t("vendor.mapsAutofill.cta")}
        </Button>
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {t("vendor.mapsAutofill.hint")}
      </p>
    </div>
  );
}
