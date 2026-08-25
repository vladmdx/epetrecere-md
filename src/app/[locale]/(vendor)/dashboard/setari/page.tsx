"use client";

// F-A10 — Standalone Setări surface.
//
// Was mixed into the "Setări" tab of `/dashboard/profil/page.tsx` which
// conflated "edit my profile" and "configure my account behaviour".
// Splitting it out means:
//   1) the sidebar now has a dedicated nav entry (keeps Profil tab
//      focused on the info that actually renders on the public page)
//   2) venue owners get the same surface via the same route (the
//      public profile fields for venues live under /venue-profil)
//   3) future settings (notifications, language prefs, etc) have a
//      natural home without bloating the profile editor further
//
// Fields wired for both entity types:
//   - calendarEnabled  — toggle calendar widget on public detail page
//   - bufferHours (artist only) — hours between accepted bookings
//   - autoReplyEnabled / autoReplyMessage (artist only) — Feature 14
//
// Both entity types persist via the same endpoint pattern: GET the
// current row from /api/me/{artist|venue}, then PUT back to
// /api/artists/crud or /api/venues/[id]. Owner gates live on the API.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, Loader2, SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { IcalSubscribeCard } from "@/components/vendor/ical-subscribe-card";
import { AppearanceSettings } from "@/components/shared/appearance-settings";
import { MOLDOVA_CITIES, TRAVEL_DISTANCE_OPTIONS } from "@/lib/moldova-cities";
import { ReferralCard } from "@/components/shared/referral-card";
import { NotificationPrefsGrid } from "@/components/shared/notification-prefs-grid";
import { NotificationSoundToggle } from "@/components/shared/notification-sound-toggle";
import { TimezoneSelector } from "@/components/shared/timezone-selector";
import { useLocale } from "@/hooks/use-locale";

type ArtistSettings = {
  kind: "artist";
  id: number;
  calendarEnabled: boolean;
  bufferHours: number;
  bufferMinutes: number;
  baseCity: string;
  travelDistanceKm: number;
  travelSurchargeEnabled: boolean;
  travelSurchargeAmount: number | null;
  priceHidden: boolean;
  autoReplyEnabled: boolean;
  autoReplyMessage: string;
};

type VenueSettings = {
  kind: "venue";
  id: number;
  calendarEnabled: boolean;
  bufferMinutes: number;
};

type Loaded = ArtistSettings | VenueSettings | { kind: "none" };

const DEFAULT_AUTO_REPLY =
  "Mulțumim pentru cerere! Am primit-o și revin cu un răspuns în cel mai scurt timp posibil.";

