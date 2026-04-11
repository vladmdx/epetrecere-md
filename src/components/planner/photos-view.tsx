"use client";

// M4 — Photos sub-view: users upload snapshots from their event.
// Upload flow: file → /api/upload (Vercel Blob) → /api/event-plans/[id]/photos.
// Photos default to private + awaiting approval so admins can moderate
// UGC before it's surfaced publicly on artist profiles.

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Camera,
  Loader2,
  Trash2,
  Eye,
  EyeOff,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";

export interface EventPhoto {
  id: number;
  url: string;
  caption: string | null;
  isPublic: boolean;
  isApproved: boolean;
  createdAt: string;
}

interface Props {
  planId: number;
}

export function PhotosView({ planId }: Props) {
  const [photos, setPhotos] = useState<EventPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/event-plans/${planId}/photos`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPhotos(data.photos ?? []);
    } catch {
      toast.error("Nu am putut încărca fotografiile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  async function handleUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Doar imagini sunt acceptate.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Maxim 10MB per fotografie.");
      return;
    }
    setUploading(true);
    try {
      // 1. Upload to Vercel Blob via the shared /api/upload endpoint
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", `event-plans/${planId}`);
      const upRes = await fetch("/api/upload", { method: "POST", body: fd });
      const upData = await upRes.json();
      if (!upRes.ok || !upData.url) {
        toast.error(upData.error || "Upload eșuat.");
        return;
      }

      // 2. Attach URL to this plan
      const res = await fetch(`/api/event-plans/${planId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: upData.url,
          caption: caption.trim() || undefined,
        }),
      });
      if (!res.ok) {
        toast.error("Nu am putut salva fotografia.");
        return;
      }
      const data = await res.json();
      setPhotos((prev) => [data.photo, ...prev]);
      setCaption("");
      if (fileRef.current) fileRef.current.value = "";
      toast.success("Fotografie adăugată.");
    } finally {
      setUploading(false);
    }
  }

  async function togglePublic(photo: EventPhoto) {
    const prev = photos;
    const next = photos.map((p) =>
      p.id === photo.id ? { ...p, isPublic: !p.isPublic } : p,
    );
    setPhotos(next);
    const res = await fetch(
      `/api/event-plans/${planId}/photos/${photo.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: !photo.isPublic }),
      },
    );
    if (!res.ok) {
      toast.error("Nu am putut actualiza.");
      setPhotos(prev);
    }
  }

  async function deletePhoto(photo: EventPhoto) {
    const prev = photos;
    setPhotos(photos.filter((p) => p.id !== photo.id));
    const res = await fetch(
      `/api/event-plans/${planId}/photos/${photo.id}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      toast.error("Nu am putut șterge.");
      setPhotos(prev);
    }
  }

  return (
    <div className="space-y-5">
      {/* Uploader */}
      <div className="rounded-xl border border-dashed border-border/40 bg-card p-5">
        <div className="flex items-center gap-3">
          <Camera className="h-5 w-5 text-gold" />
          <h3 className="font-heading text-base font-semibold">Adaugă fotografii</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Împărtășește momente din eveniment. JPG / PNG / WEBP, max 10MB.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Descriere (opțional)"
            className="flex-1"
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
          />
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="gap-1 bg-gold text-background hover:bg-gold-dark"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            Încarcă
          </Button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Se încarcă…
        </div>
      ) : photos.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          Nicio fotografie încă.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {photos.map((p) => (
            <div
              key={p.id}
              className="group relative overflow-hidden rounded-xl border border-border/40 bg-card"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.caption || "Event photo"}
                className="aspect-square w-full object-cover"
                loading="lazy"
              />
              <div className="absolute top-2 right-2 flex gap-1">
                <button
                  onClick={() => togglePublic(p)}
                  className="rounded-full bg-black/60 p-1.5 text-white backdrop-blur transition hover:bg-black/80"
                  title={p.isPublic ? "Ascunde" : "Fă public"}
                >
                  {p.isPublic ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  onClick={() => deletePhoto(p)}
                  className="rounded-full bg-black/60 p-1.5 text-white backdrop-blur transition hover:bg-red-500"
                  title="Șterge"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-xs text-white">
                <div className="mb-0.5 flex items-center gap-1">
                  {p.isApproved ? (
                    <ShieldCheck className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <ShieldAlert className="h-3 w-3 text-amber-400" />
                  )}
                  <span className="text-[10px] uppercase">
                    {p.isApproved ? "Aprobat" : "În verificare"}
                    {p.isPublic ? " · public" : " · privat"}
                  </span>
                </div>
                {p.caption && <p className="line-clamp-2">{p.caption}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
