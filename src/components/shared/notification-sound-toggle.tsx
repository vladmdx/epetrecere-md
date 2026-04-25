"use client";

// Toggle for the soft chime that plays when a new notification arrives.
// Persisted in localStorage so it stays per-browser. Read by the
// NotificationBell component before deciding to ring.

import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Volume2, VolumeX } from "lucide-react";

const KEY = "epetrecere.notification-sound-enabled";

export function NotificationSoundToggle() {
  const [enabled, setEnabled] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const v = localStorage.getItem(KEY);
    setEnabled(v === null ? true : v === "1");
    setHydrated(true);
  }, []);

  function update(next: boolean) {
    setEnabled(next);
    localStorage.setItem(KEY, next ? "1" : "0");
    if (next) {
      // Quick preview chime so the user hears what they're enabling.
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.18);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      } catch {}
    }
  }

  if (!hydrated) return null;

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border/40 p-4">
      <div className="flex items-center gap-3">
        {enabled ? (
          <Volume2 className="h-5 w-5 text-gold" />
        ) : (
          <VolumeX className="h-5 w-5 text-muted-foreground" />
        )}
        <div>
          <p className="text-sm font-medium">Sunet la notificări</p>
          <p className="text-xs text-muted-foreground">
            Joacă un ton scurt când primești o notificare nouă.
          </p>
        </div>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={update}
        aria-label="Sunet la notificări"
      />
    </div>
  );
}
