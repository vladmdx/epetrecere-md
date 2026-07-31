"use client";

// Photo uploader for review submissions. Up to 5 images, uploads each
// via /api/upload (existing infra — goes to Vercel Blob or local disk
// depending on env). Shows thumbnails with delete buttons, empty state
// with drop zone affordance.
//
// Parent controls the photos array; we just push URLs when upload
// succeeds. Parent is responsible for passing this to POST /api/reviews.

import { useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  value: string[];
  onChange: (urls: string[]) => void;
  max?: number;
  className?: string;
}

export function ReviewPhotoUploader({
  value,
  onChange,
  max = 5,
  className,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    const remaining = max - value.length;
    if (remaining <= 0) {
      toast.error(`Maximum ${max} fotografii`);
      return;
    }

    const toUpload = Array.from(files).slice(0, remaining);
    setUploading(true);

    const uploaded: string[] = [];
    for (const file of toUpload) {
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name}: doar imagini`);
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name}: prea mare (max 10MB)`);
        continue;
      }
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "uploads");
      try {
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(`${file.name}: ${err.error || "upload eșuat"}`);
          continue;
        }
        const data = (await res.json()) as { url: string };
        uploaded.push(data.url);
      } catch {
        toast.error(`${file.name}: eroare rețea`);
      }
    }
    setUploading(false);

    if (uploaded.length > 0) {
      onChange([...value, ...uploaded]);
      toast.success(
        `${uploaded.length} ${uploaded.length === 1 ? "fotografie adăugată" : "fotografii adăugate"}`,
      );
    }

    // Reset input so selecting the same file again re-triggers change
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  const canAddMore = value.length < max;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-2">
        {value.map((url, i) => (
          <div
            key={url}
            className="relative h-20 w-20 overflow-hidden rounded-lg border border-border/40"
          >
            { }
            <img
              src={url}
              alt={`Fotografie ${i + 1}`}
              className="h-full w-full object-cover"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label="Șterge fotografia"
              className="absolute right-0.5 top-0.5 rounded-full bg-black/70 p-1 text-white hover:bg-red-500"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}

        {canAddMore && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border/60 text-muted-foreground transition-colors hover:border-gold/60 hover:text-gold disabled:opacity-60"
            aria-label="Adaugă fotografie"
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Camera className="h-5 w-5" />
                <span className="text-[10px]">Adaugă</span>
              </>
            )}
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <p className="text-xs text-muted-foreground">
        Adaugă până la {max} fotografii (JPG/PNG, max 10MB fiecare). Ajută alți
        clienți să vadă rezultatul real!
      </p>
    </div>
  );
}
