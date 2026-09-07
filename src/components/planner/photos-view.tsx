"use client";

// M4 — Photos sub-view: users upload snapshots from their event.
// One owner-checked upload endpoint processes, stores and attaches the file.
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
import { useLocale } from "@/hooks/use-locale";

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

// Bound both headers and JSON parsing: an interrupted response may already have
// committed a write, so callers reconcile by reading rather than retrying it.
async function photoRequest(url: string, init: RequestInit = {}, timeoutMs = 20_000) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { ...init, signal: controller.signal });
        if (!response.ok) return { ok: false, data: null };
        const data = await response.json() as {
          photos?: EventPhoto[]; photo?: EventPhoto; ok?: boolean; storagePreserved?: boolean;
        };
        return { ok: true, data };
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("Photo request outcome unknown"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function PhotosView({ planId }: Props) {
  const { t } = useLocale();
  const [photos, setPhotos] = useState<EventPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [caption, setCaption] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const mutationInFlight = useRef(false);
  const busy = loading || mutating;

  async function load(showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      const { ok, data } = await photoRequest(`/api/event-plans/${planId}/photos`, {
        cache: "no-store",
      }, 10_000);
      if (!ok || !Array.isArray(data?.photos)) throw new Error();
      setPhotos(data.photos);
    } catch {
      if (showLoading) toast.error(t("planner.photos.loadError"));
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  function beginMutation() {
    if (mutationInFlight.current || loading) return false;
    mutationInFlight.current = true;
    setMutating(true);
    return true;
  }

  function endMutation() {
    mutationInFlight.current = false;
    setMutating(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  async function handleUpload(file: File) {
    if (mutationInFlight.current || loading) return;
    if (!file.type.startsWith("image/")) {
      toast.error(t("planner.photos.onlyImages"));
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error(t("planner.photos.tooLarge"));
      return;
    }
    if (!beginMutation()) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (caption.trim()) fd.append("caption", caption.trim());
      const { ok, data } = await photoRequest(`/api/event-plans/${planId}/photos`, {
        method: "POST",
        body: fd,
      });
      if (!ok) {
        toast.error(t("planner.photos.saveError"));
        return;
      }
      const photo = data?.photo;
      if (!photo || typeof photo.id !== "number") throw new Error();
      setPhotos((prev) => [photo, ...prev.filter((item) => item.id !== photo.id)]);
      setCaption("");
      if (fileRef.current) fileRef.current.value = "";
      toast.success(t("planner.photos.added"));
    } catch {
      // Do not re-upload automatically or discard the draft after a lost reply.
      await load(false);
      toast.error(t("planner.photos.uploadFailed"));
    } finally {
      setUploading(false);
      endMutation();
    }
  }

  async function togglePublic(photo: EventPhoto) {
    if (!beginMutation()) return;
    const prev = photos;
    const next = photos.map((p) =>
      p.id === photo.id ? { ...p, isPublic: !p.isPublic } : p,
    );
    setPhotos(next);
    try {
      const { ok, data } = await photoRequest(
        `/api/event-plans/${planId}/photos/${photo.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isPublic: !photo.isPublic }),
        },
      );
      if (!ok || !data?.photo || data.photo.id !== photo.id) throw new Error();
      const saved = data.photo;
      setPhotos((items) => items.map((item) => item.id === saved.id ? saved : item));
    } catch {
      setPhotos(prev);
      await load(false);
      toast.error(t("planner.photos.updateError"));
    } finally {
      endMutation();
    }
  }

  async function deletePhoto(photo: EventPhoto) {
    if (!beginMutation()) return;
    const prev = photos;
    setPhotos(photos.filter((p) => p.id !== photo.id));
    try {
      const { ok, data } = await photoRequest(
        `/api/event-plans/${planId}/photos/${photo.id}`,
        { method: "DELETE" },
      );
      if (!ok || data?.ok !== true) throw new Error();
      if (data.storagePreserved) toast.warning(t("planner.photos.storagePreserved"), { duration: 10_000 });
    } catch {
      setPhotos(prev);
      await load(false);
      toast.error(t("planner.photos.deleteError"));
    } finally {
      endMutation();
    }
  }

  return (
    <div className="space-y-5">
      {/* Uploader */}
      <div className="rounded-xl border border-dashed border-border/40 bg-card p-5">
        <div className="flex items-center gap-3">
          <Camera className="h-5 w-5 text-gold" />
          <h3 className="font-heading text-base font-semibold">{t("planner.photos.addTitle")}</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("planner.photos.addHint")}
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input
            value={caption}
            disabled={busy}
            onChange={(e) => setCaption(e.target.value)}
            placeholder={t("planner.photos.captionPlaceholder")}
            className="flex-1"
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            disabled={busy}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
          />
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="gap-1 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            {t("planner.photos.upload")}
          </Button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t("planner.photos.loading")}
        </div>
      ) : photos.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          {t("planner.photos.empty")}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {photos.map((p) => (
            <div
              key={p.id}
              className="group relative overflow-hidden rounded-xl border border-border/40 bg-card"
            >
              { }
              <img
                src={p.url}
                alt={p.caption || t("planner.photos.altFallback")}
                className="aspect-square w-full object-cover"
                loading="lazy"
              />
              <div className="absolute top-2 right-2 flex gap-1">
                <button
                  onClick={() => togglePublic(p)}
                  disabled={busy}
                  className="rounded-full bg-black/60 p-1.5 text-white backdrop-blur transition hover:bg-black/80"
                  title={p.isPublic ? t("planner.photos.hide") : t("planner.photos.makePublic")}
                >
                  {p.isPublic ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  onClick={() => deletePhoto(p)}
                  disabled={busy}
                  className="rounded-full bg-black/60 p-1.5 text-white backdrop-blur transition hover:bg-red-500"
                  title={t("common.delete")}
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
                    {p.isApproved
                      ? t("planner.photos.approved")
                      : t("planner.photos.pending")}
                    {p.isPublic
                      ? ` · ${t("planner.photos.public")}`
                      : ` · ${t("planner.photos.private")}`}
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
