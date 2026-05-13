"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Camera,
  Copy,
  ExternalLink,
  Loader2,
  QrCode,
  Monitor,
  Power,
  Trash2,
  ArrowLeft,
  Settings,
  Save,
  LayoutGrid,
  Download,
  Sparkles,
  ListChecks,
  ShieldCheck,
  Star,
  CheckCircle,
  XCircle,
  Users,
  Award,
  Clock,
  Music,
  Mail,
  Film,
} from "lucide-react";
import { toast } from "sonner";

interface Photo {
  id: number;
  url: string;
  guestName: string | null;
  guestMessage: string | null;
  caption?: string | null;
  prompt?: string | null;
  tableLabel?: string | null;
  category?: string | null;
  isApproved?: boolean;
  isFavorite?: boolean;
  deviceId?: string | null;
  createdAt: string;
}

/** Convert ISO string ↔ <input type="datetime-local"> value.
 *  The input wants "YYYY-MM-DDTHH:mm" in *local* time; we want UTC ISO
 *  on the wire. Going through Date handles the offset correctly. */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export function MomentsOwnerClient({ planId }: { planId: number }) {
  const [slug, setSlug] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [origin, setOrigin] = useState("");

  // Phase 1 settings — local mirror of the server state so the form
  // can stay editable while we PATCH on save. Empty string = "unset"
  // (will be sent as null).
  const [openAtInput, setOpenAtInput] = useState("");
  const [closeAtInput, setCloseAtInput] = useState("");
  const [revealAtInput, setRevealAtInput] = useState("");
  const [shotLimitInput, setShotLimitInput] = useState<string>("");
  const [vintageInput, setVintageInput] = useState(false);
  /** Phase 4A — prompts edited as a single multi-line string for the
   *  textarea. We split on newline when saving so the owner can
   *  paste a list straight in. */
  const [promptsInput, setPromptsInput] = useState("");
  /** Phase 4B — when true, guest uploads land hidden until the owner
   *  approves them. */
  const [requireApprovalInput, setRequireApprovalInput] = useState(false);
  /** Phase 5/C1 — direct audio URL the slideshow loops. */
  const [musicUrlInput, setMusicUrlInput] = useState("");
  /** Phase 5/C3 — comma- or newline-separated table labels. We split
   *  on whichever the owner used so paste-from-spreadsheet works
   *  unchanged. */
  const [tablesInput, setTablesInput] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [downloading, setDownloading] = useState(false);
  /** Phase 4B — current grid filter: all / pending / favorites. */
  const [photoFilter, setPhotoFilter] = useState<"all" | "pending" | "favorites">(
    "all",
  );
  /** Phase 5/E1 — categorization in progress. */
  const [categorizing, setCategorizing] = useState(false);
  /** Phase 5/D3 — email recap send-in-progress. */
  const [sendingRecap, setSendingRecap] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
    void load();
    const id = setInterval(() => void refreshPhotos(), 15_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  async function load() {
    setLoading(true);
    try {
      const [statusRes, photosRes] = await Promise.all([
        fetch(`/api/event-plans/${planId}/moments`),
        fetch(`/api/event-plans/${planId}/photos`),
      ]);
      if (statusRes.ok) {
        const j = await statusRes.json();
        setSlug(j.slug);
        setEnabled(j.enabled);
        // Mirror window/reveal/limit settings into the form. Owner can
        // tweak them once the gallery is enabled.
        setOpenAtInput(isoToLocalInput(j.openAt));
        setCloseAtInput(isoToLocalInput(j.closeAt));
        setRevealAtInput(isoToLocalInput(j.revealAt));
        setShotLimitInput(
          typeof j.shotLimit === "number" && j.shotLimit > 0
            ? String(j.shotLimit)
            : "",
        );
        setVintageInput(Boolean(j.vintage));
        setPromptsInput(
          Array.isArray(j.prompts) && j.prompts.length > 0
            ? (j.prompts as string[]).join("\n")
            : "",
        );
        setRequireApprovalInput(Boolean(j.requireApproval));
        setMusicUrlInput(typeof j.musicUrl === "string" ? j.musicUrl : "");
        setTablesInput(
          Array.isArray(j.tables) && j.tables.length > 0
            ? (j.tables as string[]).join("\n")
            : "",
        );
      }
      if (photosRes.ok) {
        const j = await photosRes.json();
        setPhotos(j.photos ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function refreshPhotos() {
    const res = await fetch(`/api/event-plans/${planId}/photos`);
    if (res.ok) {
      const j = await res.json();
      setPhotos(j.photos ?? []);
    }
  }

  async function enable() {
    setSaving(true);
    const res = await fetch(`/api/event-plans/${planId}/moments`, {
      method: "POST",
    });
    if (res.ok) {
      const j = await res.json();
      setSlug(j.slug);
      setEnabled(true);
      toast.success("Galeria e activă!");
    }
    setSaving(false);
  }

  async function disable() {
    if (!confirm("Sigur dezactivezi galeria? Link-ul nu va mai funcționa.")) {
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/event-plans/${planId}/moments`, {
      method: "DELETE",
    });
    if (res.ok) {
      setEnabled(false);
      toast.success("Galerie dezactivată");
    }
    setSaving(false);
  }

  async function saveSettings() {
    const limit = shotLimitInput.trim();
    const limitNumber = limit ? Number(limit) : null;
    if (limit && (!Number.isFinite(limitNumber) || limitNumber! < 1 || limitNumber! > 500)) {
      toast.error("Limita de cadre trebuie să fie între 1 și 500.");
      return;
    }
    setSavingSettings(true);
    try {
      const cleanedPrompts = promptsInput
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .slice(0, 50);
      const res = await fetch(`/api/event-plans/${planId}/moments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openAt: localInputToIso(openAtInput),
          closeAt: localInputToIso(closeAtInput),
          revealAt: localInputToIso(revealAtInput),
          shotLimit: limitNumber,
          vintage: vintageInput,
          prompts: cleanedPrompts,
          requireApproval: requireApprovalInput,
          musicUrl: musicUrlInput.trim() || null,
          tables: tablesInput
            .split(/[\r\n,]+/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
            .slice(0, 40),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Salvare eșuată");
      }
      toast.success("Setări salvate!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eroare la salvare");
    } finally {
      setSavingSettings(false);
    }
  }

  /** Phase 4B helpers. Each writes through the existing
   *  /api/event-plans/[id]/photos/[photoId] PATCH so the dashboard
   *  doesn't need a new endpoint. */
  async function patchPhoto(photoId: number, patch: Partial<Photo>) {
    // Optimistic: flip immediately, reconcile from the response.
    setPhotos((prev) =>
      prev.map((p) => (p.id === photoId ? { ...p, ...patch } : p)),
    );
    try {
      const res = await fetch(
        `/api/event-plans/${planId}/photos/${photoId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Acțiune eșuată — încerc din nou");
      void refreshPhotos();
    }
  }
  function toggleApprove(photo: Photo) {
    void patchPhoto(photo.id, { isApproved: !photo.isApproved });
  }
  function toggleFavorite(photo: Photo) {
    void patchPhoto(photo.id, { isFavorite: !photo.isFavorite });
  }
  async function generateCaption(photo: Photo) {
    // Optimistic placeholder while Claude is thinking.
    setPhotos((prev) =>
      prev.map((p) =>
        p.id === photo.id ? { ...p, caption: "Generez caption..." } : p,
      ),
    );
    try {
      const res = await fetch(
        `/api/event-plans/${planId}/photos/${photo.id}/caption`,
        { method: "POST" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Eroare AI");
      }
      const { caption } = await res.json();
      setPhotos((prev) =>
        prev.map((p) => (p.id === photo.id ? { ...p, caption } : p)),
      );
      toast.success("Caption generat!");
    } catch (err) {
      // Revert the placeholder.
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photo.id
            ? { ...p, caption: photo.caption ?? null }
            : p,
        ),
      );
      toast.error(err instanceof Error ? err.message : "AI indisponibil");
    }
  }

  /** Phase 5/E2 — Best-of selector. Pure client-side heuristic that
   *  scores every photo on the dashboard and stars the top 20% as
   *  favorites. We don't burn an AI call here because the existing
   *  signals (reactions, captions, guest messages, prompt answers)
   *  already encode what people loved about the photo — a vision
   *  model would add ~$2 of token cost per typical wedding for a
   *  marginal improvement on top of these. Future work: add a
   *  Claude-vision rerank for ties. */
  async function sendRecap() {
    setSendingRecap(true);
    try {
      const res = await fetch(`/api/event-plans/${planId}/moments/recap`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Nu s-a putut trimite");
      toast.success(`Recap trimis la ${body.to} (${body.photoCount} cadre)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eroare email");
    } finally {
      setSendingRecap(false);
    }
  }

  async function categorizePhotos() {
    setCategorizing(true);
    try {
      const res = await fetch(
        `/api/event-plans/${planId}/photos/categorize`,
        { method: "POST" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || "AI indisponibil");
      }
      const tally = body.tally as Record<string, number> | undefined;
      const summary = tally
        ? Object.entries(tally)
            .filter(([, n]) => n > 0)
            .map(([k, n]) => `${n} ${k}`)
            .join(" · ")
        : "";
      toast.success(
        `${body.processed} categorize${summary ? " — " + summary : ""}${
          body.remaining ? ` · mai sunt ${body.remaining}` : ""
        }`,
      );
      await refreshPhotos();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eroare AI");
    } finally {
      setCategorizing(false);
    }
  }

  async function autoFavoriteBestOf() {
    if (photos.length === 0) {
      toast.error("Nu există poze de evaluat încă.");
      return;
    }
    type Scored = { id: number; score: number };
    const scored: Scored[] = photos.map((p) => {
      // Heuristics — tunable, deliberately favoring photos with
      // explicit guest investment over recency or upload order.
      let score = 0;
      // Reactions don't surface on the owner-side photos response yet,
      // so we approximate "interesting" with caption/message/prompt.
      if (p.caption) score += 3;
      if (p.guestMessage) score += 2;
      if (p.prompt) score += 2;
      if (p.guestName && p.guestName.trim().length > 0) score += 1;
      if (p.isFavorite) score += 5; // keep already-favorite ones
      return { id: p.id, score };
    });
    scored.sort((a, b) => b.score - a.score);
    // Top 20%, but at least 3 and at most 30 so tiny galleries still
    // get a meaningful pick and big ones don't bury the owner.
    const target = Math.max(3, Math.min(30, Math.ceil(photos.length * 0.2)));
    const winners = new Set(scored.slice(0, target).map((s) => s.id));
    // Apply optimistically.
    setPhotos((prev) =>
      prev.map((p) => ({ ...p, isFavorite: winners.has(p.id) || p.isFavorite })),
    );
    // PATCH only the ones that are flipping ON — don't unstar existing
    // favorites so manual choices survive.
    const toFlip = photos.filter(
      (p) => winners.has(p.id) && p.isFavorite !== true,
    );
    try {
      await Promise.all(
        toFlip.map((p) =>
          fetch(`/api/event-plans/${planId}/photos/${p.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isFavorite: true }),
          }),
        ),
      );
      toast.success(
        `${toFlip.length} cadre marcate ca favorite (top ${target}).`,
      );
    } catch {
      toast.error("Selecția nu s-a salvat complet — reîncarcă lista");
      void refreshPhotos();
    }
  }

  async function rejectPhoto(photo: Photo) {
    if (!confirm("Ștergi această poză? Nu mai apare nici în galerie, nici în ZIP.")) {
      return;
    }
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    try {
      await fetch(`/api/event-plans/${planId}/photos/${photo.id}`, {
        method: "DELETE",
      });
      toast.success("Poză ștearsă");
    } catch {
      toast.error("Ștergere eșuată");
      void refreshPhotos();
    }
  }

  async function downloadAll() {
    setDownloading(true);
    try {
      // Use a temporary <a download> with the streamed ZIP URL —
      // browser handles the file-save dialog. We attach the URL only
      // after the click so the response headers (Content-Disposition)
      // drive the filename.
      const a = document.createElement("a");
      a.href = `/api/event-plans/${planId}/moments/download`;
      a.rel = "noopener";
      // Hint a filename in case headers are stripped by a proxy. The
      // server's Content-Disposition takes precedence when present.
      a.download = "photo-moments.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success("Descărcare începută — vezi bara browserului.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eroare la descărcare");
    } finally {
      setDownloading(false);
    }
  }

  const publicUrl = slug && origin ? `${origin}/moments/${slug}` : "";
  const slideshowUrl =
    slug && origin ? `${origin}/moments/${slug}/slideshow` : "";

  // Use a free QR service so we don't need to ship a QR lib client-side.
  const qrUrl = publicUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=10&data=${encodeURIComponent(publicUrl)}`
    : "";

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center lg:px-8">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 lg:px-8">
      <Link
        href="/cabinet"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-gold"
      >
        <ArrowLeft className="h-3 w-3" /> Înapoi
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[3px] text-gold">
            Event Moments
          </p>
          <h1 className="font-heading text-2xl font-bold md:text-3xl">
            Galerie live cu QR code
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Invitații scanează QR-ul și uploadează poze instant. Fără cont,
            fără aplicație.
          </p>
        </div>
      </div>

      {!enabled ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border/40 p-12 text-center">
          <Camera className="mx-auto h-12 w-12 text-gold" />
          <h2 className="mt-4 font-heading text-xl font-bold">
            Activează galeria
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Primești un QR code unic și un link pe care îl pui pe mese sau îl
            afișezi pe proiector.
          </p>
          <button
            onClick={enable}
            disabled={saving}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-gold px-5 py-2.5 text-sm font-medium text-[#0D0D0D] hover:bg-gold-dark disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Power className="h-4 w-4" />
            )}
            Activează acum
          </button>
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-border/40 bg-card p-5">
              <div className="flex items-center gap-2 text-sm font-medium">
                <QrCode className="h-4 w-4 text-gold" /> QR code pentru invitați
              </div>
              {qrUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={qrUrl}
                  alt="QR code"
                  className="mx-auto mt-4 rounded-lg border border-border/40 bg-white p-2"
                  width={280}
                  height={280}
                />
              )}
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Tipărește și pune pe mese la eveniment
              </p>
              {/* Phase 5/C2 — branded printable card. The QR alone is
                  ugly on a wedding table; the card page wraps it in a
                  template with event name + date + decoration. */}
              <Link
                href={`/cabinet/moments/${planId}/qr-card`}
                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-gold/40 px-3 py-2 text-xs font-medium text-gold hover:bg-gold/10"
              >
                <QrCode className="h-3.5 w-3.5" /> Card tipăribil cu QR
              </Link>
              {/* Phase 5/C3 — per-table QR sheet. Only shown when the
                  owner declared a table list, otherwise the page would
                  show an "add some tables first" empty state. */}
              <Link
                href={`/cabinet/moments/${planId}/qr-tables`}
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-gold/40 px-3 py-2 text-xs font-medium text-gold hover:bg-gold/10"
              >
                <Users className="h-3.5 w-3.5" /> Carduri QR per masă
              </Link>
              {/* Phase 5/D2 — HTML5 highlight reel (in lieu of MP4
                  export which would need ffmpeg). Opens a full-screen
                  Ken Burns auto-player; owner screen-records if they
                  want a shareable clip. */}
              <Link
                href={`/cabinet/moments/${planId}/reel`}
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-gold/40 px-3 py-2 text-xs font-medium text-gold hover:bg-gold/10"
              >
                <Film className="h-3.5 w-3.5" /> Highlight reel (proiectat)
              </Link>
              {/* Phase 5/D3 — email recap. Sends a stats + thumbnails
                  email to the owner's account email. */}
              <button
                type="button"
                onClick={() => void sendRecap()}
                disabled={sendingRecap}
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-gold/40 px-3 py-2 text-xs font-medium text-gold hover:bg-gold/10 disabled:opacity-50"
              >
                {sendingRecap ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Mail className="h-3.5 w-3.5" />
                )}
                Trimite recap pe email
              </button>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-border/40 bg-card p-5">
                <div className="text-sm font-medium">Link pentru invitați</div>
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-muted p-2 text-xs">
                  <input
                    type="text"
                    value={publicUrl}
                    readOnly
                    className="flex-1 bg-transparent outline-none"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(publicUrl);
                      toast.success("Copiat");
                    }}
                    className="rounded p-1 hover:bg-background"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
                <Link
                  href={publicUrl}
                  target="_blank"
                  rel="noopener"
                  className="mt-3 inline-flex items-center gap-1 text-xs text-gold hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> Vizualizează pagina
                </Link>
              </div>

              <div className="rounded-2xl border border-border/40 bg-card p-5">
                <div className="text-sm font-medium">Slideshow proiector</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Deschide pe laptopul conectat la proiector pentru afișare
                  fullscreen.
                </p>
                <Link
                  href={slideshowUrl}
                  target="_blank"
                  rel="noopener"
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-gold px-3 py-2 text-xs font-medium text-[#0D0D0D] hover:bg-gold-dark"
                >
                  <Monitor className="h-3.5 w-3.5" /> Deschide slideshow
                </Link>
              </div>

              {/* Phase 2 — printable collage entry point. Lives next to
                  the slideshow card so the owner sees both projector
                  outputs at a glance. */}
              <div className="rounded-2xl border border-gold/30 bg-gold/5 p-5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <LayoutGrid className="h-4 w-4 text-gold" /> Colaj tipăribil
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Combină toate pozele într-un poster A4 — grid clasic,
                  perete polaroid sau magazine. Salvează ca PDF din
                  dialogul de tipărire.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/cabinet/moments/${planId}/colaj`}
                    className="inline-flex items-center gap-2 rounded-lg bg-gold px-3 py-2 text-xs font-medium text-[#0D0D0D] hover:bg-gold-dark"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" /> Colaj poster
                  </Link>
                  {/* Phase 5/D1 — multi-page PDF album. Same poster
                      muscle, just paginated with cover + thanks. */}
                  <Link
                    href={`/cabinet/moments/${planId}/album`}
                    className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-transparent px-3 py-2 text-xs font-medium text-gold hover:bg-gold/10"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" /> Album multi-pagină
                  </Link>
                </div>
              </div>

              <button
                onClick={disable}
                disabled={saving}
                className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
              >
                <Trash2 className="h-3 w-3" /> Dezactivează galeria
              </button>
            </div>
          </div>

          {/* Phase 1 — once.film-style mechanics. Window/reveal/limit
              are all optional; leaving everything empty restores the
              pre-Phase-1 "everything live, no limit" behavior. */}
          <section className="mt-10 rounded-2xl border border-border/40 bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Settings className="h-4 w-4 text-gold" /> Setări Photo Moments
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Toate setările sunt opționale. Goale = comportament implicit
              (galeria e mereu deschisă, pozele apar instant, fără limită
              de cadre).
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Deschide uploadul la
                </label>
                <input
                  type="datetime-local"
                  value={openAtInput}
                  onChange={(e) => setOpenAtInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm focus:border-gold focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Înainte de această oră, invitații văd un countdown.
                </p>
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Închide uploadul la
                </label>
                <input
                  type="datetime-local"
                  value={closeAtInput}
                  onChange={(e) => setCloseAtInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm focus:border-gold focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  După această oră, nu se mai pot încărca poze noi.
                </p>
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Dezvăluie galeria la
                </label>
                <input
                  type="datetime-local"
                  value={revealAtInput}
                  onChange={(e) => setRevealAtInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm focus:border-gold focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Pozele rămân ascunse pentru invitați până la această oră
                  — surpriza la finalul evenimentului.
                </p>
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Cadre per invitat
                </label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={shotLimitInput}
                  onChange={(e) => setShotLimitInput(e.target.value)}
                  placeholder="ex: 20"
                  className="mt-1 w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm focus:border-gold focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Limita per dispozitiv. Stimulează intenția (ca aparatul
                  foto de unică folosință).
                </p>
              </div>
            </div>

            {/* Vintage filter — its own row so the explainer can be
                wider than the 2-col grid above. */}
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-border/40 bg-background/40 p-3">
              <input
                type="checkbox"
                checked={vintageInput}
                onChange={(e) => setVintageInput(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-gold"
              />
              <span className="min-w-0 text-sm">
                <span className="flex items-center gap-1.5 font-medium">
                  <Sparkles className="h-3.5 w-3.5 text-gold" />
                  Filtru polaroid pe upload
                </span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  Aplică automat un ton vintage cald + ramă albă pe fiecare
                  poză trimisă de invitați. Efectul se face în browserul lor
                  — serverul nu primește niciodată fotografia originală.
                </span>
              </span>
            </label>

            {/* Phase 4B — moderation queue toggle. Sits between
                vintage (Phase 3) and prompts (Phase 4A) so the
                settings card flows visual → flow → content. */}
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-border/40 bg-background/40 p-3">
              <input
                type="checkbox"
                checked={requireApprovalInput}
                onChange={(e) => setRequireApprovalInput(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-gold"
              />
              <span className="min-w-0 text-sm">
                <span className="flex items-center gap-1.5 font-medium">
                  <ShieldCheck className="h-3.5 w-3.5 text-gold" />
                  Moderare înainte de publicare
                </span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  Pozele invitaților rămân ascunse până le aprobi din tab-ul
                  „În așteptare" — util pentru evenimente corporate sau
                  familii cu copii mici. Implicit dezactivat (publicare
                  imediată).
                </span>
              </span>
            </label>

            {/* Phase 5/C1 — slideshow background music URL. Direct
                MP3/WAV/M4A/OGG only; YouTube/Spotify don't embed as
                <audio> without a special player. */}
            <div className="mt-4 rounded-xl border border-border/40 bg-background/40 p-3">
              <label className="flex items-center gap-1.5 text-sm font-medium">
                <Music className="h-3.5 w-3.5 text-gold" />
                Muzică pentru slideshow (opțional)
              </label>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Link direct la un fișier audio (MP3/WAV/M4A). Slideshow-ul
                pe proiector îl reproduce în buclă. Lasă gol pentru
                slideshow silențios.
              </p>
              <input
                type="url"
                value={musicUrlInput}
                onChange={(e) => setMusicUrlInput(e.target.value)}
                placeholder="https://exemplu.com/melodie.mp3"
                className="mt-2 w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm focus:border-gold focus:outline-none"
              />
            </div>

            {/* Phase 4A — shot prompts. One per line. Empty = free-form
                mode (legacy behavior). */}
            <div className="mt-4 rounded-xl border border-border/40 bg-background/40 p-3">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <ListChecks className="h-3.5 w-3.5 text-gold" />
                Provocări foto (opțional)
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                O „misiune" pe linie. Invitații văd una pe rând cu progres
                — „Provocare 3/10". Lasă gol pentru încărcare liberă.
              </p>
              <textarea
                value={promptsInput}
                onChange={(e) => setPromptsInput(e.target.value)}
                rows={5}
                placeholder={"Foto cu mireasa\nSelfie cu nașii\nFoto cu tortul\nFoto de pe ringul de dans\nCadru cu părinții"}
                className="mt-2 w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm focus:border-gold focus:outline-none"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Maxim 50 de provocări, fiecare până la 80 de caractere.
              </p>
            </div>

            {/* Phase 5/C3 — table labels for per-table QR rolls. */}
            <div className="mt-4 rounded-xl border border-border/40 bg-background/40 p-3">
              <label className="flex items-center gap-1.5 text-sm font-medium">
                <Users className="h-3.5 w-3.5 text-gold" />
                Mese / locații (opțional)
              </label>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Câte un nume pe linie. Pagina „Carduri QR per masă" îți
                generează un cod separat pentru fiecare — pe dashboard
                vezi cine a încărcat de la fiecare masă.
              </p>
              <textarea
                value={tablesInput}
                onChange={(e) => setTablesInput(e.target.value)}
                rows={4}
                placeholder={"Masa 1\nMasa 2\nMasa 3\nBar"}
                className="mt-2 w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm focus:border-gold focus:outline-none"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Maxim 40 de mese, fiecare până la 40 de caractere.
              </p>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => void saveSettings()}
                disabled={savingSettings}
                className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-medium text-[#0D0D0D] hover:bg-gold-dark disabled:opacity-50"
              >
                {savingSettings ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Salvează setările
              </button>
            </div>
          </section>

          {/* Phase 4B — at-a-glance insights derived from the photo
              list. Pure client-side aggregation — no extra round
              trips. */}
          {(() => {
            if (photos.length === 0) return null;
            // Top contributor by guestName fallback to deviceId.
            const byContributor = new Map<string, number>();
            const byHour = new Map<number, number>();
            const devices = new Set<string>();
            let favCount = 0;
            let pendingCount = 0;
            for (const p of photos) {
              const key = p.guestName?.trim() || p.deviceId || "necunoscut";
              byContributor.set(key, (byContributor.get(key) ?? 0) + 1);
              if (p.deviceId) devices.add(p.deviceId);
              if (p.isFavorite) favCount++;
              if (p.isApproved === false) pendingCount++;
              const h = new Date(p.createdAt).getHours();
              byHour.set(h, (byHour.get(h) ?? 0) + 1);
            }
            const top = [...byContributor.entries()].sort((a, b) => b[1] - a[1])[0];
            const peak = [...byHour.entries()].sort((a, b) => b[1] - a[1])[0];
            return (
              <section className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-border/40 bg-card p-4">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Total cadre
                  </p>
                  <p className="mt-1 font-heading text-2xl font-bold">
                    {photos.length}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {pendingCount > 0 && (
                      <>
                        <span className="font-medium text-amber-500">
                          {pendingCount} în așteptare
                        </span>
                        <span> · </span>
                      </>
                    )}
                    {favCount} ⭐ favorite
                  </p>
                </div>
                <div className="rounded-2xl border border-border/40 bg-card p-4">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    <Users className="-mt-0.5 mr-1 inline h-3 w-3" />
                    Dispozitive
                  </p>
                  <p className="mt-1 font-heading text-2xl font-bold">
                    {devices.size}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Invitați diferiți care au încărcat
                  </p>
                </div>
                <div className="rounded-2xl border border-border/40 bg-card p-4">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    <Award className="-mt-0.5 mr-1 inline h-3 w-3" />
                    Top contributor
                  </p>
                  <p className="mt-1 truncate font-heading text-lg font-bold">
                    {top ? top[0] : "—"}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {top ? `${top[1]} cadre încărcate` : "Nicio activitate"}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/40 bg-card p-4">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    <Clock className="-mt-0.5 mr-1 inline h-3 w-3" />
                    Oră de vârf
                  </p>
                  <p className="mt-1 font-heading text-2xl font-bold">
                    {peak ? `${String(peak[0]).padStart(2, "0")}:00` : "—"}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {peak ? `${peak[1]} cadre în acea oră` : "—"}
                  </p>
                </div>
              </section>
            );
          })()}

          <section className="mt-10">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-heading text-lg font-bold">
                Poze primite ({photos.length})
              </h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => void categorizePhotos()}
                  disabled={categorizing || photos.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gold/40 px-3 py-1.5 text-xs font-medium text-gold hover:bg-gold/10 disabled:opacity-50"
                  title="Claude clasifică fiecare poză (ceremonie / dans / grup / portret / ...)"
                >
                  {categorizing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  Categorize AI
                </button>
                <button
                  onClick={() => void autoFavoriteBestOf()}
                  disabled={photos.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gold/40 px-3 py-1.5 text-xs font-medium text-gold hover:bg-gold/10 disabled:opacity-50"
                  title="Marchează top 20% ca favorite (după mesaje, prompturi, captionuri)"
                >
                  <Star className="h-3.5 w-3.5" /> Auto ⭐ top 20%
                </button>
                <button
                  onClick={() => void downloadAll()}
                  disabled={downloading || photos.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gold/40 px-3 py-1.5 text-xs font-medium text-gold hover:bg-gold/10 disabled:opacity-50"
                >
                  {downloading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  Descarcă toate (ZIP)
                </button>
                <button
                  onClick={() => void refreshPhotos()}
                  className="text-xs text-gold hover:underline"
                >
                  Reîncarcă
                </button>
              </div>
            </div>

            {/* Phase 4B — filter tabs. Pending tab only appears when
                there's something pending; otherwise it'd just be dead
                chrome for owners who haven't enabled moderation. */}
            {photos.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {(
                  [
                    { key: "all" as const, label: `Toate (${photos.length})` },
                    {
                      key: "pending" as const,
                      label: `În așteptare (${photos.filter((p) => p.isApproved === false).length})`,
                      hidden:
                        photos.filter((p) => p.isApproved === false).length === 0,
                    },
                    {
                      key: "favorites" as const,
                      label: `⭐ Favorite (${photos.filter((p) => p.isFavorite).length})`,
                    },
                  ] as const
                )
                  .filter((t) => !("hidden" in t) || !t.hidden)
                  .map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setPhotoFilter(tab.key)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        photoFilter === tab.key
                          ? "bg-gold text-[#0D0D0D]"
                          : "bg-muted text-muted-foreground hover:bg-muted/70"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
              </div>
            )}

            {(() => {
              const filtered = photos.filter((p) => {
                if (photoFilter === "pending") return p.isApproved === false;
                if (photoFilter === "favorites") return p.isFavorite === true;
                return true;
              });
              if (photos.length === 0) {
                return (
                  <p className="rounded-lg border border-dashed border-border/40 p-8 text-center text-sm text-muted-foreground">
                    Încă nu au venit poze. Pozele noi apar automat aici.
                  </p>
                );
              }
              if (filtered.length === 0) {
                return (
                  <p className="rounded-lg border border-dashed border-border/40 p-8 text-center text-sm text-muted-foreground">
                    Niciun cadru în această secțiune.
                  </p>
                );
              }
              return (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {filtered.map((p) => {
                    const pending = p.isApproved === false;
                    return (
                      <div
                        key={p.id}
                        className={`group relative aspect-square overflow-hidden rounded-lg border ${
                          pending
                            ? "border-amber-500/50 ring-1 ring-amber-500/30"
                            : "border-border/40"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.url}
                          alt={p.guestName ?? ""}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        />

                        {/* Favorite star — top-right, always visible. */}
                        <button
                          type="button"
                          onClick={() => toggleFavorite(p)}
                          className={`absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full backdrop-blur-sm transition-colors ${
                            p.isFavorite
                              ? "bg-gold text-[#0D0D0D]"
                              : "bg-black/40 text-white/80 hover:bg-black/60"
                          }`}
                          aria-label={p.isFavorite ? "Dezactivează favorit" : "Marchează favorit"}
                        >
                          <Star
                            className="h-3.5 w-3.5"
                            fill={p.isFavorite ? "currentColor" : "none"}
                          />
                        </button>

                        {/* Pending badge + approve / reject controls. */}
                        {pending && (
                          <div className="absolute left-1.5 top-1.5 flex items-center gap-1">
                            <span className="rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-medium text-amber-950">
                              În așteptare
                            </span>
                          </div>
                        )}
                        {/* Phase 5/E1 — AI category chip, bottom-left
                            corner so it doesn't fight with the
                            pending/star badges. */}
                        {p.category && (
                          <div className="absolute bottom-12 left-1.5">
                            <span className="rounded-full bg-black/70 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-gold backdrop-blur-sm">
                              {p.category}
                            </span>
                          </div>
                        )}

                        {/* Phase 5/E3 — AI caption button (top-left,
                            below the pending badge). Generates a
                            one-liner from prompt + guest name. */}
                        <button
                          type="button"
                          onClick={() => void generateCaption(p)}
                          className={`absolute ${pending ? "left-1.5 top-9" : "left-1.5 top-1.5"} flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/60`}
                          aria-label="Generează caption AI"
                          title="Generează caption AI"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                        </button>

                        {/* Bottom action bar: approve when pending,
                            reject (delete) always. Pulls into view on
                            hover for desktop; tap-friendly stays on
                            mobile via group-focus. */}
                        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-1 bg-gradient-to-t from-black/85 to-transparent p-2 text-xs text-white">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">
                              {p.guestName ?? ""}
                            </p>
                            {p.caption && (
                              <p className="mt-0.5 line-clamp-2 text-[10px] italic opacity-90">
                                {p.caption}
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {pending && (
                              <button
                                type="button"
                                onClick={() => toggleApprove(p)}
                                className="rounded-full bg-emerald-500/90 px-2 py-1 text-[10px] font-medium text-emerald-950 hover:bg-emerald-500"
                              >
                                <CheckCircle className="inline h-3 w-3" /> Aprobă
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => rejectPhoto(p)}
                              className="rounded-full bg-red-500/80 px-2 py-1 text-[10px] font-medium text-white hover:bg-red-500"
                              aria-label="Șterge poza"
                            >
                              <XCircle className="inline h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </section>
        </>
      )}
    </div>
  );
}
