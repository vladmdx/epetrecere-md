/**
 * ePetrecere.md service worker.
 *
 * Responsibilities (keep this SW tiny and predictable):
 *   1. Web Push — listen for "push" events and display a notification.
 *   2. Click handling — focus an existing tab or open a fresh one at the
 *      notification's `actionUrl`.
 *
 * We intentionally DON'T do offline caching / asset precaching here —
 * Next.js + Vercel already handle edge caching, and an aggressive SW
 * cache tends to cause stale-UI bugs that outweigh the offline benefit
 * for this marketplace. If we later need offline for specific routes,
 * add a route-matching cache here.
 */

self.addEventListener("install", (event) => {
  // Activate immediately on first install so push works without reload.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  // Claim clients so the new SW controls already-open tabs.
  event.waitUntil(self.clients.claim());
});

// ─── Push: display a notification ──────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Notificare nouă", body: event.data.text() };
  }

  const title = payload.title || "ePetrecere.md";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icon",
    badge: payload.badge || "/icon",
    tag: payload.tag || "epetrecere",
    // Re-display (not just update) so user sees the latest item
    renotify: !!payload.tag,
    data: {
      url: payload.actionUrl || "/",
    },
    // Android shows these; iOS Safari does not yet
    actions: payload.actions || undefined,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── Click: focus existing tab or open new ─────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/";
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // If a tab with our origin is open, focus it and navigate.
      for (const c of allClients) {
        try {
          const u = new URL(c.url);
          const target = new URL(url, self.registration.scope);
          if (u.origin === target.origin && "focus" in c) {
            await c.navigate(target.toString());
            return c.focus();
          }
        } catch {
          /* ignore */
        }
      }
      // Otherwise open a new tab.
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })(),
  );
});
