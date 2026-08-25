"use client";

// F-A4 (video) — Video manager for the vendor profile.
//
// Wraps /api/artist-videos:
//   - GET list on mount
//   - POST new URL → backend parses YouTube / Vimeo → platform + videoId
//   - DELETE row
//
// The owner pastes a URL; the API parses it and rejects unsupported
// platforms with 400. We embed via the platform-specific iframe so
// previews work inside the dashboard without the public detail page.

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "@/hooks/use-locale";

type VideoRow = {
  id: number;
  platform: "youtube" | "vimeo";
  videoId: string;
  title: string | null;
  sortOrder: number | null;
};

function embedUrl(row: VideoRow): string {
  if (row.platform === "youtube") {
    return `https://www.youtube.com/embed/${row.videoId}`;
  }
  return `https://player.vimeo.com/video/${row.videoId}`;
}

export function VideoManager({ artistId }: { artistId: number | null }) {
  const { t } = useLocale();
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");

  const reload = useCallback(async () => {
    if (!artistId) return;
    try {
      const res = await fetch(`/api/artist-videos?artist_id=${artistId}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("fetch failed");
      const rows = (await res.json()) as VideoRow[];
      setVideos(rows);
    } catch {
      toast.error(t("vendor.videoManager.toastLoadError"));
    } finally {
      setLoading(false);
    }
  }, [artistId]);

  useEffect(() => {
    if (artistId) reload();
    else setLoading(false);
  }, [artistId, reload]);

  async function add() {
    if (!artistId) return;
    if (!url.trim()) {
      toast.error(t("vendor.videoManager.toastNeedUrl"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/artist-videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artistId,
          url: url.trim(),
          title: title.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Save failed");
      }
      setUrl("");
      setTitle("");
      await reload();
      toast.success(t("vendor.videoManager.toastAdded"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("moments.errGeneric"));
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: number) {
    try {
      const res = await fetch(`/api/artist-videos/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("delete failed");
      await reload();
    } catch {
      toast.error(t("vendor.videoManager.toastDeleteError"));
    }
  }

  if (!artistId) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("vendor.videoManager.saveProfileFirst")}
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
      <div className="rounded-lg border border-border/40 p-4">
        <Label>{t("vendor.videoManager.addVideoLabel")}</Label>
        <div className="mt-2 grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
          <Input
            placeholder="https://youtube.com/watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Input
            placeholder={t("vendor.videoManager.titlePlaceholder")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Button onClick={add} disabled={submitting} className="gap-1">
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {t("common.add")}
          </Button>
        </div>
      </div>

      {videos.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {videos.map((v) => (
            <div
              key={v.id}
              className="overflow-hidden rounded-lg border border-border/40"
            >
              <div className="aspect-video w-full">
                <iframe
                  src={embedUrl(v)}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <div className="flex items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {v.title ?? v.videoId}
                  </p>
                  <p className="text-xs uppercase text-muted-foreground">
                    {v.platform}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(v.id)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
