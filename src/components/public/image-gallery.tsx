"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface GalleryImage {
  url: string;
  alt?: string | null;
}

interface ImageGalleryProps {
  images: GalleryImage[];
}

export function ImageGallery({ images }: ImageGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (!images.length) return null;

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
        {images.map((img, i) => (
          <button
            key={i}
            onClick={() => setLightboxIndex(i)}
            className="group relative aspect-[4/3] overflow-hidden rounded-lg bg-muted"
          >
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground transition-colors group-hover:bg-gold/10">
              <span className="text-2xl">📷</span>
            </div>
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLightboxIndex(null)}
            className="absolute right-4 top-4 text-white hover:bg-white/10"
          >
            <X className="h-6 w-6" />
          </Button>

          {lightboxIndex > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLightboxIndex(lightboxIndex - 1)}
              className="absolute left-4 text-white hover:bg-white/10"
            >
              <ChevronLeft className="h-8 w-8" />
            </Button>
          )}

          <div className="flex h-[80vh] w-[80vw] items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-white">
              <span className="text-6xl">📷</span>
              <p className="text-sm opacity-70">
                {images[lightboxIndex]?.alt || `Imagine ${lightboxIndex + 1}`}
              </p>
              <p className="text-xs opacity-50">
                {lightboxIndex + 1} / {images.length}
              </p>
            </div>
          </div>

          {lightboxIndex < images.length - 1 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLightboxIndex(lightboxIndex + 1)}
              className="absolute right-4 text-white hover:bg-white/10"
            >
              <ChevronRight className="h-8 w-8" />
            </Button>
          )}
        </div>
      )}
    </>
  );
}
