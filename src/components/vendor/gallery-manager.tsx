"use client";

// F-A4 (gallery) — Persistent gallery manager for the vendor profile.
//
// The original ImageUpload helper stored files as object URLs in local
// state and threw them away on navigate — silent data loss. This
// component hits the real endpoints:
//   - GET /api/artist-images?artist_id=X  → list on mount
//   - POST /api/upload                    → blob store (multipart)
//   - POST /api/artist-images             → persist URL + cover flag
//   - PUT /api/artist-images/[id]         → toggle cover
//   - DELETE /api/artist-images/[id]      → remove
//
// The artist id is injected by the parent once it's resolved from
// /api/me/artist, so this component is purely a controlled widget —
// it doesn't do auth itself.

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Upload, X, Star, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ImageRow = {
  id: number;
  url: string;
  altRo: string | null;
  altRu: string | null;
  altEn: string | null;
  sortOrder: number | null;
  isCover: boolean;
};

const MAX_FILES = 20;

export function GalleryManager({ artistId }: { artistId: number | null }) {
  const [images, setImages] = useState<ImageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    if (!artistId) return;
    try {
      const res = await fetch(`/api/artist-images?artist_id=${artistId}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("fetch failed");
      const rows = (await res.json()) as ImageRow[];
      setImages(rows);
    } catch {
      toast.error("Nu am putut încărca galeria");
    } finally {
      setLoading(false);
    }
  }, [artistId]);

  useEffect(() => {
    if (artistId) reload();
    else setLoading(false);
  }, [artistId, reload]);

  async function handleFiles(files: FileList) {
    if (!artistId) return;
    if (images.length + files.length > MAX_FILES) {
      toast.error(`Maxim ${MAX_FILES} imagini`);
      return;
    }

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name} depășește 10MB`);
          continue;
        }

        // Step 1: blob upload → get public URL
        const form = new FormData();
        form.append("file", file);
        form.append("folder", "artists");
        const upRes = await fetch("/api/upload", {
          method: "POST",
          body: form,
        });
        if (!upRes.ok) {
          const err = await upRes.json().catch(() => ({}));
          throw new Error(err.error || "Upload failed");
        }
        const { url } = (await upRes.json()) as { url: string };

        // Step 2: persist the row (first upload becomes cover)
        const createRes = await fetch("/api/artist-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            artistId,
            url,
            altRo: file.name.replace(/\.[^.]+$/, ""),
            isCover: images.length === 0,
          }),
        });
        if (!createRes.ok) {
          const err = await createRes.json().catch(() => ({}));
          throw new Error(err.error || "Save failed");
        }
      }
      await reload();
      toast.success("Imagini adăugate");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Eroare la încărcare",
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removeImage(id: number) {
    try {
      const res = await fetch(`/api/artist-images/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("delete failed");
      await reload();
    } catch {
      toast.error("Nu am putut șterge imaginea");
    }
  }

  async function setCover(id: number) {
    try {
      const res = await fetch(`/api/artist-images/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isCover: true }),
      });
      if (!res.ok) throw new Error("put failed");
      await reload();
    } catch {
      toast.error("Nu am putut marca copertă");
    }
  }

  if (!artistId) {
    return (
      <p className="text-sm text-muted-foreground">
        Salvează profilul înainte de a adăuga imagini.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border/60 p-8 text-center transition-colors hover:border-gold/60",
          uploading && "pointer-events-none opacity-60",
        )}
      >
        {uploading ? (
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        ) : (
          <Upload className="h-8 w-8 text-muted-foreground" />
        )}
        <p className="mt-2 text-sm font-medium">
          {uploading ? "Se încarcă..." : "Click pentru a încărca imagini"}
        </p>
        <p className="text-xs text-muted-foreground">
          JPG/PNG/WebP · max 10MB · max {MAX_FILES} fișiere
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((img) => (
            <div
              key={img.id}
              className={cn(
                "group relative aspect-square overflow-hidden rounded-lg border",
                img.isCover ? "border-gold" : "border-border/40",
              )}
            >
              <Image
                src={img.url}
                alt={img.altRo ?? ""}
                fill
                sizes="(max-width: 640px) 50vw, 200px"
                className="object-cover"
                unoptimized
              />
              {img.isCover && (
                <span className="absolute left-1 top-1 rounded bg-gold px-1.5 py-0.5 text-[10px] font-semibold text-background">
                  Copertă
                </span>
              )}
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                {!img.isCover && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => setCover(img.id)}
                  >
                    <Star className="h-3 w-3" /> Copertă
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => removeImage(img.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
