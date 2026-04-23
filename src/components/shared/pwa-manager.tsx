"use client";

// PWA manager — does two things on mount:
//   1. Registers /sw.js (service worker) so Web Push + future offline work
//   2. Watches for beforeinstallprompt and surfaces a subtle install
//      banner after the user has browsed a few pages (not immediately —
//      too aggressive = ignored).
//
// Install banner dismissal is persisted in localStorage so the user isn't
// nagged more than once every 14 days. The browser-native install flow
// still works at any time via address bar / menu.

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";

const DISMISS_KEY = "pwa-install-dismissed-until";
const SHOW_AFTER_VISITS_KEY = "pwa-install-visits";
const SHOW_AFTER_VISITS = 3;
const DISMISS_DAYS = 14;

// Chrome's beforeinstallprompt gives us a deferred prompt object — save it
// and fire .prompt() when the user clicks our custom install CTA.
type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function PwaManager() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // 1. Register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((err) => console.warn("[sw] registration failed", err));
    }

    // 2. Count visits for banner threshold
    try {
      const n = Number(localStorage.getItem(SHOW_AFTER_VISITS_KEY) || "0") + 1;
      localStorage.setItem(SHOW_AFTER_VISITS_KEY, String(n));
    } catch {
      /* storage blocked */
    }

    // 3. Listen for install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      const bip = e as BIPEvent;
      setDeferred(bip);

      // Should we show the banner?
      try {
        const visits = Number(
          localStorage.getItem(SHOW_AFTER_VISITS_KEY) || "0",
        );
        const dismissUntil = Number(
          localStorage.getItem(DISMISS_KEY) || "0",
        );
        if (visits >= SHOW_AFTER_VISITS && Date.now() > dismissUntil) {
          // Small delay so the banner appears after user sees the hero
          setTimeout(() => setVisible(true), 2500);
        }
      } catch {
        /* ignore */
      }
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const result = await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
    if (result.outcome === "dismissed") {
      try {
        localStorage.setItem(
          DISMISS_KEY,
          String(Date.now() + DISMISS_DAYS * 24 * 3600 * 1000),
        );
      } catch {
        /* ignore */
      }
    }
  }

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(
        DISMISS_KEY,
        String(Date.now() + DISMISS_DAYS * 24 * 3600 * 1000),
      );
    } catch {
      /* ignore */
    }
  }

  if (!visible || !deferred) return null;

  return (
    <div
      role="dialog"
      aria-label="Instalează ePetrecere ca aplicație"
      className="fixed bottom-4 left-4 right-4 z-[100] mx-auto max-w-md rounded-2xl border border-gold/30 bg-card/95 p-4 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom sm:left-auto"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-lg bg-gold/15 p-2 text-gold">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-heading font-semibold">
            Instalează ePetrecere pe telefon
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Acces rapid din ecranul principal — ca o aplicație. Notificări
            când primești răspuns de la artiști sau săli.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={install}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gold px-3 py-1.5 text-xs font-semibold text-[#0D0D0D] hover:bg-gold-dark"
            >
              Instalează
            </button>
            <button
              onClick={dismiss}
              className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Mai târziu
            </button>
          </div>
        </div>
        <button
          onClick={dismiss}
          aria-label="Închide"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
