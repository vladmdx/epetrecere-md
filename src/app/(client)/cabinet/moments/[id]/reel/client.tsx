"use client";

// Phase 5/D2 — highlight reel.
//
// Full-screen auto-playing carousel of the top photos (favorites
// first, then most-recent approved) with Ken Burns zoom-in animation
// and optional looping background music. Designed to be screen-
// recorded if the owner wants an MP4 to share, which sidesteps the
// "Vercel doesn't ship ffmpeg" problem.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Pause,
  Play,
  VolumeX,
  Volume2,
  ScreenShare,
} from "lucide-react";

interface Photo {
  id: number;
  url: string;
  guestName: string | null;
  caption: string | null;
  isFavorite?: boolean;
  isApproved?: boolean;
}

interface Plan {
  title: string;
  eventDate: string | null;
  musicUrl: string | null;
}

/** How many photos to include in the reel. Caps the duration at
 *  ~80 seconds at SLIDE_MS each. */
const MAX_PHOTOS = 20;
const SLIDE_MS = 4000;

export function ReelClient({ planId }: { planId: number }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState(false);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  useEffect(() => {
    const alive = true;
    (async () => {
      try {
        const [planRes, photosRes, momentsRes] = await Promise.all([
          fetch(`/api/event-plans/${planId}`, { cache: "no-store" }),
          fetch(`/api/event-plans/${planId}/photos`, { cache: "no-store" }),
          fetch(`/api/event-plans/${planId}/moments`, { cache: "no-store" }),
        ]);
        if (!alive) return;
        const pj = planRes.ok ? await planRes.json() : null;
        const mj = momentsRes.ok ? await momentsRes.json() : null;
        if (pj?.plan) {
          setPlan({
            title: pj.plan.title,
            eventDate: pj.plan.eventDate,
            musicUrl: typeof mj?.musicUrl === "string" ? mj.musicUrl : null,
          });
        }
        if (photosRes.ok) {
          const j = await photosRes.json();
          const list = (Array.isArray(j?.photos) ? j.photos : []) as Photo[];
          // Favorites first, then most recent. Cap at MAX_PHOTOS.
          const approved = list.filter((p) => p.isApproved !== false);
          const ranked = [
            ...approved.filter((p) => p.isFavorite),
            ...approved.filter((p) => !p.isFavorite),
          ].slice(0, MAX_PHOTOS);
          setPhotos(ranked);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
  }, [planId]);

  // Advance the carousel — pauses when `paused` is true so the owner
  // can hold a frame for screenshots.
  useEffect(() => {
    if (paused || photos.length === 0) return;
    const t = setInterval(
      () => setIndex((i) => (i + 1) % photos.length),
      SLIDE_MS,
    );
    return () => clearInterval(t);
  }, [paused, photos.length]);

  // Music plumbing — copy of the slideshow logic. We don't share the
  // hook because the reel has slightly different controls.
  useEffect(() => {
    if (!plan?.musicUrl) return;
    const el = audioRef.current;
    if (!el) return;
    el.volume = 0.6;
    el.loop = true;
    const onPlay = () => {
      setMusicPlaying(true);
      setAutoplayBlocked(false);
    };
    const onPause = () => setMusicPlaying(false);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.play().catch(() => setAutoplayBlocked(true));
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
    };
  }, [plan?.musicUrl]);

  function toggleMute() {
    const el = audioRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
  }
  function startMusic() {
    const el = audioRef.current;
    if (!el) return;
    el.play()
      .then(() => setAutoplayBlocked(false))
      .catch(() => {});
  }

  const current = photos[index];
  const captionText = useMemo(() => {
    if (!current) return null;
    return current.caption || current.guestName || null;
  }, [current]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <p className="text-sm text-muted-foreground">
          Nu există încă poze pentru highlight reel. Marchează câteva ca
          favorite sau așteaptă să vină mai multe încărcări.
        </p>
        <Link
          href={`/cabinet/moments/${planId}`}
          className="mt-4 inline-block text-sm text-gold hover:underline"
        >
          ← Înapoi la galerie
        </Link>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black text-white">
      {/* Toolbar — top, fades on hover-out (CSS only, not in render).
          Visible by default so screen-recording instructions show. */}
      <div className="absolute left-0 right-0 top-0 z-20 flex flex-wrap items-center justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent p-4 print-hide">
        <Link
          href={`/cabinet/moments/${planId}`}
          className="inline-flex items-center gap-1 rounded-full bg-black/50 px-3 py-1.5 text-xs text-white/80 backdrop-blur hover:bg-black/70"
        >
          <ArrowLeft className="h-3 w-3" /> Înapoi
        </Link>
        <p className="hidden sm:block text-xs text-white/60">
          {plan?.title} · {photos.length} cadre · {SLIDE_MS / 1000}s / cadru
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPaused((p) => !p)}
            className="inline-flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs text-white/80 backdrop-blur hover:bg-black/70"
          >
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {paused ? "Reia" : "Pauză"}
          </button>
          <button
            onClick={() => {
              // Best-effort screen-share trigger. Browsers that support
              // getDisplayMedia (Chrome/Edge/Firefox desktop) will pop
              // the screen picker — owner picks "Acest tab" and uses
              // OBS / Loom / native screen record alongside. We don't
              // actually record here; the call exists to help users
              // discover the feature.
              if (typeof navigator !== "undefined" && navigator.mediaDevices?.getDisplayMedia) {
                navigator.mediaDevices
                  .getDisplayMedia({ video: true, audio: !!plan?.musicUrl })
                  .then((stream) => {
                    // Immediately stop — owner will use OBS / Loom /
                    // QuickTime to actually record. The prompt itself
                    // is the value: "yep, this is the tab to capture".
                    stream.getTracks().forEach((t) => t.stop());
                  })
                  .catch(() => {});
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-gold px-3 py-1.5 text-xs font-medium text-[#0D0D0D] hover:bg-gold-dark"
            title="Pornește înregistrarea ecranului ca să capturezi reel-ul ca video"
          >
            <ScreenShare className="h-3.5 w-3.5" /> Înregistrează
          </button>
        </div>
      </div>

      {/* The slide. Ken Burns ramp via CSS animation keyed by photo id
          so each new photo restarts from scale 1. */}
      {current && (
        <div className="absolute inset-0 overflow-hidden">
          { }
          <img
            key={current.id}
            src={current.url}
            alt={current.guestName ?? ""}
            className="reel-image h-full w-full object-contain"
          />
        </div>
      )}

      {/* Caption */}
      {captionText && (
        <div className="absolute bottom-16 left-1/2 max-w-[80%] -translate-x-1/2 rounded-full bg-black/60 px-6 py-2 text-center text-sm text-white/90 backdrop-blur">
          {current?.caption ? (
            <span className="italic">&ldquo;{current.caption}&rdquo;</span>
          ) : (
            <span>{captionText}</span>
          )}
        </div>
      )}

      {/* Slide counter */}
      <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[11px] uppercase tracking-widest text-white/40">
        {index + 1} / {photos.length}
      </p>

      {/* Music controls — bottom-left, mirrors the slideshow. */}
      {plan?.musicUrl && (
        <>
          <audio ref={audioRef} src={plan.musicUrl} loop preload="auto" playsInline />
          {musicPlaying && (
            <button
              type="button"
              onClick={toggleMute}
              className="absolute bottom-6 left-6 flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-xs text-white/90 backdrop-blur hover:bg-black/80 print-hide"
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              {muted ? "Fără sunet" : "Muzică"}
            </button>
          )}
          {autoplayBlocked && (
            <div className="absolute inset-x-0 bottom-28 flex justify-center print-hide">
              <button
                type="button"
                onClick={startMusic}
                className="flex items-center gap-2 rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-[#0D0D0D] shadow-2xl hover:bg-gold-dark"
              >
                <Play className="h-4 w-4 fill-current" /> Pornește muzica
              </button>
            </div>
          )}
        </>
      )}

      {/* Ken Burns animation. Each photo grows from scale 1.0 to 1.08
          over SLIDE_MS, then snaps back when key changes (new photo). */}
      <style>{`
        @keyframes kenburns {
          from { transform: scale(1); }
          to { transform: scale(1.08); }
        }
        .reel-image {
          animation: kenburns ${SLIDE_MS}ms ease-out forwards;
        }
      `}</style>
    </div>
  );
}
