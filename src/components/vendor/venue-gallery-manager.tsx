"use client";

// Venue gallery editor — spec section 4.4.
//
// - Real uploads hit /api/upload?folder=venues → Vercel Blob (prod) or
//   public/uploads fallback (dev). Returned URL is persisted via
//   POST /api/venue-images.
// - Drag-drop reorder via @dnd-kit. Persisted through
//   PUT /api/venue-images { venueId, items: [{id, sortOrder}] }.
// - Cover invariant is enforced server-side; the client just toggles.
// - Alt text is editable inline per locale (RO primary; RU/EN in expander).
// - Counter warns when the current plan limit is reached.

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Upload,
  Star,
  Trash2,
  Loader2,
  GripVertical,
  Info,
  Image as ImageIcon,
  Pencil,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useLocale } from "@/hooks/use-locale";

interface VenueImage {
  id: number;
  url: string;
  altRo: string | null;
  altRu: string | null;
  altEn: string | null;
  sortOrder: number | null;
  isCover: boolean;
}

interface Props {
  venueId: number;
  venueName: string;
  /** Plan-based cap on total images. Free=10, Pro=50 per spec. */
  maxImages?: number;
}

export function VenueGalleryManager({
  venueId,
  venueName,
  maxImages = 10,
}: Props) {
  const { t } = useLocale();
  const [images, setImages] = useState<VenueImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(0); // count in-flight uploads
  const [editingAlt, setEditingAlt] = useState<VenueImage | null>(null);
  const [altRo, setAltRo] = useState("");
  const [altRu, setAltRu] = useState("");
  const [altEn, setAltEn] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId]);

  async function reload() {
    setLoading(true);
    try {
      const res = await fetch(`/api/venue-images?venue_id=${venueId}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as VenueImage[];
      setImages(
        data.sort(
          (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id,
        ),
      );
    } catch {
      toast.error(t("vendor.venueGallery.toastLoadError"));
    } finally {
      setLoading(false);
    }
  }

  /** Auto-generate Romanian alt text from the file name + venue name. */
  function suggestedAlt(fileName: string) {
    const base = fileName
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]+/g, " ")
      .trim();
    return `${venueName}${base ? ` — ${base}` : ""}`;
  }

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    const slotsLeft = maxImages - images.length - uploading;
    if (slotsLeft <= 0) {
      toast.error(t("vendor.venueGallery.toastPlanLimit", { max: maxImages }));
      return;
    }
    if (list.length > slotsLeft) {
      toast.error(t("vendor.venueGallery.toastSlotsLeft", { count: slotsLeft }));
    }
    const toUpload = list.slice(0, slotsLeft);

    for (const file of toUpload) {
      if (!file.type.startsWith("image/")) {
        toast.error(t("vendor.venueGallery.toastNotImage", { name: file.name }));
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(t("vendor.venueGallery.toastTooBig", { name: file.name }));
        continue;
      }

      setUploading((c) => c + 1);
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("folder", "venues");
        const upRes = await fetch("/api/upload", {
          method: "POST",
          body: fd,
        });
        if (!upRes.ok) {
          const err = await upRes.json().catch(() => ({}));
          toast.error(err.error || t("vendor.venueGallery.toastUploadFailed", { name: file.name }));
          continue;
        }
        const upData = (await upRes.json()) as { url: string };

        // Persist via /api/venue-images. First image auto-cover.
        const isFirst = images.length === 0 && uploading === 1; // only first batch item
        const alt = suggestedAlt(file.name);
        const createRes = await fetch("/api/venue-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            venueId,
            url: upData.url,
            altRo: alt,
            isCover: isFirst,
          }),
        });
        if (!createRes.ok) {
          toast.error(t("vendor.venueGallery.toastSaveError"));
          continue;
        }
        const saved = (await createRes.json()) as VenueImage;
        setImages((prev) => [...prev, saved]);
      } finally {
        setUploading((c) => c - 1);
      }
    }
    if (toUpload.length) {
      toast.success(t("vendor.venueGallery.toastAdded", { count: toUpload.length }));
    }
  }

  async function setCover(id: number) {
    // Optimistic
    setImages((prev) =>
      prev.map((img) => ({ ...img, isCover: img.id === id })),
    );
    const res = await fetch(`/api/venue-images/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isCover: true }),
    });
    if (!res.ok) {
      toast.error(t("vendor.venueGallery.toastCoverError"));
      void reload();
    } else {
      toast.success(t("vendor.venueGallery.toastCoverUpdated"));
    }
  }

  async function removeImage(id: number) {
    if (!confirm(t("vendor.venueGallery.confirmDelete"))) return;
    const prev = images;
    setImages((x) => x.filter((i) => i.id !== id));
    const res = await fetch(`/api/venue-images/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(t("vendor.venueGallery.toastDeleteError"));
      setImages(prev);
    } else {
      toast.success(t("vendor.venueGallery.toastDeleted"));
    }
  }

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = images.findIndex((i) => i.id === active.id);
    const newIdx = images.findIndex((i) => i.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(images, oldIdx, newIdx);
    setImages(reordered);

    const items = reordered.map((img, i) => ({ id: img.id, sortOrder: i }));
    const res = await fetch("/api/venue-images", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ venueId, items }),
    });
    if (!res.ok) {
      toast.error(t("vendor.venueGallery.toastOrderError"));
      void reload();
    }
  }

  function openAltEditor(img: VenueImage) {
    setEditingAlt(img);
    setAltRo(img.altRo ?? "");
    setAltRu(img.altRu ?? "");
    setAltEn(img.altEn ?? "");
  }

  async function saveAlt() {
    if (!editingAlt) return;
    const res = await fetch(`/api/venue-images/${editingAlt.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        altRo: altRo.trim() || null,
        altRu: altRu.trim() || null,
        altEn: altEn.trim() || null,
      }),
    });
    if (!res.ok) {
      toast.error(t("vendor.venueGallery.toastAltError"));
      return;
    }
    setImages((prev) =>
      prev.map((i) =>
        i.id === editingAlt.id
          ? {
              ...i,
              altRo: altRo.trim() || null,
              altRu: altRu.trim() || null,
              altEn: altEn.trim() || null,
            }
          : i,
      ),
    );
    toast.success(t("vendor.venueGallery.toastAltSaved"));
    setEditingAlt(null);
  }

  const atLimit = images.length >= maxImages;

  return (
    <div className="space-y-5">
      {/* Upload zone + counter */}
      <div
        onClick={() => !atLimit && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!atLimit) e.currentTarget.classList.add("border-gold");
        }}
        onDragLeave={(e) => e.currentTarget.classList.remove("border-gold")}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.classList.remove("border-gold");
          if (!atLimit && e.dataTransfer.files.length) {
            void handleFiles(e.dataTransfer.files);
          }
        }}
        className={cn(
          "flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border/60 p-8 transition-colors",
          atLimit
            ? "cursor-not-allowed opacity-60"
            : "cursor-pointer hover:border-gold/50 hover:bg-gold/5",
        )}
      >
        <Upload
          className={cn(
            "h-8 w-8",
            uploading > 0
              ? "animate-pulse text-gold"
              : "text-muted-foreground",
          )}
        />
        <div className="text-center">
          <p className="text-sm font-medium">
            {uploading > 0
              ? t("vendor.venueGallery.uploading", { count: uploading })
              : atLimit
                ? t("vendor.venueGallery.atLimit", { max: maxImages })
                : t("vendor.venueGallery.dropzone")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("vendor.venueGallery.formatsHint")}
          </p>
          <p className="mt-1 text-xs font-medium text-gold">
            {t("vendor.venueGallery.countLabel", { count: images.length, max: maxImages })}
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) =>
            e.target.files &&
            (void handleFiles(e.target.files), (e.currentTarget.value = ""))
          }
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      ) : images.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/40 py-10 text-center">
          <ImageIcon className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {t("vendor.venueGallery.emptyHint")}
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={images.map((i) => i.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-4">
              {images.map((img) => (
                <SortableThumb
                  key={img.id}
                  img={img}
                  onSetCover={() => setCover(img.id)}
                  onDelete={() => removeImage(img.id)}
                  onEditAlt={() => openAltEditor(img)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        {t("vendor.venueGallery.coverNoteBefore")} <strong>COVER</strong>{t("vendor.venueGallery.coverNoteAfter")}
      </p>

      {/* Alt-text editor dialog */}
      <Dialog
        open={!!editingAlt}
        onOpenChange={(v) => !v && setEditingAlt(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("vendor.venueGallery.altDialogTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {t("vendor.venueGallery.altHelp")}{" "}
              <em>
                &ldquo;{t("vendor.venueGallery.altExamplePrefix")} {venueName}{" "}
                {t("vendor.venueGallery.altExampleSuffix")}&rdquo;
              </em>
              .
            </p>
            <div>
              <Label htmlFor="alt-ro">Română</Label>
              <Input
                id="alt-ro"
                value={altRo}
                onChange={(e) => setAltRo(e.target.value)}
                maxLength={500}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="alt-ru">Русский</Label>
              <Input
                id="alt-ru"
                value={altRu}
                onChange={(e) => setAltRu(e.target.value)}
                maxLength={500}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="alt-en">English</Label>
              <Input
                id="alt-en"
                value={altEn}
                onChange={(e) => setAltEn(e.target.value)}
                maxLength={500}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingAlt(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={saveAlt}
              className="bg-gold text-[#0D0D0D] hover:bg-gold-dark"
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SortableThumb({
  img,
  onSetCover,
  onDelete,
  onEditAlt,
}: {
  img: VenueImage;
  onSetCover: () => void;
  onDelete: () => void;
  onEditAlt: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: img.id });
  const { t } = useLocale();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative aspect-[4/3] overflow-hidden rounded-lg border-2 bg-muted",
        img.isCover ? "border-gold" : "border-transparent",
      )}
    >
      { }
      <img
        src={img.url}
        alt={img.altRo ?? "Venue image"}
        className="h-full w-full object-cover"
      />

      {/* Drag handle */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t("vendor.venueGallery.dragAria")}
        className="absolute left-1 top-1 rounded bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      {/* Action overlay */}
      <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          size="icon"
          variant="ghost"
          aria-label={t("vendor.venueGallery.setCoverAria")}
          className="h-8 w-8 text-white hover:bg-white/20"
          onClick={onSetCover}
        >
          <Star
            className={cn("h-4 w-4", img.isCover && "fill-gold text-gold")}
          />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label={t("vendor.venueGallery.editAltAria")}
          className="h-8 w-8 text-white hover:bg-white/20"
          onClick={onEditAlt}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label={t("upload.deleteAria")}
          className="h-8 w-8 text-white hover:bg-red-500/50"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {img.isCover && (
        <span className="absolute left-1 top-1 rounded bg-gold px-1.5 py-0.5 text-[10px] font-bold text-[#0D0D0D] group-hover:opacity-0 transition-opacity">
          COVER
        </span>
      )}
    </div>
  );
}
