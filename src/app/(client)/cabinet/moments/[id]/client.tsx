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
} from "lucide-react";
import { toast } from "sonner";

interface Photo {
  id: number;
  url: string;
  guestName: string | null;
  guestMessage: string | null;
  createdAt: string;
}

export function MomentsOwnerClient({ planId }: { planId: number }) {
  const [slug, setSlug] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [origin, setOrigin] = useState("");

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
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-gold px-5 py-2.5 text-sm font-medium text-background hover:bg-gold-dark disabled:opacity-50"
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
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-gold px-3 py-2 text-xs font-medium text-background hover:bg-gold-dark"
                >
                  <Monitor className="h-3.5 w-3.5" /> Deschide slideshow
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

          <section className="mt-10">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-heading text-lg font-bold">
                Poze primite ({photos.length})
              </h2>
              <button
                onClick={() => void refreshPhotos()}
                className="text-xs text-gold hover:underline"
              >
                Reîncarcă
              </button>
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
