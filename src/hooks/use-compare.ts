"use client";

// Compare selection — tracks up to 3 entity IDs (per type) in
// localStorage so the user keeps their selection across page navigation.
// Deliberately simple: no context/provider, just a module-level store
// with a React hook that subscribes to change events.
//
// Usage:
//   const { ids, toggle, clear, has } = useCompare("artist");
//   <button onClick={() => toggle(artist.id)}>Compară</button>

import { useCallback, useEffect, useState } from "react";

export type CompareEntity = "artist" | "venue";
const MAX = 3;

const listeners = new Set<() => void>();
const caches: Record<CompareEntity, number[]> = {
  artist: [],
  venue: [],
};
let loaded = false;

function storageKey(type: CompareEntity) {
  return `compare-${type}`;
}

function loadFromStorage() {
  if (loaded) return;
  try {
    for (const t of ["artist", "venue"] as CompareEntity[]) {
      const raw = localStorage.getItem(storageKey(t));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          caches[t] = parsed
            .map((n) => Number(n))
            .filter((n) => Number.isFinite(n))
            .slice(0, MAX);
        }
      }
    }
  } catch {
    /* storage blocked */
  }
  loaded = true;
}

function persist(type: CompareEntity) {
  try {
    localStorage.setItem(storageKey(type), JSON.stringify(caches[type]));
  } catch {
    /* ignore */
  }
}

function notify() {
  listeners.forEach((l) => l());
}

export function useCompare(type: CompareEntity) {
  const [ids, setIds] = useState<number[]>([]);

  // Sync with module cache on mount + subscribe to changes
  useEffect(() => {
    loadFromStorage();
    setIds(caches[type].slice());
    const update = () => setIds(caches[type].slice());
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, [type]);

  const toggle = useCallback(
    (id: number): { added: boolean; reason?: string } => {
      loadFromStorage();
      const current = caches[type];
      const idx = current.indexOf(id);
      if (idx >= 0) {
        caches[type] = current.filter((x) => x !== id);
        persist(type);
        notify();
        return { added: false };
      }
      if (current.length >= MAX) {
        return { added: false, reason: "max" };
      }
      caches[type] = [...current, id];
      persist(type);
      notify();
      return { added: true };
    },
    [type],
  );

  const clear = useCallback(() => {
    caches[type] = [];
    persist(type);
    notify();
  }, [type]);

  const has = useCallback((id: number) => ids.includes(id), [ids]);

  return { ids, toggle, clear, has, max: MAX };
}
