"use client";

// F-C8 — Guest upload UI for Photo Moments.
//
// Phase 1 adds the once.film mechanics on top of the original "shared
// gallery" flow:
//   - Upload window (openAt..closeAt). Outside the window we hide the
//     form and show a countdown / "filmul s-a închis" message.
//   - Reveal time (revealAt). Photos exist on the server but are hidden
//     from guests until the reveal moment, so the wedding-night surprise
//     is preserved.
//   - Per-device shot limit (shotLimit). Each device gets a random UUID
//     in localStorage; the server counts uploads against that key and
//     rejects extras. UI shows "X/Y cadre rămase" so guests know how
//     many shots they still have.
//
// Everything stays mobile-first and works without auth — must run on
// every guest's phone, including the older ones.

import { useEffect, useMemo, useState, useCallback } from "react";
import { Camera, Upload, Check, Loader2, Image as ImageIcon, Lock, Clock, Eye, Sparkles, SkipForward, Trophy } from "lucide-react";
import { applyVintage } from "@/lib/moments/vintage-filter";

interface Photo {
  id: number;
  url: string;
  guestName: string | null;
  guestMessage: string | null;
  prompt?: string | null;
  reactions?: Record<string, number>;
  myReactions?: string[];
}

interface Props {
  slug: string;
  title: string;
  eventDate: string | null;
  openAt: string | null;
  closeAt: string | null;
  revealAt: string | null;
  shotLimit: number | null;
  vintage: boolean;
  prompts: string[];
  tables: string[];
}

type UploadState = "before" | "open" | "after";

interface MomentsState {
  photos: Photo[];
  totalPhotos: number;
  deviceUsed: number | null;
  uploadState: UploadState;
  revealed: boolean;
  promptsDone: string[];
}

/** Allowed emoji on the public reactions UI. Mirrors the server's
 *  allowlist — keeping it tight here so the buttons don't drift out
 *  of sync if someone fork-edits one side. */
const REACTION_EMOJI = ["❤️", "🔥", "😂", "🥺", "🎉"] as const;

/** Stable UUIDish for this device. Stored in localStorage so reloads /
 *  re-uploads keep the same identity. We don't try to defeat clearing
 *  the storage — Phase 1's threat model is friendly guests, not
 *  adversaries trying to game the limit. */
