"use client";

// Toggle for the soft chime played when a new notification or chat
// message arrives. Persisted in localStorage so it stays per-browser.
// Read by NotificationBell + ChatBell via the shared sound helper.

import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Volume2, VolumeX } from "lucide-react";
import {
  isSoundEnabled,
  setSoundEnabled,
  playNotificationChime,
  playMessageChime,
} from "@/lib/notifications/sound";

export function NotificationSoundToggle() {
  const [enabled, setEnabled] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setEnabled(isSoundEnabled());
    setHydrated(true);
  }, []);

  function update(next: boolean) {
    setEnabled(next);
    setSoundEnabled(next);
    if (next) {
      // Preview both chimes back-to-back so the user can hear both
      // sounds (notification first, then message ~500ms later).
      playNotificationChime();
      setTimeout(() => playMessageChime(), 500);
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
          <p className="text-sm font-medium">Sunet la notificări și mesaje</p>
          <p className="text-xs text-muted-foreground">
            Joacă un ton scurt când primești o notificare sau un mesaj nou.
            Standard: pornit. Click pe comutator pentru a auzi un preview.
          </p>
        </div>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={update}
        aria-label="Sunet la notificări și mesaje"
      />
    </div>
  );
}
