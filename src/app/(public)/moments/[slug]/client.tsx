"use client";

// F-C8 — Guest upload UI. Big friendly camera button, minimal form.
// No JS frameworks beyond React — must work on grandma's phone.

import { useEffect, useState } from "react";
import { Camera, Upload, Check, Loader2, Image as ImageIcon } from "lucide-react";

interface InitialPhoto {
  id: number;
  url: string;
  guestName: string | null;
  guestMessage: string | null;
}

interface Props {
  slug: string;
  title: string;
  eventDate: string | null;
  initialPhotos: InitialPhoto[];
}

export function MomentsUploadClient({
  slug,
  title,
  eventDate,
  initialPhotos,
}: Props) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [guestName, setGuestName] = useState("");
  const [guestMessage, setGuestMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Remember the name between uploads on the same device so guests can
  // drop multiple batches without retyping.
  useEffect(() => {
    const saved = localStorage.getItem(`moments-name-${slug}`);
    if (saved) setGuestName(saved);
  }, [slug]);

  useEffect(() => {
    if (guestName) localStorage.setItem(`moments-name-${slug}`, guestName);
  }, [slug, guestName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!guestName.trim() || files.length === 0) {
      setError("Scrie numele tău și alege cel puțin o poză.");
      return;
    }
    setUploading(true);
    const newPhotos: InitialPhoto[] = [];
    try {
      for (const file of files) {
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
      setPhotos((prev) => [...newPhotos, ...prev]);
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
          Împărtășește momentele tale. Pozele apar live în galeria mirilor.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="mt-6 rounded-2xl border border-border/40 bg-card p-5"
      >
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
        />

        <label
          htmlFor="moments-file"
          className="mt-5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gold/40 bg-gold/5 p-8 text-center hover:bg-gold/10"
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
        />

        {error && (
          <p className="mt-3 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={uploading || files.length === 0 || !guestName.trim()}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-gold px-4 py-3 text-sm font-medium text-background hover:bg-gold-dark disabled:opacity-50"
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
      </form>

      {photos.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <ImageIcon className="h-4 w-4 text-gold" />
            Galerie live ({photos.length})
          </div>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p) => (
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
