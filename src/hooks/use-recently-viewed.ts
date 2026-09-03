"use client";

// Recently viewed tracker — stores the last N artist/venue slugs the
// current user (or guest) has opened, scoped per entity type.
// Module-level cache + listener pattern so widgets on the same page
// stay in sync without React Context.

import {  useEffect, useState } from "react";

export type RecentEntity = "artist" | "venue";
const MAX = 10;

interface RecentItem {
  slug: string;
  name: string;
  imageUrl: string | null;
  viewedAt: number;
}

const caches: Record<RecentEntity, RecentItem[]> = {
  artist: [],
  venue: [],
};
let loaded = false;
const listeners = new Set<() => void>();

function key(type: RecentEntity) {
  return `recent-${type}`;
}

function load() {
  if (loaded || typeof window === "undefined") return;
  try {
    for (const t of ["artist", "venue"] as RecentEntity[]) {
      const raw = localStorage.getItem(key(t));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          caches[t] = parsed.filter(
            (x: unknown): x is RecentItem =>
              !!x &&
              typeof (x as RecentItem).slug === "string" &&
              typeof (x as RecentItem).name === "string",
          );
        }
      }
    }
  } catch {
    /* storage blocked */
  }
  loaded = true;
}

function persist(type: RecentEntity) {
  try {
    localStorage.setItem(key(type), JSON.stringify(caches[type]));
  } catch {
    /* ignore */
  }
}

function notify() {
  listeners.forEach((l) => l());
}

/** Hook to read the list — updates when any tab adds/removes items. */
export function useRecentlyViewed(type: RecentEntity) {
  const [items, setItems] = useState<RecentItem[]>([]);
  useEffect(() => {
    load();
    let active = true;
    let revision = 0;
    const sync = async () => {
      const run = ++revision;
      const snapshot = caches[type].slice(0, MAX);
      if (!snapshot.length) { setItems([]); return; }
      try {
        const res = await fetch(`/api/public/catalog-status?type=${type}&slugs=${encodeURIComponent(snapshot.map(x=>x.slug).join(","))}`);
        if (!res.ok) throw new Error("catalog_status_unavailable");
        const data = await res.json();
        if (!active || run !== revision) return;
        const valid = snapshot.filter(x=>Array.isArray(data.slugs) && data.slugs.includes(x.slug));
        caches[type] = valid;
        persist(type);
        setItems(valid);
      } catch {
        if (active && run === revision) setItems([]);
      }
    };
    void sync();
    listeners.add(sync);
    return () => {
      active = false;
      listeners.delete(sync);
    };
  }, [type]);
  return items;
}

/** Imperative tracker — call from detail pages to record a visit. */
export function trackRecentView(
  type: RecentEntity,
  item: Pick<RecentItem, "slug" | "name" | "imageUrl">,
) {
  load();
  const existing = caches[type];
  // Dedupe by slug — move to top if already present
  const filtered = existing.filter((x) => x.slug !== item.slug);
  caches[type] = [{ ...item, viewedAt: Date.now() }, ...filtered].slice(0, MAX);
  persist(type);
  notify();
}
