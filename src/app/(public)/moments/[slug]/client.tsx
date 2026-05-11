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
import { Camera, Upload, Check, Loader2, Image as ImageIcon, Lock, Clock, Eye } from "lucide-react";

interface Photo {
  id: number;
  url: string;
  guestName: string | null;
  guestMessage: string | null;
}

interface Props {
  slug: string;
  title: string;
  eventDate: string | null;
  openAt: string | null;
  closeAt: string | null;
  revealAt: string | null;
  shotLimit: number | null;
}

type UploadState = "before" | "open" | "after";

interface MomentsState {
  photos: Photo[];
  totalPhotos: number;
  deviceUsed: number | null;
  uploadState: UploadState;
  revealed: boolean;
}

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
}: Props) {
  const deviceId = useMemo(() => getOrCreateDeviceId(slug), [slug]);

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
  });
  const [now, setNow] = useState(() => Date.now());

  const [guestName, setGuestName] = useState("");
  const [guestMessage, setGuestMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      for (const file of batch) {
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
          <div className="grid grid-cols-3 gap-2">
            {state.photos.map((p) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={p.id}
                src={p.url}
                alt={p.guestName ?? "Event photo"}
                loading="lazy"
                className="aspect-square w-full rounded-lg object-cover"
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
