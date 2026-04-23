"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

interface Photo {
  id: number;
  url: string;
  guestName: string | null;
  guestMessage: string | null;
}

export function SlideshowClient({ slug, title }: { slug: string; title: string }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [index, setIndex] = useState(0);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const seenIds = useRef<Set<number>>(new Set());

  // Generate the upload-page QR so guests on TV can scan it with their phone
  useEffect(() => {
    const uploadUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/moments/${slug}`
        : `/moments/${slug}`;
    QRCode.toDataURL(uploadUrl, {
      width: 240,
      margin: 1,
      color: { dark: "#0D0D0D", light: "#FFFFFF" },
    })
      .then(setQrUrl)
      .catch(() => {
        /* ignore */
      });
  }, [slug]);

  // Poll the gallery every 10s so new uploads appear within ~15s.
  useEffect(() => {
    let cancelled = false;
    async function fetchPhotos() {
      try {
        const res = await fetch(`/api/moments/${slug}`, { cache: "no-store" });
        if (!res.ok) return;
        const { photos: incoming } = await res.json();
        if (cancelled) return;
        setPhotos((prev) => {
          const existing = new Set(prev.map((p) => p.id));
          const fresh = (incoming as Photo[]).filter((p) => !existing.has(p.id));
          if (fresh.length === 0) return prev;
          fresh.forEach((p) => seenIds.current.add(p.id));
          // Put brand-new photos first so the projector highlights them next.
          return [...fresh.reverse(), ...prev];
        });
      } catch {
        /* network blips are fine — keep showing what we have */
      }
    }
    fetchPhotos();
    const id = setInterval(fetchPhotos, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [slug]);

  // Advance every 5s.
  useEffect(() => {
    if (photos.length === 0) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % photos.length);
    }, 5000);
    return () => clearInterval(id);
  }, [photos.length]);

  const current = photos[index];

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black text-white">
      {current ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={current.id}
            src={current.url}
            alt={current.guestName ?? title}
            className="h-full w-full animate-fade-up object-contain"
          />
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-6 py-2 text-sm backdrop-blur">
            {current.guestName && (
              <span className="font-medium">{current.guestName}</span>
            )}
            {current.guestMessage && (
              <span className="ml-3 italic opacity-80">
                &ldquo;{current.guestMessage}&rdquo;
              </span>
            )}
          </div>
          {/* Photo counter */}
          <div className="absolute left-8 top-8 rounded-full bg-black/60 px-4 py-1.5 text-xs text-white/80 backdrop-blur">
            {index + 1} / {photos.length}
          </div>
        </>
      ) : (
        <div className="text-center">
          <p className="text-sm uppercase tracking-[4px] text-white/60">
            {title}
          </p>
          <p className="mt-4 font-heading text-4xl font-bold">
            În așteptarea primelor poze...
          </p>
          <p className="mt-2 text-sm text-white/50">
            Scanează QR-ul și trimite momentele tale
          </p>
        </div>
      )}

      {/* Always-visible QR corner — guests can scan from across the room */}
      {qrUrl && (
        <div className="absolute right-8 top-8 flex flex-col items-center gap-2 rounded-2xl bg-white/95 p-3 shadow-2xl backdrop-blur">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl} alt="Scan pentru upload poze" className="h-32 w-32" />
          <p className="text-center text-[11px] font-semibold text-black">
            📸 Scanează
            <br />
            trimite poze
          </p>
        </div>
      )}
    </div>
  );
}
