"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GripVertical, Loader2, Pencil, Upload, X, ImageIcon } from "lucide-react";
import { toast } from "sonner";
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
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useLocale } from "@/hooks/use-locale";

interface Category {
  id: number;
  nameRo: string;
  slug: string;
  type: string;
  priceFrom: number | null;
  isActive: boolean;
  icon: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  badge: string | null;
  descriptionRo: string | null;
  seoTitleRo: string | null;
  seoDescRo: string | null;
  seoBodyRo: string | null;
  sortOrder: number | null;
}

const typeColors: Record<string, string> = {
  artist: "bg-gold/10 text-gold",
  service: "bg-info/10 text-info",
  venue: "bg-success/10 text-success",
};

const typeLabelKeys: Record<string, string> = {
  artist: "admin.categoriesPage.typeArtist",
  service: "admin.categoriesPage.typeService",
  venue: "admin.categoriesPage.typeVenue",
};

function SortableCategoryCard({ cat, onEdit }: { cat: Category; onEdit: (cat: Category) => void }) {
  const { t } = useLocale();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cat.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card className="transition-all hover:border-gold/30">
        <CardContent className="flex items-center gap-4 py-3">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing touch-none"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
          {/* Image preview */}
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
            {cat.imageUrl ? (
              <img src={cat.imageUrl} alt={cat.nameRo} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl">
                {cat.icon || "📁"}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{cat.nameRo}</span>
              <Badge variant="secondary" className={`text-xs ${typeColors[cat.type] || ""}`}>
                {typeLabelKeys[cat.type] ? t(typeLabelKeys[cat.type]) : cat.type}
              </Badge>
              {cat.badge && (
                <Badge className="bg-gold/20 text-gold border-gold/40 text-[10px]">
                  {cat.badge}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              /{cat.slug}
              {cat.priceFrom
                ? ` · ${t("admin.categoriesPage.priceFrom", { price: cat.priceFrom })}`
                : ""}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onEdit(cat)}
            className="gap-1 shrink-0"
          >
            <Pencil className="h-3.5 w-3.5" /> {t("admin.categoriesPage.edit")}
          </Button>
          <Switch checked={cat.isActive} disabled />
        </CardContent>
      </Card>
    </div>
  );
}

export default function CategoriesPage() {
  const { t } = useLocale();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Category | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [badge, setBadge] = useState("");
  const [shortDesc, setShortDesc] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDesc, setSeoDesc] = useState("");
  const [seoBody, setSeoBody] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  async function loadCategories() {
    try {
      const res = await fetch("/api/categories", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setCategories(Array.isArray(data) ? data : []);
      }
    } catch {
      toast.error(t("admin.categoriesPage.loadError"));
    }
  }

  useEffect(() => {
    (async () => {
      await loadCategories();
      setLoading(false);
    })();
  }, []);

  function openEdit(cat: Category) {
    setEditing(cat);
    setImageUrl(cat.imageUrl || "");
    setImageAlt(cat.imageAlt || "");
    setBadge(cat.badge || "");
    setShortDesc(cat.descriptionRo || "");
    setSeoTitle(cat.seoTitleRo || "");
    setSeoDesc(cat.seoDescRo || "");
    setSeoBody(cat.seoBodyRo || "");
  }

  function closeEdit() {
    setEditing(null);
    setImageUrl("");
    setImageAlt("");
    setBadge("");
    setShortDesc("");
    setSeoTitle("");
    setSeoDesc("");
    setSeoBody("");
  }

  async function handleFileUpload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "categories");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || t("admin.categoriesPage.uploadFailed"));
        return;
      }
      const data = await res.json();
      setImageUrl(data.url);
      toast.success(t("admin.categoriesPage.imageUploaded"));
    } finally {
      setUploading(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/categories/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: imageUrl || null,
          imageAlt: imageAlt.trim() || null,
          badge: badge.trim() || null,
          descriptionRo: shortDesc.trim() || null,
          seoTitleRo: seoTitle.trim() || null,
          seoDescRo: seoDesc.trim() || null,
          seoBodyRo: seoBody.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || t("admin.categoriesPage.saveError"));
        return;
      }
      toast.success(t("admin.categoriesPage.updated"));
      await loadCategories();
      closeEdit();
    } finally {
      setSaving(false);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = categories.findIndex((c) => c.id === active.id);
    const newIndex = categories.findIndex((c) => c.id === over.id);
    const reordered = arrayMove(categories, oldIndex, newIndex);
    setCategories(reordered);

    const items = reordered.map((c, i) => ({ id: c.id, sortOrder: i }));
    try {
      const res = await fetch("/api/categories/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error();
      toast.success(t("admin.categoriesPage.orderSaved"));
    } catch {
      toast.error(t("admin.categoriesPage.orderError"));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">
            {t("admin.categoriesPage.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("admin.categoriesPage.subtitle", { count: categories.length })}
          </p>
        </div>
      </div>

      {categories.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("admin.categoriesPage.empty")}
          </CardContent>
        </Card>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {categories.map((cat) => (
                <SortableCategoryCard key={cat.id} cat={cat} onEdit={openEdit} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && closeEdit()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t("admin.categoriesPage.dialogTitle", { name: editing?.nameRo ?? "" })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {/* Image */}
            <div>
              <Label className="mb-2 block">
                {t("admin.categoriesPage.backgroundImage")}
              </Label>
              <div className="flex flex-col gap-3">
                {imageUrl ? (
                  <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-border/40">
                    <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setImageUrl("")}
                      className="absolute right-2 top-2 rounded-full bg-black/70 p-1.5 text-white hover:bg-black"
                      aria-label={t("admin.categoriesPage.removeImage")}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center rounded-lg border-2 border-dashed border-border/40 bg-muted/30 text-muted-foreground">
                    <div className="text-center">
                      <ImageIcon className="mx-auto mb-1 h-8 w-8 opacity-40" />
                      <p className="text-xs">
                        {t("admin.categoriesPage.noFileSelected")}
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleFileUpload(f);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="gap-1.5"
                  >
                    {uploading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    {imageUrl
                      ? t("admin.categoriesPage.changeFile")
                      : t("admin.categoriesPage.uploadFile")}
                  </Button>
                  <Input
                    placeholder={t("admin.categoriesPage.pasteUrl")}
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>

            {/* Image alt text — HTML alt attribute, used for SEO + screen
                readers. Falls back to the category name when empty. */}
            <div>
              <Label htmlFor="imageAlt" className="mb-2 block">
                {t("admin.categoriesPage.altLabel")}
              </Label>
              <Input
                id="imageAlt"
                placeholder={t("admin.categoriesPage.altPlaceholder")}
                value={imageAlt}
                onChange={(e) => setImageAlt(e.target.value)}
                maxLength={200}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t("admin.categoriesPage.altHint")}
              </p>
            </div>

            {/* Badge */}
            <div>
              <Label htmlFor="badge" className="mb-2 block">
                {t("admin.categoriesPage.badgeLabel")}
              </Label>
              <Input
                id="badge"
                placeholder={t("admin.categoriesPage.badgePlaceholder")}
                value={badge}
                onChange={(e) => setBadge(e.target.value)}
                maxLength={40}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t("admin.categoriesPage.badgeHint")}
              </p>
            </div>

            {/* Short description — shown above the artist grid as hero text. */}
            <div>
              <Label htmlFor="shortDesc" className="mb-2 block">
                {t("admin.categoriesPage.shortDescLabel")}
              </Label>
              <textarea
                id="shortDesc"
                placeholder={t("admin.categoriesPage.shortDescPlaceholder")}
                value={shortDesc}
                onChange={(e) => setShortDesc(e.target.value)}
                maxLength={500}
                rows={2}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                {t("admin.categoriesPage.shortDescCounter", { count: shortDesc.length })}
              </p>
            </div>

            {/* SEO — title + description rendered on /categorie/[slug]. */}
            <div className="rounded-lg border border-border/40 bg-muted/20 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-gold">
                {t("admin.categoriesPage.seoSection")}
              </p>
              <div>
                <Label htmlFor="seoTitle" className="mb-2 block">
                  {t("admin.categoriesPage.seoTitleLabel")}
                </Label>
                <Input
                  id="seoTitle"
                  placeholder={t("admin.categoriesPage.seoTitlePlaceholder")}
                  value={seoTitle}
                  onChange={(e) => setSeoTitle(e.target.value)}
                  maxLength={70}
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {t("admin.categoriesPage.seoTitleCounter", { count: seoTitle.length })}
                </p>
              </div>
              <div>
                <Label htmlFor="seoDesc" className="mb-2 block">
                  {t("admin.categoriesPage.seoDescLabel")}
                </Label>
                <textarea
                  id="seoDesc"
                  placeholder={t("admin.categoriesPage.seoDescPlaceholder")}
                  value={seoDesc}
                  onChange={(e) => setSeoDesc(e.target.value)}
                  maxLength={200}
                  rows={3}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {t("admin.categoriesPage.seoDescCounter", { count: seoDesc.length })}
                </p>
              </div>
              {/* SERP preview */}
              {(seoTitle || seoDesc) && (
                <div className="rounded-md border border-border/40 bg-background p-3 text-left">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    {t("admin.categoriesPage.googlePreview")}
                  </p>
                  <p className="text-blue-500 text-base font-medium leading-tight truncate">
                    {seoTitle || `${editing?.nameRo} — ePetrecere.md`}
                  </p>
                  <p className="text-emerald-700 dark:text-emerald-400 text-xs">
                    epetrecere.md › categorie › {editing?.slug}
                  </p>
                  <p className="text-muted-foreground text-xs mt-0.5 line-clamp-2">
                    {seoDesc ||
                      t("admin.categoriesPage.serpDescFallback", {
                        name: editing?.nameRo?.toLowerCase() ?? "",
                      })}
                  </p>
                </div>
              )}
            </div>

            {/* SEO body — long content rendered below the listing. */}
            <div>
              <Label htmlFor="seoBody" className="mb-2 block">
                {t("admin.categoriesPage.seoBodyLabel")}
              </Label>
              <textarea
                id="seoBody"
                placeholder={t("admin.categoriesPage.seoBodyPlaceholder")}
                value={seoBody}
                onChange={(e) => setSeoBody(e.target.value)}
                maxLength={8000}
                rows={10}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                {t("admin.categoriesPage.seoBodyCounter", { count: seoBody.length })}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEdit}>
              {t("admin.categoriesPage.cancel")}
            </Button>
            <Button
              onClick={saveEdit}
              disabled={saving || uploading}
              className="bg-gold text-[#0D0D0D] hover:bg-gold-dark gap-1.5"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("admin.categoriesPage.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
