"use client";

// Timezone selector — a curated list of popular IANA zones for Moldova/EU
// + a free-text "Other" input that validates via the server. Persists to
// users.timezone via PUT /api/me/timezone.

import { useEffect, useState } from "react";
import { Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/hooks/use-locale";

const PRESETS: Array<{ value: string; label: string }> = [
  { value: "Europe/Chisinau", label: "🇲🇩 Chișinău (Europe/Chisinau)" },
  { value: "Europe/Bucharest", label: "🇷🇴 București (Europe/Bucharest)" },
  { value: "Europe/Moscow", label: "🇷🇺 Moscova (Europe/Moscow)" },
  { value: "Europe/Kiev", label: "🇺🇦 Kiev (Europe/Kiev)" },
  { value: "Europe/London", label: "🇬🇧 Londra (Europe/London)" },
  { value: "Europe/Paris", label: "🇫🇷 Paris (Europe/Paris)" },
  { value: "Europe/Berlin", label: "🇩🇪 Berlin (Europe/Berlin)" },
  { value: "Europe/Rome", label: "🇮🇹 Roma (Europe/Rome)" },
  { value: "Europe/Madrid", label: "🇪🇸 Madrid (Europe/Madrid)" },
  { value: "America/New_York", label: "🇺🇸 New York" },
  { value: "America/Los_Angeles", label: "🇺🇸 Los Angeles" },
  { value: "Asia/Dubai", label: "🇦🇪 Dubai" },
];

interface Props {
  /** Optional server-side seeded value. When omitted the component fetches
   *  it on mount (used by artist setări which is fully client-side). */
  initialValue?: string;
}

export function TimezoneSelector({ initialValue }: Props) {
  const { t } = useLocale();
  const [value, setValue] = useState(initialValue ?? "Europe/Chisinau");
  const [mode, setMode] = useState<"preset" | "custom">(
    initialValue && !PRESETS.some((p) => p.value === initialValue)
      ? "custom"
      : "preset",
  );
  const [customInput, setCustomInput] = useState(
    initialValue && !PRESETS.some((p) => p.value === initialValue)
      ? initialValue
      : "",
  );
  const [saving, setSaving] = useState(false);

  // When used without initialValue, fetch the current tz on mount so the
  // dropdown reflects the real stored value.
  useEffect(() => {
    if (initialValue !== undefined) return;
    fetch("/api/me/notification-preferences")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.timezone) {
          setValue(data.timezone);
          if (!PRESETS.some((p) => p.value === data.timezone)) {
            setMode("custom");
            setCustomInput(data.timezone);
          }
        }
      })
      .catch(() => {
        /* silent */
      });
  }, [initialValue]);

  async function save(next: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/me/timezone", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: next }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || t("timezone.saveFailed"));
        return false;
      }
      setValue(next);
      toast.success(t("timezone.updated"));
      return true;
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg bg-muted/30 p-3">
      <div className="min-w-0 flex-1">
        <Label className="flex items-center gap-1.5 text-sm font-medium">
          <Globe className="h-3.5 w-3.5 text-gold" /> {t("timezone.label")}
        </Label>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("timezone.hint")}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {mode === "preset" ? (
            <select
              value={value}
              onChange={(e) => save(e.target.value)}
              disabled={saving}
              className="h-8 rounded-md border border-border/50 bg-background px-2 text-xs"
            >
              {PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
              {/* Preserve an unknown saved value in the dropdown, so
                  switching to "Custom" and back doesn't drop it. */}
              {!PRESETS.find((p) => p.value === value) && (
                <option value={value}>{value}</option>
              )}
            </select>
          ) : (
            <div className="flex gap-1">
              <Input
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder={t("timezone.customPlaceholder")}
                className="h-8 w-48 font-mono text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={saving || !customInput.trim()}
                onClick={async () => {
                  const ok = await save(customInput.trim());
                  if (ok) setCustomInput(customInput.trim());
                }}
                className="h-8"
              >
                {saving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  t("common.save")
                )}
              </Button>
            </div>
          )}
          <button
            type="button"
            onClick={() =>
              setMode((m) => (m === "preset" ? "custom" : "preset"))
            }
            className="text-[10px] text-gold hover:underline"
          >
            {mode === "preset" ? t("timezone.enterCustom") : t("timezone.pickFromList")}
          </button>
        </div>
      </div>
    </div>
  );
}
