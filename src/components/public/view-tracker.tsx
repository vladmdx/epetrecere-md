"use client";

// M5 — Fire-and-forget client beacon that logs a profile view on mount.
// Mounted inside the artist / venue detail server components; does nothing
// visible. Uses `navigator.sendBeacon` when available so page navigations
// don't cancel the request, falling back to fetch with keepalive.

import { useEffect } from "react";

interface Props {
  kind: "artist" | "venue";
  id: number;
}

export function ViewTracker({ kind, id }: Props) {
  useEffect(() => {
    if (!Number.isFinite(id)) return;
    const body = JSON.stringify({
      kind,
      id,
      referrer: typeof document !== "undefined" ? document.referrer || null : null,
    });
    try {
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.sendBeacon === "function"
      ) {
        const blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon("/api/analytics/track-view", blob);
        return;
      }
      void fetch("/api/analytics/track-view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    } catch {
      // Analytics must never break the page
    }
  }, [kind, id]);

  return null;
}
