"use client";

// Gate for the decorative background videos on the marketing sections.
//
// Two things CSS cannot do, which is why this is a hook:
//   1. `hidden md:block` only stops the video from being PAINTED. The element
//      is still in the DOM, so a phone on a mobile connection downloads the
//      whole file and then throws it away. The element has to be absent below
//      768px, and only JS knows the viewport width.
//   2. A video far down the page still starts buffering at page load, stealing
//      bandwidth from the first screen. Below-the-fold sections therefore only
//      mount their video once they approach the viewport.
//
// The decision is also suppressed for people who asked for less motion or
// turned on data saver — a looping background is exactly what both mean.
//
// Usage:
//   const { ref, showVideo } = useBackgroundVideo();                 // below the fold
//   const { ref, showVideo } = useBackgroundVideo({ eager: true });  // hero
//   <div ref={ref}>{showVideo && <video … />}</div>

import { useEffect, useState, useSyncExternalStore } from "react";

const DESKTOP = "(min-width: 768px)";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

// Start buffering a little before the section scrolls in so the poster is not
// still alone by the time the user reaches it.
const ROOT_MARGIN = "400px";

type ConnectionInfo = { saveData?: boolean };

const mqlCache = new Map<string, MediaQueryList>();

function mql(query: string) {
  let cached = mqlCache.get(query);
  if (!cached) {
    cached = window.matchMedia(query);
    mqlCache.set(query, cached);
  }
  return cached;
}

function subscribe(onChange: () => void) {
  const watched = [mql(DESKTOP), mql(REDUCED_MOTION)];
  watched.forEach((m) => m.addEventListener("change", onChange));
  return () => watched.forEach((m) => m.removeEventListener("change", onChange));
}

function getSnapshot() {
  // Data saver has no media query and no event worth wiring up for a
  // decoration, so it is read once per snapshot alongside the real queries.
  const connection = (navigator as Navigator & { connection?: ConnectionInfo }).connection;
  return mql(DESKTOP).matches && !mql(REDUCED_MOTION).matches && !connection?.saveData;
}

// The server has no viewport: it always renders the poster, and the client
// upgrades to video after hydration. Rendering `false` on both sides keeps
// hydration free of mismatches.
function getServerSnapshot() {
  return false;
}

export function useBackgroundVideo({ eager = false }: { eager?: boolean } = {}) {
  const wantsVideo = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [near, setNear] = useState(eager);
  // A callback ref rather than useRef, so the observer also attaches to a
  // section that mounts later — the testimonials block only renders once its
  // fetch resolves, by which time a ref-based effect would already have run.
  const [node, setNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (near || !wantsVideo || !node) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: ROOT_MARGIN },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [near, wantsVideo, node]);

  return { ref: setNode, showVideo: wantsVideo && near };
}
