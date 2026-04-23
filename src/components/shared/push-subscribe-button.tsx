"use client";

// Push subscribe toggle — asks for browser notification permission on
// click, subscribes to our VAPID endpoint, and stores the subscription
// via /api/push/subscribe.
//
// Shows one of three states:
//   - "Activate notificări" when not subscribed yet
//   - "Notificări active" (green) when subscribed
//   - "Blocate de browser" (disabled) when permission is denied
//
// Also handles unsubscribe: click again → DELETE the server record +
// unsubscribe the browser PushManager.

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  // Explicit `new ArrayBuffer(...)` buffer so TS infers Uint8Array<ArrayBuffer>
  // (not ArrayBufferLike) — required by PushManager.subscribe typings.
  const buf = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State =
  | "loading"
  | "unsupported"
  | "denied"
  | "subscribed"
  | "not-subscribed";

export function PushSubscribeButton() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        setState(existing ? "subscribed" : "not-subscribed");
      } catch {
        setState("not-subscribed");
      }
    })();
  }, []);

  async function subscribe() {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      toast.error("Server push nu e configurat");
      return;
    }
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "not-subscribed");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast to BufferSource — TS DOM types pick the wrong overload for
        // Uint8Array<ArrayBufferLike> under strict settings; at runtime the
        // browser accepts any Uint8Array.
        applicationServerKey:
          urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error();
      setState("subscribed");
      toast.success("Notificări activate 🔔");
    } catch (err) {
      console.error(err);
      toast.error("Nu am putut activa notificările");
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(
          `/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`,
          { method: "DELETE" },
        );
        await sub.unsubscribe();
      }
      setState("not-subscribed");
      toast.success("Notificări dezactivate");
    } catch {
      toast.error("Eroare la dezactivare");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") {
    return (
      <button
        disabled
        className="inline-flex items-center gap-2 rounded-lg border border-border/40 px-3 py-2 text-sm text-muted-foreground"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Verific…
      </button>
    );
  }

  if (state === "unsupported") {
    return (
      <div className="rounded-lg border border-border/40 bg-muted/30 p-3 text-xs text-muted-foreground">
        Browser-ul tău nu suportă notificări push.
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
        <p className="font-medium text-amber-500">Notificări blocate</p>
        <p className="mt-1 text-muted-foreground">
          Le-ai blocat din setările browserului. Deschide setările site-ului
          (🔒 lângă URL) și re-permite notificările.
        </p>
      </div>
    );
  }

  if (state === "subscribed") {
    return (
      <button
        onClick={unsubscribe}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-500 transition-colors hover:bg-emerald-500/15 disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Bell className="h-4 w-4" />
        )}
        Notificări active — apasă pentru a dezactiva
      </button>
    );
  }

  return (
    <button
      onClick={subscribe}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-medium text-[#0D0D0D] transition-colors hover:bg-gold-dark disabled:opacity-60"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <BellOff className="h-4 w-4" />
      )}
      Activează notificări
    </button>
  );
}
