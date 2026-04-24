// Client-side helper for firing a track-click beacon. Non-blocking,
// swallows all errors so the CTA flow is never delayed by analytics.

type ClickType = "cta" | "phone" | "gallery" | "menu" | "contact";

export function trackClick(
  kind: "artist" | "venue",
  id: number,
  clickType: ClickType,
): void {
  if (typeof window === "undefined") return;

  // Use sendBeacon when available so the request survives even if the user
  // navigates away immediately after clicking a tel: / anchor link.
  const body = JSON.stringify({ kind, id, clickType });
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/analytics/track-click", blob);
      return;
    }
  } catch {
    // fallthrough to fetch
  }

  fetch("/api/analytics/track-click", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    // keepalive lets the request continue after navigation. Cap total body
    // at 64KB (we're sending ~80 bytes).
    keepalive: true,
  }).catch(() => {
    // Never surface analytics errors.
  });
}
