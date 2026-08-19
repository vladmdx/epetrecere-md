"use client";

// Heart button that toggles an artist/venue in the current user's
// wishlist. On first render it checks the in-memory cache from the
// WishlistContext (loaded once per session); POST/DELETE are
// optimistic — UI flips immediately, rollback on error.
//
// Unauthenticated users see the heart but clicking redirects to
// /sign-in with a redirect_url pointing back to the current page.

import { useCallback, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLocale } from "@/hooks/use-locale";

interface Props {
  entityType: "artist" | "venue";
  entityId: number;
  /**
   * Name of the thing being saved. Every card renders this button, so without
   * it a screen reader announces "Adaugă la favorite" a dozen identical times
   * with no way to tell which item is which (flagged in the QA audit).
   */
  entityName?: string;
  /** Optional label next to the heart (e.g. "Salvează"). */
  label?: string;
  /** Size variant for the button. */
  size?: "sm" | "md" | "lg";
  className?: string;
}

// Module-level cache so multiple buttons on the same page don't re-fetch
// /api/wishlist. Invalidated on add/remove.
let cache: Set<string> | null = null;
let cacheLoaded: Promise<Set<string>> | null = null;
const listeners = new Set<() => void>();

function key(type: string, id: number) {
  return `${type}:${id}`;
}

async function loadCache(): Promise<Set<string>> {
  if (cache) return cache;
  if (cacheLoaded) return cacheLoaded;
  cacheLoaded = (async () => {
    try {
      const res = await fetch("/api/wishlist", { cache: "no-store" });
      if (!res.ok) return (cache = new Set());
      const data = (await res.json()) as {
        items: Array<{ entityType: string; entityId: number }>;
      };
      cache = new Set(
        (data.items || []).map((i) => key(i.entityType, i.entityId)),
      );
      return cache;
    } catch {
      return (cache = new Set());
    }
  })();
  return cacheLoaded;
}

function notify() {
  listeners.forEach((l) => l());
}

export function WishlistButton({
  entityType,
  entityId,
  entityName,
  label,
  size = "md",
  className,
}: Props) {
  const { t } = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { isSignedIn, isLoaded } = useUser();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const sync = useCallback(() => {
    if (cache) setSaved(cache.has(key(entityType, entityId)));
  }, [entityType, entityId]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    loadCache().then(sync);
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, [isLoaded, isSignedIn, sync]);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!isSignedIn) {
      router.push(
        `/sign-in?redirect_url=${encodeURIComponent(pathname || "/")}`,
      );
      return;
    }

    setBusy(true);
    const next = !saved;
    const k = key(entityType, entityId);
    // Optimistic update
    setSaved(next);
    if (cache) {
      if (next) cache.add(k);
      else cache.delete(k);
      notify();
    }

    try {
      if (next) {
        const res = await fetch("/api/wishlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityType, entityId }),
        });
        if (!res.ok) throw new Error();
        toast.success("Salvat în favorite");
      } else {
        const res = await fetch(
          `/api/wishlist?entityType=${entityType}&entityId=${entityId}`,
          { method: "DELETE" },
        );
        if (!res.ok) throw new Error();
        toast.success("Scos din favorite");
      }
    } catch {
      // Rollback
      setSaved(!next);
      if (cache) {
        if (!next) cache.add(k);
        else cache.delete(k);
        notify();
      }
      toast.error("Eroare. Încearcă din nou.");
    } finally {
      setBusy(false);
    }
  }

  const dim = size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-5 w-5" : "h-4 w-4";
  const padding =
    size === "sm" ? "px-2 py-1" : size === "lg" ? "px-4 py-2" : "px-3 py-1.5";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      aria-label={`${t(saved ? "a11y.removeFavorite" : "a11y.addFavorite")}${entityName ? `: ${entityName}` : ""}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border text-xs font-medium transition-colors disabled:opacity-60",
        saved
          ? "border-red-500/40 bg-red-500/10 text-red-400"
          : "border-border/60 text-muted-foreground hover:border-red-500/40 hover:text-red-400",
        padding,
        className,
      )}
    >
      <Heart
        className={cn(dim, "transition-transform", saved && "fill-current")}
      />
      {label && <span>{label}</span>}
    </button>
  );
}
