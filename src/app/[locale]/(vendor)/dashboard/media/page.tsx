"use client";

import { useEffect, useState } from "react";
import { Images, Loader2, Video } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GalleryManager } from "@/components/vendor/gallery-manager";
import { VideoManager } from "@/components/vendor/video-manager";
import { useLocale } from "@/hooks/use-locale";

export default function VendorMediaPage() {
  const { t } = useLocale();
  const [artistId, setArtistId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/artist", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { artist: null }))
      .then((data) => {
        if (!cancelled) setArtistId(data.artist?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setArtistId(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{t("dashboard.media")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("dashboard.mediaDescription")}
        </p>
      </div>

      {!artistId ? (
        <div className="rounded-xl border border-dashed border-border/50 p-8 text-center text-sm text-muted-foreground">
          {t("dashboard.noArtistProfile")}
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Images className="h-5 w-5 text-gold" />
                {t("dashboard.photoGallery")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <GalleryManager artistId={artistId} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Video className="h-5 w-5 text-gold" />
                {t("dashboard.videos")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <VideoManager artistId={artistId} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