export default function VendorSettingsPage() {
  const { t } = useLocale();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<Loaded>({ kind: "none" });

  // Hydrate: ask /api/me/artist first, /api/me/venue as fallback. Same
  // resolution order as `/dashboard/page.tsx` and `/dashboard/analytics`.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const artistRes = await fetch("/api/me/artist", { cache: "no-store" });
        if (artistRes.ok) {
          const json = await artistRes.json();
          if (!cancelled && json.artist) {
            const a = json.artist as Record<string, unknown>;
            setState({
              kind: "artist",
              id: Number(a.id),
              calendarEnabled: Boolean(a.calendarEnabled),
              bufferHours: Number(a.bufferHours ?? 2),
              bufferMinutes: Number(a.bufferMinutes ?? 15),
              baseCity: (a.baseCity as string) || "Chișinău",
              travelDistanceKm: Number(a.travelDistanceKm ?? 30),
              travelSurchargeEnabled: Boolean(a.travelSurchargeEnabled),
              travelSurchargeAmount: a.travelSurchargeAmount == null ? null : Number(a.travelSurchargeAmount),
              priceHidden: Boolean(a.priceHidden),
              autoReplyEnabled: Boolean(a.autoReplyEnabled),
              autoReplyMessage:
                (a.autoReplyMessage as string) ?? DEFAULT_AUTO_REPLY,
            });
            setLoading(false);
            return;
          }
        }
        const venueRes = await fetch("/api/me/venue", { cache: "no-store" });
        if (venueRes.ok) {
          const json = await venueRes.json();
          if (!cancelled && json.venue) {
            const v = json.venue as Record<string, unknown>;
            setState({
              kind: "venue",
              id: Number(v.id),
              calendarEnabled: Boolean(v.calendarEnabled),
              bufferMinutes: Number(v.bufferMinutes ?? 15),
            });
            setLoading(false);
            return;
          }
        }
        if (!cancelled) {
          setState({ kind: "none" });
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          toast.error(t("vendor.settings.errLoad"));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    if (state.kind === "none") {
      toast.error(t("vendor.settings.errNoProfile"));
      return;
    }
    setSaving(true);
    try {
      if (state.kind === "artist") {
        const res = await fetch("/api/artists/crud", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: state.id,
            calendarEnabled: state.calendarEnabled,
            bufferHours: state.bufferHours,
            bufferMinutes: state.bufferMinutes,
            baseCity: state.baseCity,
            travelDistanceKm: state.travelDistanceKm,
            travelSurchargeEnabled: state.travelSurchargeEnabled,
            travelSurchargeAmount: state.travelSurchargeAmount,
            priceHidden: state.priceHidden,
            autoReplyEnabled: state.autoReplyEnabled,
            autoReplyMessage: state.autoReplyMessage,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Save failed");
        }
      } else {
        const res = await fetch(`/api/venues/${state.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            calendarEnabled: state.calendarEnabled,
            bufferMinutes: state.bufferMinutes,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Save failed");
        }
      }
      toast.success(t("vendor.settings.saved"));
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t("vendor.settings.errSave"),
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state.kind === "none") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-bold">
            {t("vendor.settings.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("vendor.settings.subtitleNone")}
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center text-muted-foreground">
            <SettingsIcon className="mb-3 h-10 w-10" />
            <p>{t("vendor.settings.emptyTitle")}</p>
            <p className="mt-1 text-xs">
              {t("vendor.settings.emptyHint")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">
            {t("vendor.settings.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {state.kind === "artist"
              ? t("vendor.settings.subtitleArtist")
              : t("vendor.settings.subtitleVenue")}
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-gold text-[#0D0D0D] hover:bg-gold-dark gap-2"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {t("common.save")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("vendor.calendar")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>{t("vendor.settings.calendarEnabled")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("vendor.settings.calendarEnabledHint")}
              </p>
            </div>
            <Switch
              checked={state.calendarEnabled}
              onCheckedChange={(v) =>
                setState((prev) =>
                  prev.kind === "none"
                    ? prev
                    : { ...prev, calendarEnabled: v },
                )
              }
            />
          </div>

          {/* Buffer between bookings (minutes). 15 default, configurable up
              to 90 in 15-min steps. Replaces the legacy bufferHours field
              for the client-facing calendar — when an event ends 16:00 with
              a 15-min buffer, the client sees the next slot start at 16:15. */}
          {(state.kind === "artist" || state.kind === "venue") && (
            <div className="flex items-center justify-between">
              <div>
                <Label>{t("vendor.settings.buffer")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("vendor.settings.bufferHint")}
                </p>
              </div>
              <select
                value={state.bufferMinutes}
                onChange={(e) =>
                  setState((prev) =>
                    prev.kind === "none"
                      ? prev
                      : { ...prev, bufferMinutes: Number(e.target.value) },
                  )
                }
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {[15, 30, 45, 60, 75, 90].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Travel settings — artist only. Determines which events the artist
          appears in (city + max distance) and whether they charge a travel
          surcharge for events outside their base city. */}
      {state.kind === "artist" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("vendor.settings.travelTitle")}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {t("vendor.settings.travelHint")}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <Label>{t("vendor.settings.baseCity")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("vendor.settings.baseCityHint")}
                </p>
              </div>
              <select
                value={state.baseCity}
                onChange={(e) =>
                  setState((prev) =>
                    prev.kind === "artist"
                      ? { ...prev, baseCity: e.target.value }
                      : prev,
                  )
                }
                className="rounded-md border border-input bg-background px-3 py-2 text-sm min-w-[200px]"
              >
                {MOLDOVA_CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <Label>{t("vendor.settings.maxDistance")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("vendor.settings.maxDistanceHint")}
                </p>
              </div>
              <select
                value={state.travelDistanceKm}
                onChange={(e) =>
                  setState((prev) =>
                    prev.kind === "artist"
                      ? { ...prev, travelDistanceKm: Number(e.target.value) }
                      : prev,
                  )
                }
                className="rounded-md border border-input bg-background px-3 py-2 text-sm min-w-[200px]"
              >
                {TRAVEL_DISTANCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>{t("vendor.settings.travelFee")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("vendor.settings.travelFeeHint")}
                </p>
              </div>
              <Switch
                checked={state.travelSurchargeEnabled}
                onCheckedChange={(v) =>
                  setState((prev) =>
                    prev.kind === "artist"
                      ? { ...prev, travelSurchargeEnabled: v }
                      : prev,
                  )
                }
              />
            </div>
            {state.travelSurchargeEnabled && (
              <div className="flex items-center justify-between gap-4">
                <Label className="flex-1">
                  {t("vendor.settings.travelAmount")}
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={1000}
                  value={state.travelSurchargeAmount ?? ""}
                  onChange={(e) =>
                    setState((prev) =>
                      prev.kind === "artist"
                        ? {
                            ...prev,
                            travelSurchargeAmount: e.target.value
                              ? Number(e.target.value)
                              : null,
                          }
                        : prev,
                    )
                  }
                  className="w-32"
                  placeholder={t("vendor.settings.travelAmountPlaceholder")}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Price visibility — for artists with negotiated pricing. When ON,
          public profile shows "Preț la cerere" + a quote-request form
          instead of the standard "Solicită rezervare". */}
      {state.kind === "artist" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("vendor.settings.publicPrice")}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {t("vendor.settings.publicPriceHint")}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <Label>{t("vendor.settings.hidePrice")}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("vendor.settings.hidePriceHint")}
                </p>
              </div>
              <Switch
                checked={state.priceHidden}
                onCheckedChange={(v) =>
                  setState((prev) =>
                    prev.kind === "artist"
                      ? { ...prev, priceHidden: v }
                      : prev,
                  )
                }
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* iCal subscription — moved here from the Calendar page so all
          integration/sync settings live together. */}
      <IcalSubscribeCard />

      {state.kind === "artist" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("vendor.settings.autoReply")}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {t("vendor.settings.autoReplyHint")}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>{t("vendor.settings.autoReplyEnable")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("vendor.settings.autoReplyEnableHint")}
                </p>
              </div>
              <Switch
                checked={state.autoReplyEnabled}
                onCheckedChange={(v) =>
                  setState((prev) =>
                    prev.kind === "artist"
                      ? { ...prev, autoReplyEnabled: v }
                      : prev,
                  )
                }
              />
            </div>
            {state.autoReplyEnabled && (
              <div>
                <Label>{t("vendor.settings.autoReplyMessage")}</Label>
                <textarea
                  value={state.autoReplyMessage}
                  onChange={(e) =>
                    setState((prev) =>
                      prev.kind === "artist"
                        ? { ...prev, autoReplyMessage: e.target.value }
                        : prev,
                    )
                  }
                  rows={5}
                  maxLength={500}
                  className="mt-2 w-full rounded-md border border-border/40 bg-background px-3 py-2 text-sm"
                  placeholder={t("vendor.settings.autoReplyPlaceholder")}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("vendor.settings.autoReplyLimit")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <AppearanceSettings />

      {/* Per-type notification toggles + timezone — spec 11.1 / 11.2 */}
      <div className="space-y-4 rounded-xl border border-border/40 bg-card p-5">
        <div>
          <h2 className="font-heading text-lg font-bold">
            {t("vendor.settings.notificationsTitle")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t("vendor.settings.notificationsHint")}
          </p>
        </div>
        <TimezoneSelector />
        <NotificationPrefsGrid />
        <NotificationSoundToggle />
      </div>

      <ReferralCard />
    </div>
  );
}
