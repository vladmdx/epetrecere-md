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
} from "lucide-react";
import { toast } from "sonner";

interface Photo {
  id: number;
  url: string;
  guestName: string | null;
  guestMessage: string | null;
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
  const [savingSettings, setSavingSettings] = useState(false);
  const [downloading, setDownloading] = useState(false);

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
      const res = await fetch(`/api/event-plans/${planId}/moments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openAt: localInputToIso(openAtInput),
          closeAt: localInputToIso(closeAtInput),
          revealAt: localInputToIso(revealAtInput),
          shotLimit: limitNumber,
          vintage: vintageInput,
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
                <Link
                  href={`/cabinet/moments/${planId}/colaj`}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-gold px-3 py-2 text-xs font-medium text-[#0D0D0D] hover:bg-gold-dark"
                >
                  <LayoutGrid className="h-3.5 w-3.5" /> Construiește colaj
                </Link>
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

          <section className="mt-10">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-heading text-lg font-bold">
                Poze primite ({photos.length})
              </h2>
              <div className="flex items-center gap-3">
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
            {photos.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border/40 p-8 text-center text-sm text-muted-foreground">
                Încă nu au venit poze. Pozele noi apar automat aici.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {photos.map((p) => (
                  <div
                    key={p.id}
                    className="group relative aspect-square overflow-hidden rounded-lg border border-border/40"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt={p.guestName ?? ""}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                    {p.guestName && (
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-xs text-white">
                        {p.guestName}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