function getOrCreateDeviceId(slug: string): string {
  const key = `moments-device-${slug}`;
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id =
        (crypto.randomUUID?.() ??
          Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, "");
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    // localStorage disabled (incognito Safari, etc) — use an in-memory
    // fallback. Shot-limit won't survive a page reload but uploads
    // still work.
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

/** ms → friendly countdown like "2 zile 3 ore", "47 min", "12 sec". */
function formatCountdown(ms: number): string {
  if (ms <= 0) return "0 sec";
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (day > 0) return `${day} ${day === 1 ? "zi" : "zile"} ${hr % 24} ${hr % 24 === 1 ? "oră" : "ore"}`;
  if (hr > 0) return `${hr} ${hr === 1 ? "oră" : "ore"} ${min % 60} min`;
  if (min > 0) return `${min} min`;
  return `${sec} sec`;
}

export function MomentsUploadClient({
  slug,
  title,
  eventDate,
  openAt,
  closeAt,
  revealAt,
  shotLimit,
  vintage,
  prompts,
  tables,
}: Props) {
  const deviceId = useMemo(() => getOrCreateDeviceId(slug), [slug]);

  /** Phase 5/C3 — table identifier from the QR code. Each table card
   *  uses `?t=Masa%205`; the client tags every upload with the
   *  matching label so the owner sees per-table contributions. */
  const tableLabel = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      const url = new URL(window.location.href);
      const raw = url.searchParams.get("t");
      if (!raw) return null;
      const trimmed = raw.trim();
      // Only accept labels the owner declared — silently drop others
      // so a hand-edited QR can't poison the table breakdown.
      return tables.includes(trimmed) ? trimmed : null;
    } catch {
      return null;
    }
  }, [tables]);

  const [state, setState] = useState<MomentsState>({
    photos: [],
    totalPhotos: 0,
    deviceUsed: shotLimit ? 0 : null,
    // Optimistic: assume open until the server says otherwise.
    uploadState: "open",
    // Optimistic: hide the gallery if reveal is in the future, show
    // otherwise. The server-side check on the first fetch is the
    // source of truth.
    revealed: !revealAt || new Date(revealAt) <= new Date(),
    promptsDone: [],
  });

  // Phase 4A — prompt walker state. When the film runs in prompts
  // mode the guest answers one at a time; "skipped" prompts are kept
  // in localStorage so a refresh doesn't pop the skipped one back to
  // the front.
  const skippedKey = `moments-skipped-${slug}`;
  const [skipped, setSkipped] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(skippedKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(skippedKey, JSON.stringify(skipped));
    } catch {
      /* private mode → ephemeral, fine */
    }
  }, [skippedKey, skipped]);

  const currentPrompt = useMemo(() => {
    if (prompts.length === 0) return null;
    const doneSet = new Set([...state.promptsDone, ...skipped]);
    return prompts.find((p) => !doneSet.has(p)) ?? null;
  }, [prompts, state.promptsDone, skipped]);

  const promptsCompleted = state.promptsDone.length;
  const promptsTotal = prompts.length;
  const allPromptsDone = promptsTotal > 0 && currentPrompt === null;
  const [now, setNow] = useState(() => Date.now());

  const [guestName, setGuestName] = useState("");
  const [guestMessage, setGuestMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleReaction(photoId: number, emoji: string) {
    // Optimistic update — flip locally first so the tap feels
    // instantaneous, then reconcile with the server. On failure we
    // roll back.
    setState((s) => ({
      ...s,
      photos: s.photos.map((p) => {
        if (p.id !== photoId) return p;
        const mine = new Set(p.myReactions ?? []);
        const next = { ...(p.reactions ?? {}) };
        if (mine.has(emoji)) {
          mine.delete(emoji);
          next[emoji] = Math.max(0, (next[emoji] ?? 1) - 1);
          if (next[emoji] === 0) delete next[emoji];
        } else {
          mine.add(emoji);
          next[emoji] = (next[emoji] ?? 0) + 1;
        }
        return { ...p, reactions: next, myReactions: Array.from(mine) };
      }),
    }));
    try {
      await fetch(`/api/moments/${slug}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId, emoji, deviceId }),
      });
    } catch {
      /* network blip — next poll will reconcile */
    }
  }

  // Persist the guest name across visits on the same device so they
  // don't retype it for every batch.
  useEffect(() => {
    const saved = localStorage.getItem(`moments-name-${slug}`);
    if (saved) setGuestName(saved);
  }, [slug]);
  useEffect(() => {
    if (guestName) localStorage.setItem(`moments-name-${slug}`, guestName);
  }, [slug, guestName]);

  // Ticking clock so countdowns refresh without polling the server.
  // 1 Hz is plenty for "se deschide în 12 min".
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Hydrate state from the API on mount + poll every ~12s so new
  // uploads from other guests trickle in and the reveal flip happens
  // without a manual refresh.
  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/moments/${slug}?device_id=${encodeURIComponent(deviceId)}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      setState({
        photos: Array.isArray(data.photos) ? data.photos : [],
        totalPhotos: Number(data.totalPhotos) || 0,
        deviceUsed:
          typeof data.deviceUsed === "number" ? data.deviceUsed : null,
        uploadState: (data.uploadState as UploadState) ?? "open",
        revealed: Boolean(data.revealed),
        promptsDone: Array.isArray(data.promptsDone) ? data.promptsDone : [],
      });
    } catch {
      /* offline — try again on next tick */
    }
  }, [slug, deviceId]);

  useEffect(() => {
    void fetchState();
    const t = setInterval(fetchState, 12_000);
    return () => clearInterval(t);
  }, [fetchState]);

  // Derived counters for the UI.
  const remainingShots =
    typeof shotLimit === "number" && typeof state.deviceUsed === "number"
      ? Math.max(0, shotLimit - state.deviceUsed)
      : null;
  const limitReached = remainingShots === 0;

  // Countdown targets — pick the next meaningful event for the user
  // (open if before, close if open, reveal if hidden).
  const opensIn = openAt ? Math.max(0, new Date(openAt).getTime() - now) : 0;
  const closesIn = closeAt ? Math.max(0, new Date(closeAt).getTime() - now) : 0;
  const revealsIn = revealAt ? Math.max(0, new Date(revealAt).getTime() - now) : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!guestName.trim() || files.length === 0) {
      setError("Scrie numele tău și alege cel puțin o poză.");
      return;
    }
    if (limitReached) {
      setError(
        `Ai folosit toate cele ${shotLimit} cadre alocate pe acest dispozitiv.`,
      );
      return;
    }
    // Cap the batch by remaining shots so the user doesn't waste a
    // long upload that the server will reject halfway through.
    const batch =
      remainingShots !== null && files.length > remainingShots
        ? files.slice(0, remainingShots)
        : files;
    setUploading(true);
    const newPhotos: Photo[] = [];
    try {
      for (const original of batch) {
        // When the owner enabled vintage on the film, replace the raw
        // photo with a filtered version client-side. The server upload
        // pipeline doesn't change — it just receives a different blob.
        const file =
          vintage && original.type.startsWith("image/")
            ? await applyVintage(original).catch(() => original)
            : original;
        const fd = new FormData();
        fd.append("file", file);
        fd.append("folder", `moments/${slug}`);
        const upRes = await fetch("/api/upload", { method: "POST", body: fd });
        if (!upRes.ok) {
          const j = await upRes.json().catch(() => ({}));
          throw new Error(j.error || "Upload eșuat");
        }
        const { url } = await upRes.json();

        const saveRes = await fetch(`/api/moments/${slug}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            guestName: guestName.trim(),
            guestMessage: guestMessage.trim() || undefined,
            deviceId,
            // When the film runs in prompts mode, every upload is
            // tagged with the prompt currently shown to the guest so
            // the owner can later see who answered what.
            prompt: currentPrompt ?? undefined,
            // Phase 5/C3 — table label sourced from the QR query
            // param so the owner sees per-table breakdowns.
            tableLabel: tableLabel ?? undefined,
          }),
        });
        if (!saveRes.ok) {
          const j = await saveRes.json().catch(() => ({}));
          throw new Error(j.error || "Salvare eșuată");
        }
        const { id } = await saveRes.json();
        newPhotos.push({
          id,
          url,
          guestName: guestName.trim(),
          guestMessage: guestMessage.trim() || null,
        });
      }
      // Optimistically show the newly added photos (they only render
      // pre-reveal if we're past reveal time). The next poll will sync
      // counters from the server.
      setState((s) => ({
        ...s,
        photos: s.revealed ? [...newPhotos, ...s.photos] : s.photos,
        totalPhotos: s.totalPhotos + newPhotos.length,
        deviceUsed:
          typeof s.deviceUsed === "number"
            ? s.deviceUsed + newPhotos.length
            : s.deviceUsed,
        // Mark the current prompt as completed so the walker advances
        // immediately, before the next 12s poll catches up.
        promptsDone:
          currentPrompt && !s.promptsDone.includes(currentPrompt)
            ? [...s.promptsDone, currentPrompt]
            : s.promptsDone,
      }));
      setFiles([]);
      setGuestMessage("");
      setDone(true);
      setTimeout(() => setDone(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare");
    } finally {
      setUploading(false);
    }
  }

  const windowClosed = state.uploadState === "after";
  const windowPending = state.uploadState === "before";

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <header className="text-center">
        <p className="text-sm uppercase tracking-[3px] text-gold">Moments</p>
        <h1 className="mt-1 font-heading text-2xl font-bold md:text-3xl">
          {title}
        </h1>
        {eventDate && (
          <p className="mt-1 text-sm text-muted-foreground">
            {new Date(eventDate).toLocaleDateString("ro-RO", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        )}
        <p className="mt-3 text-sm text-muted-foreground">
          Împărtășește momentele tale.{" "}
          {state.revealed
            ? "Pozele apar live în galerie."
            : "Galeria se deschide la finalul evenimentului."}
        </p>
        {vintage && (
          <p className="mt-2 inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[11px] font-medium text-gold">
            <Sparkles className="h-3 w-3" /> Filtru polaroid activ — pozele
            tale primesc automat un ton vintage cald
          </p>
        )}
        {tableLabel && (
          <p className="mt-2 inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/15 px-3 py-1 text-[11px] font-medium text-gold">
            🪑 {tableLabel}
          </p>
        )}
      </header>

      {/* Window state banners — shown above the form so the gating is
          obvious without scrolling. */}
      {windowPending && openAt && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-gold/30 bg-gold/5 p-4">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
          <div className="min-w-0">
            <p className="font-medium">Filmul se deschide în {formatCountdown(opensIn)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Te așteptăm{" "}
              {new Date(openAt).toLocaleString("ro-RO", {
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              — atunci poți începe să încarci poze.
            </p>
          </div>
        </div>
      )}
      {windowClosed && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-border/40 bg-card p-4">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="font-medium">Filmul s-a închis</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Mulțumim pentru participare! Pozele tale sunt în galerie.
            </p>
          </div>
        </div>
      )}

      {/* Phase 4A — current prompt card. Sits above the form so the
          guest sees the "mission" before they tap the camera. */}
      {!windowClosed && !windowPending && promptsTotal > 0 && (
        <div className="mt-6 rounded-2xl border border-gold/40 bg-gold/5 p-4">
          {allPromptsDone ? (
            <div className="flex items-start gap-3 text-center sm:text-left">
              <Trophy className="mt-0.5 h-6 w-6 shrink-0 text-gold" />
              <div className="min-w-0 flex-1">
                <p className="font-heading text-lg font-bold">
                  Toate misiunile completate! 🎉
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Mulțumim — ai răspuns la toate {promptsTotal} provocările!
                  Mai poți încărca poze libere mai jos.
                </p>
              </div>
            </div>
          ) : currentPrompt ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-gold">
                  Provocare {promptsCompleted + 1}/{promptsTotal}
                </p>
                <div className="flex h-1.5 w-24 overflow-hidden rounded-full bg-gold/20">
                  <div
                    className="bg-gold transition-all"
                    style={{
                      width: `${Math.min(100, (promptsCompleted / promptsTotal) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <p className="mt-2 font-heading text-xl font-bold leading-tight">
                {currentPrompt}
              </p>
              <button
                type="button"
                onClick={() => setSkipped((prev) => [...prev, currentPrompt])}
                className="mt-3 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-gold"
              >
                <SkipForward className="h-3 w-3" /> Sari peste această
                provocare
              </button>
            </>
          ) : null}
        </div>
      )}

      {/* Upload form — hidden when the window is closed or pending. */}
      {!windowClosed && !windowPending && (
        <form
          onSubmit={handleSubmit}
          className="mt-6 rounded-2xl border border-border/40 bg-card p-5"
        >
          {/* Shot counter banner — only when a limit is set. */}
          {typeof shotLimit === "number" && (
            <div
              className={`mb-4 flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs ${
                limitReached
                  ? "bg-destructive/10 text-destructive"
                  : "bg-gold/10 text-gold"
              }`}
            >
              <span className="font-medium">
                {limitReached
                  ? "Toate cadrele tale au fost folosite"
                  : `Ai ${remainingShots} ${
                      remainingShots === 1 ? "cadru" : "cadre"
                    } rămase`}
              </span>
              <span className="text-[11px] opacity-75">
                {state.deviceUsed ?? 0}/{shotLimit}
              </span>
            </div>
          )}

          <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Numele tău
          </label>
          <input
            type="text"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Ion Popescu"
            className="mt-1 w-full rounded-lg border border-border/40 bg-background px-3 py-2.5 text-sm focus:border-gold focus:outline-none"
            required
            disabled={limitReached}
          />

          <label className="mt-4 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Mesaj (opțional)
          </label>
          <textarea
            value={guestMessage}
            onChange={(e) => setGuestMessage(e.target.value)}
            placeholder="Ce nuntă frumoasă! 💍"
            rows={2}
            className="mt-1 w-full rounded-lg border border-border/40 bg-background px-3 py-2.5 text-sm focus:border-gold focus:outline-none"
            disabled={limitReached}
          />

          <label
            htmlFor="moments-file"
            className={`mt-5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center ${
              limitReached
                ? "border-muted/40 bg-muted/20 opacity-50 cursor-not-allowed"
                : "border-gold/40 bg-gold/5 hover:bg-gold/10"
            }`}
          >
            <Camera className="h-10 w-10 text-gold" />
            <span className="font-medium">
              {files.length > 0
                ? `${files.length} poze selectate`
                : "Atinge pentru a alege poze"}
            </span>
            <span className="text-xs text-muted-foreground">
              JPG, PNG, WEBP · max 10MB per poză
            </span>
          </label>
          <input
            id="moments-file"
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            onChange={(e) =>
              setFiles(e.target.files ? Array.from(e.target.files) : [])
            }
            className="hidden"
            disabled={limitReached}
          />

          {error && (
            <p className="mt-3 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={
              uploading || files.length === 0 || !guestName.trim() || limitReached
            }
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-gold px-4 py-3 text-sm font-medium text-[#0D0D0D] hover:bg-gold-dark disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Se încarcă...
              </>
            ) : done ? (
              <>
                <Check className="h-4 w-4" /> Mulțumim!
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" /> Trimite poze
              </>
            )}
          </button>

          {/* Soft reminder of when uploads close, when set. Helps guests
              decide whether to wait or upload now. */}
          {closeAt && (
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Filmul se închide în {formatCountdown(closesIn)}
            </p>
          )}
        </form>
      )}

      {/* Gallery section. Three flavours:
            - reveal in future → "se deschide pe X" + photo counter
            - reveal passed & gallery has photos → grid
            - reveal passed & still empty → silent (form covers the UX) */}
      {!state.revealed && (
        <section className="mt-8 rounded-2xl border border-border/40 bg-card p-5 text-center">
          <Eye className="mx-auto h-8 w-8 text-gold/70" />
          <p className="mt-3 font-medium">
            Galeria se deschide{" "}
            {revealAt
              ? `în ${formatCountdown(revealsIn)}`
              : "la finalul evenimentului"}
          </p>
          {revealAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              {new Date(revealAt).toLocaleString("ro-RO", {
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            {state.totalPhotos > 0
              ? `${state.totalPhotos} ${
                  state.totalPhotos === 1 ? "cadru a fost încărcat" : "cadre au fost încărcate"
                } până acum. Toți le vom vedea împreună la dezvăluire.`
              : "Fii primul care încarcă o amintire — totul rămâne ascuns până la dezvăluire."}
          </p>
        </section>
      )}

      {state.revealed && state.photos.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <ImageIcon className="h-4 w-4 text-gold" />
            Galerie live ({state.totalPhotos})
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {state.photos.map((p) => {
              const mine = new Set(p.myReactions ?? []);
              return (
                <figure
                  key={p.id}
                  className="overflow-hidden rounded-lg border border-border/40 bg-card/40"
                >
                  { }
                  <img
                    src={p.url}
                    alt={p.guestName ?? "Event photo"}
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                  />
                  {p.prompt && (
                    <p className="px-2 pt-1.5 text-[10px] font-medium uppercase tracking-wider text-gold/80">
                      {p.prompt}
                    </p>
                  )}
                  <figcaption className="flex flex-wrap items-center gap-1 px-1.5 py-1.5">
                    {REACTION_EMOJI.map((emoji) => {
                      const count = p.reactions?.[emoji] ?? 0;
                      const active = mine.has(emoji);
                      return (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => void toggleReaction(p.id, emoji)}
                          className={`flex h-7 min-w-[34px] items-center justify-center gap-0.5 rounded-full px-1.5 text-[12px] transition-colors ${
                            active
                              ? "bg-gold/20 ring-1 ring-gold/50"
                              : "bg-muted hover:bg-muted/80"
                          }`}
                          aria-label={`${active ? "Retrage" : "Adaugă"} reacția ${emoji}`}
                        >
                          <span className="leading-none">{emoji}</span>
                          {count > 0 && (
                            <span className="text-[10px] font-medium text-muted-foreground">
                              {count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
