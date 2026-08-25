"use client";

// M10 Intern #3 — Client-side lightbox gallery for a real wedding.
// Simple masonry grid + fullscreen lightbox with keyboard navigation.

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface Photo {
  id: number;
  url: string;
  caption: string | null;
}

export function RealWeddingGallery({ photos }: { photos: Photo[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const close = useCallback(() => setOpenIdx(null), []);
  const next = useCallback(
    () => setOpenIdx((i) => (i === null ? null : (i + 1) % photos.length)),
    [photos.length],
  );
  const prev = useCallback(
    () =>
      setOpenIdx((i) =>
        i === null ? null : (i - 1 + photos.length) % photos.length,
      ),
    [photos.length],
  );

  useEffect(() => {
    if (openIdx === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openIdx, close, next, prev]);

  if (photos.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Nu există fotografii disponibile.
      </p>
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {photos.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setOpenIdx(i)}
            className="group relative aspect-square overflow-hidden rounded-xl bg-muted"
          >
            <Image
              src={p.url}
              alt={p.caption || `Fotografie ${i + 1}`}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover transition-transform group-hover:scale-105"
            />
          </button>
        ))}
      </div>

      {openIdx !== null && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-background/95 backdrop-blur"
          onClick={close}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              close();
            }}
            className="absolute right-4 top-4 rounded-full bg-card p-2 hover:bg-accent"
            aria-label="Închide"
          >
            <X className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-card p-2 hover:bg-accent"
            aria-label="Precedenta"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-card p-2 hover:bg-accent"
            aria-label="Următoarea"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <div
            className="relative max-h-[85vh] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={photos[openIdx].url}
              alt={photos[openIdx].caption || ""}
              width={1600}
              height={1200}
              className="max-h-[85vh] w-auto rounded-xl object-contain"
              unoptimized
            />
            {photos[openIdx].caption && (
              <p className="mt-3 text-center text-sm text-muted-foreground">
                {photos[openIdx].caption}
              </p>
            )}
            <p className="mt-1 text-center text-xs text-muted-foreground">
              {openIdx + 1} / {photos.length}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
