"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, GripVertical, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface UploadedImage {
  id: string;
  url: string;
  alt: string;
  isCover: boolean;
}

interface ImageUploadProps {
  images: UploadedImage[];
  onChange: (images: UploadedImage[]) => void;
  maxFiles?: number;
  folder?: string;
}

export function ImageUpload({ images, onChange, maxFiles = 20, folder = "artists" }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList) {
    if (images.length + files.length > maxFiles) {
      toast.error(`Maximum ${maxFiles} imagini`);
      return;
    }

    setUploading(true);

    const newImages: UploadedImage[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} depășește 10MB`);
        continue;
      }

      // In production: upload to R2 via /api/upload
      // For now: create local object URL as preview
      const url = URL.createObjectURL(file);
      newImages.push({
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        url,
        alt: file.name.replace(/\.[^.]+$/, ""),
        isCover: images.length === 0 && newImages.length === 0,
      });
    }

    onChange([...images, ...newImages]);
    setUploading(false);

    if (newImages.length) {
      toast.success(`${newImages.length} imagini adăugate`);
    }
  }

  function removeImage(id: string) {
    const updated = images.filter((img) => img.id !== id);
    if (updated.length && !updated.some((img) => img.isCover)) {
      updated[0].isCover = true;
    }
    onChange(updated);
  }

  function setCover(id: string) {
    onChange(images.map((img) => ({ ...img, isCover: img.id === id })));
  }

  return (
    <div className="space-y-4">
      {/* Upload zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-gold"); }}
        onDragLeave={(e) => { e.currentTarget.classList.remove("border-gold"); }}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.classList.remove("border-gold");
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
        }}
        className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border/60 p-8 transition-colors hover:border-gold/50 hover:bg-gold/5"
      >
        <Upload className={cn("h-8 w-8", uploading ? "animate-pulse text-gold" : "text-muted-foreground")} />
        <div className="text-center">
          <p className="text-sm font-medium">{uploading ? "Se uploadează..." : "Trage imaginile aici"}</p>
          <p className="text-xs text-muted-foreground">sau click pentru a selecta (max 10MB/img, {maxFiles} total)</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {/* Image grid */}
      {images.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-4">
          {images.map((img) => (
            <div
              key={img.id}
              className={cn(
                "group relative aspect-[4/3] overflow-hidden rounded-lg border-2 bg-muted",
                img.isCover ? "border-gold" : "border-transparent",
              )}
            >
              <img
                src={img.url}
                alt={img.alt}
                className="h-full w-full object-cover"
              />

              {/* Overlay actions */}
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-white hover:bg-white/20"
                  onClick={() => setCover(img.id)}
                  title="Setează ca cover"
                >
                  <Star className={cn("h-4 w-4", img.isCover && "fill-gold text-gold")} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-white hover:bg-destructive/50"
                  onClick={() => removeImage(img.id)}
                  title="Șterge"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {img.isCover && (
                <span className="absolute left-1 top-1 rounded bg-gold px-1.5 py-0.5 text-[10px] font-bold text-background">
                  COVER
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
