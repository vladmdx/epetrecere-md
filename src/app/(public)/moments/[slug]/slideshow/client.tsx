"use client";

// Fullscreen slideshow for the event projector.
//
// Phase 2 adds the once.film-style reveal moment:
//   - Before reveal: a centered countdown to revealAt + the upload QR
//     + a live "X cadre primite" counter. No photos shown to the room.
//   - At reveal: the countdown swaps for the carousel. Same client, no
//     reload needed (we poll the public API every 10s).
//   - Always-visible upload QR in the corner so guests can keep
//     submitting through the night.
//
// We deliberately don't gate by `uploadState` (the open/close window)
// because the slideshow is the owner's display, not a guest upload
// page — they want the carousel to keep playing what's been received
// even after the upload window has closed.

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

interface Photo {
  id: number;
  url: string;
  guestName: string | null;
  guestMessage: string | null;
}

interface MomentsState {
  photos: Photo[];
  totalPhotos: number;
  revealed: boolean;
  revealAt: string | null;
}

/** ms → "2 zile 3 ore" / "47 min" / "12 sec". Mirrors the guest UI
 *  formatter so the room sees the same phrasing across screens. */
function formatCountdown(ms: number): string {
  if (ms <= 0) return "se dezvăluie acum";
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (day > 0) return `${day} ${day === 1 ? "zi" : "zile"} ${hr % 24} ${hr % 24 === 1 ? "oră" : "ore"}`;
  if (hr > 0) return `${hr} ${hr === 1 ? "oră" : "ore"} ${min % 60} min`;
  if (min > 0) return `${min} min ${sec % 60} sec`;
  return `${sec} sec`;
}

export function SlideshowClient({ slug, title }: { slug: string; title: string }) {
  const [state, setState] = useState<MomentsState>({
    photos: [],
    totalPhotos: 0,
    revealed: true,
    revealAt: null,
  });
  const [index, setIndex] = useState(0);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Track which ids we've already shown so newcomers can be inserted
  // at the front of the carousel for instant highlight on the projector.
  const seenIds = useRef<Set<number>>(new Set());

  // Upload-page QR — sized big so guests can scan from across the room.
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

  // 1Hz tick — countdown text refreshes locally without polling.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Poll the public API every 10s for fresh photos AND for the reveal
  // flag. When reveal flips on the server, the slideshow auto-switches
  // from countdown → carousel within ~15s.
  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const res = await fetch(`/api/moments/${slug}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const incoming = Array.isArray(data.photos) ? (data.photos as Photo[]) : [];
        setState((prev) => {
          // Merge new arrivals at the front so the projector spotlights them.
          const existing = new Set(prev.photos.map((p) => p.id));
          const fresh = incoming.filter((p) => !existing.has(p.id));
          fresh.forEach((p) => seenIds.current.add(p.id));
          const merged =
            fresh.length === 0
              ? prev.photos
              : [...fresh.reverse(), ...prev.photos];
          return {
            photos: merged,
            totalPhotos: Number(data.totalPhotos) || merged.length,
            revealed: Boolean(data.revealed),
            revealAt: data.plan?.revealAt ?? null,
          };
        });
      } catch {
        /* network blips are fine — keep showing what we have */
      }
    }
    void fetchData();
    const id = setInterval(fetchData, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [slug]);

  // Advance carousel every 5s — only when revealed.
  useEffect(() => {
    if (!state.revealed || state.photos.length === 0) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % state.photos.length);
    }, 5000);
    return () => clearInterval(id);
  }, [state.revealed, state.photos.length]);

  const current = state.photos[index];
  const revealsIn = state.revealAt
    ? Math.max(0, new Date(state.revealAt).getTime() - now)
    : 0;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black text-white">
      {/* ────────────── PRE-REVEAL: countdown takeover ────────────── */}
      {!state.revealed && (
        <div className="flex h-full w-full flex-col items-center justify-center px-10 text-center">
          <p className="text-xs uppercase tracking-[6px] text-white/50 md:text-sm">
            {title}
          </p>
          <h1 className="mt-6 font-heading text-5xl font-bold text-gold drop-shadow-[0_0_30px_rgba(201,168,76,0.35)] md:text-7xl">
            Galeria se dezvăluie în
          </h1>
          <p className="mt-6 font-heading text-6xl font-bold tabular-nums md:text-8xl">
            {state.revealAt
              ? formatCountdown(revealsIn)
              : "așteaptăm finalul evenimentului"}
          </p>
          {state.revealAt && (
            <p className="mt-4 text-base text-white/60 md:text-lg">
              {new Date(state.revealAt).toLocaleString("ro-RO", {
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}

          {/* Live count of submissions — keeps the room engaged. */}
          <div className="mt-10 rounded-2xl border border-gold/30 bg-black/40 px-8 py-4 backdrop-blur">
            <p className="text-xs uppercase tracking-[4px] text-white/50">
              cadre primite
            </p>
            <p className="mt-1 font-heading text-5xl font-bold text-gold md:text-6xl">
              {state.totalPhotos}
            </p>
          </div>

          <p className="mt-10 max-w-xl text-base text-white/70 md:text-lg">
            Scanează codul QR și trimite amintirile tale. Le vom vedea
            împreună la dezvăluire.
          </p>
        </div>
      )}

      {/* ────────────── REVEALED: carousel ────────────── */}
      {state.revealed && current ? (
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
            {index + 1} / {state.photos.length}
          </div>
        </>
      ) : null}

      {/* ────────────── REVEALED but empty: idle ────────────── */}
      {state.revealed && !current && (
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

      {/* Always-visible QR corner — guests can scan from across the room
          even during the pre-reveal countdown so the upload flow keeps
          accepting submissions. */}
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
