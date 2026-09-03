"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

/**
 * Fetches the fields an artist or venue profile withholds from anonymous
 * visitors — the starting price and the owner's own links.
 *
 * The page itself is prerendered in its anonymous form so it can be static,
 * which means those fields are simply absent from the HTML. This asks for
 * them once, after Clerk confirms there is a session. Returns null until
 * then, so a caller can keep rendering the "price on sign-in" prompt without
 * a flash of the wrong state.
 */
export function useGatedDetails<T extends object>(
  type: "artist" | "venue",
  slug: string,
): T | null {
  const { isLoaded, isSignedIn } = useAuth();
  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    setData(null);
    if (!isLoaded || !isSignedIn || !slug) return;
    let alive = true;
    fetch(
      `/api/public/gated-details?type=${type}&slug=${encodeURIComponent(slug)}`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive) setData(d as T | null);
      })
      .catch(() => {
        /* the profile stays in its anonymous shape — no worse than before */
      });
    return () => {
      alive = false;
    };
  }, [isLoaded, isSignedIn, type, slug]);

  return isLoaded && isSignedIn ? data : null;
}
