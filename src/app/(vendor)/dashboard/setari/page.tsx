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
          toast.error("Nu am putut încărca setările");
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
      toast.error("Profil indisponibil");
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
      toast.success("Setările au fost salvate!");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Eroare la salvarea setărilor",
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
          <h1 className="font-heading text-2xl font-bold">Setări</h1>
          <p className="text-sm text-muted-foreground">
            Configurează comportamentul contului tău
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center text-muted-foreground">
            <SettingsIcon className="mb-3 h-10 w-10" />
            <p>Nu ai încă un profil de artist sau sală.</p>
            <p className="mt-1 text-xs">
              Completează onboarding-ul pentru a accesa setările.
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
          <h1 className="font-heading text-2xl font-bold">Setări</h1>
          <p className="text-sm text-muted-foreground">
            {state.kind === "artist"
              ? "Calendar, buffer, răspuns automat"
              : "Calendar disponibilitate"}
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
          Salvează
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Calendar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Calendar activ</Label>
              <p className="text-xs text-muted-foreground">
                Afișează calendarul de disponibilitate pe profilul public.
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
                <Label>Buffer între evenimente</Label>
                <p className="text-xs text-muted-foreground">
                  Pauză minimă între două rezervări consecutive. Dacă un
                  eveniment se termină la 16:00 și ai 15 min buffer, clienții
                  văd următorul slot disponibil de la 16:15.
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
            <CardTitle>Locație și deplasare</CardTitle>
            <p className="text-xs text-muted-foreground">
              Stabilește orașul de bază și distanța maximă la care te deplasezi.
              Clienții care planifică evenimente în afara razei tale nu te vor
              vedea în rezultate.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <Label>Orașul de bază</Label>
                <p className="text-xs text-muted-foreground">
                  Punctul de pornire pentru calculul distanței.
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
                <Label>Distanța maximă de deplasare</Label>
                <p className="text-xs text-muted-foreground">
                  Cât de departe ești dispus să mergi pentru un eveniment.
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
                <Label>Plată suplimentară pentru deplasare</Label>
                <p className="text-xs text-muted-foreground">
                  Activează dacă percepi o sumă fixă pentru evenimente în afara
                  orașului de bază.
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
                <Label className="flex-1">Sumă deplasare (€)</Label>
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
                  placeholder="ex: 100"
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* iCal subscription — moved here from the Calendar page so all
          integration/sync settings live together. */}
      <IcalSubscribeCard />

      {state.kind === "artist" && (
        <Card>
          <CardHeader>
            <CardTitle>Răspuns automat</CardTitle>
            <p className="text-xs text-muted-foreground">
              Trimite instant un email clientului când lasă o cerere, ca să
              știe că ai primit-o.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Activează răspunsul automat</Label>
                <p className="text-xs text-muted-foreground">
                  Doar clienții care lasă email vor primi mesajul.
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
                <Label>Mesajul tău</Label>
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
                  placeholder="Ex: Mulțumim pentru cerere! Revin în maxim 2 ore..."
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Max. 500 caractere. Mesajul este inserat într-un email cu
                  branding ePetrecere.
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
            Notificări & fus orar
          </h2>
          <p className="text-xs text-muted-foreground">
            Controlează pe ce canal primești fiecare tip de notificare și
            formatează orele conform fusului tău.
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
