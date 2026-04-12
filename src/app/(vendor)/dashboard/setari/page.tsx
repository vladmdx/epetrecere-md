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

type ArtistSettings = {
  kind: "artist";
  id: number;
  calendarEnabled: boolean;
  bufferHours: number;
  autoReplyEnabled: boolean;
  autoReplyMessage: string;
};

type VenueSettings = {
  kind: "venue";
  id: number;
  calendarEnabled: boolean;
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
          className="bg-gold text-background hover:bg-gold-dark gap-2"
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

          {state.kind === "artist" && (
            <div className="flex items-center justify-between">
              <div>
                <Label>Buffer între evenimente (ore)</Label>
                <p className="text-xs text-muted-foreground">
                  Cât timp pauză între două rezervări consecutive.
                </p>
              </div>
              <Input
                type="number"
                min={0}
                max={48}
                value={state.bufferHours}
                onChange={(e) =>
                  setState((prev) =>
                    prev.kind === "artist"
                      ? { ...prev, bufferHours: Number(e.target.value) }
                      : prev,
                  )
                }
                className="w-24"
              />
            </div>
          )}
        </CardContent>
      </Card>

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
    </div>
  );
}
