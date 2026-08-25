"use client";

import { useState } from "react";
import {
  Plus,
  Trash2,
  Edit2,
  UtensilsCrossed,
  Wine,
  Coffee,
  Cake,
  Salad,
  Beef,
  Loader2,
  Star,
  Check,
  FileText,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { MenuScanner } from "@/components/vendor/menu-scanner";
import { Sparkles } from "lucide-react";
import { formatPrice, currencySymbol } from "@/lib/format/price";
import { useLocale } from "@/hooks/use-locale";

interface Category {
  id: number;
  venueId: number;
  nameRo: string;
  icon: string | null;
  sortOrder: number | null;
}

interface Item {
  id: number;
  categoryId: number;
  nameRo: string;
  descriptionRo: string | null;
  priceEur: number | null;
  sortOrder: number | null;
}

interface Package {
  id: number;
  venueId: number;
  nameRo: string;
  pricePerPerson: number;
  currency: string | null;
  includes: string | null;
  excludes: string | null;
  minGuests: number | null;
  isRecommended: boolean;
  sortOrder: number | null;
}

interface Props {
  venueId: number;
  venueName: string;
  existingMenuUrl: string | null;
  existingMenuPdfUrl: string | null;
  initialCategories: Category[];
  initialItems: Item[];
  initialPackages: Package[];
}

const ICON_OPTIONS = [
  { value: "salad", labelKey: "vendorMenu.iconSalad", Icon: Salad },
  { value: "beef", labelKey: "vendorMenu.iconBeef", Icon: Beef },
  { value: "cake", labelKey: "vendorMenu.iconCake", Icon: Cake },
  { value: "wine", labelKey: "vendorMenu.iconWine", Icon: Wine },
  { value: "coffee", labelKey: "vendorMenu.iconCoffee", Icon: Coffee },
  { value: "utensils", labelKey: "vendorMenu.iconUtensils", Icon: UtensilsCrossed },
];

function iconComponent(icon: string | null) {
  const found = ICON_OPTIONS.find((o) => o.value === icon);
  return found?.Icon || UtensilsCrossed;
}

export function VenueMenuClient({
  venueId,
  venueName,
  existingMenuUrl: _existingMenuUrl,
  existingMenuPdfUrl,
  initialCategories,
  initialItems,
  initialPackages,
}: Props) {
  const { t } = useLocale();
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [items, setItems] = useState<Item[]>(initialItems);
  const [packages, setPackages] = useState<Package[]>(initialPackages);
  const [busy, setBusy] = useState(false);
  const [menuPdfUrl, setMenuPdfUrl] = useState<string | null>(existingMenuPdfUrl);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [translating, setTranslating] = useState(false);

  const hasMenu = categories.length > 0 || packages.length > 0;

  async function translateAll() {
    if (
      !confirm(t("vendorMenu.translateConfirm"))
    ) {
      return;
    }
    setTranslating(true);
    try {
      const res = await fetch("/api/venue-menu/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId, overwrite: false }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || t("vendorMenu.translateFailed"));
        return;
      }
      const data = (await res.json()) as {
        translated: number;
        categories: number;
        items: number;
        packages: number;
        message?: string;
      };
      if (data.translated === 0) {
        toast.success(data.message || t("vendorMenu.alreadyTranslated"));
      } else {
        toast.success(
          t("vendorMenu.translatedCount", {
            count: data.translated,
            categories: data.categories,
            items: data.items,
            packages: data.packages,
          }),
        );
      }
      router.refresh();
    } finally {
      setTranslating(false);
    }
  }

  async function uploadMenuPdf(file: File) {
    if (file.type !== "application/pdf") {
      toast.error(t("vendorMenu.onlyPdf"));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t("vendorMenu.fileTooLarge"));
      return;
    }
    setUploadingPdf(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "venues");
      const upRes = await fetch("/api/upload", { method: "POST", body: fd });
      if (!upRes.ok) {
        const err = await upRes.json().catch(() => ({}));
        toast.error(err.error || t("vendorMenu.uploadFailed"));
        return;
      }
      const upData = (await upRes.json()) as { url: string };

      // Persist URL on the venue
      const res = await fetch(`/api/venues/${venueId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menuPdfUrl: upData.url }),
      });
      if (!res.ok) {
        toast.error(t("vendorMenu.savePdfFailed"));
        return;
      }
      setMenuPdfUrl(upData.url);
      toast.success(t("vendorMenu.pdfUploaded"));
    } finally {
      setUploadingPdf(false);
    }
  }

  async function removeMenuPdf() {
    if (!confirm(t("vendorMenu.deletePdfConfirm"))) return;
    setUploadingPdf(true);
    try {
      const res = await fetch(`/api/venues/${venueId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menuPdfUrl: "" }),
      });
      if (!res.ok) {
        toast.error(t("vendorMenu.deleteFailed"));
        return;
      }
      setMenuPdfUrl(null);
      toast.success(t("vendorMenu.pdfDeleted"));
    } finally {
      setUploadingPdf(false);
    }
  }

  // Category dialog state
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catName, setCatName] = useState("");
  const [catIcon, setCatIcon] = useState("utensils");

  // Item dialog state
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [itemCategoryId, setItemCategoryId] = useState<number | null>(null);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [itemName, setItemName] = useState("");
  const [itemDesc, setItemDesc] = useState("");
  const [itemPriceEur, setItemPriceEur] = useState("");

  // Package dialog state
  const [pkgDialogOpen, setPkgDialogOpen] = useState(false);
  const [editingPkg, setEditingPkg] = useState<Package | null>(null);
  const [pkgName, setPkgName] = useState("");
  const [pkgPrice, setPkgPrice] = useState("");
  const [pkgIncludes, setPkgIncludes] = useState("");
  const [pkgExcludes, setPkgExcludes] = useState("");
  const [pkgMinGuests, setPkgMinGuests] = useState("");

  async function api(body: Record<string, unknown>) {
    const res = await fetch("/api/venue-menu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || t("vendorMenu.genericError"));
    }
    return res.json();
  }

  function openAddCategory() {
    setEditingCat(null);
    setCatName("");
    setCatIcon("utensils");
    setCatDialogOpen(true);
  }

  function openEditCategory(c: Category) {
    setEditingCat(c);
    setCatName(c.nameRo);
    setCatIcon(c.icon || "utensils");
    setCatDialogOpen(true);
  }

  async function saveCategory() {
    if (!catName.trim()) {
      toast.error(t("vendorMenu.nameRequired"));
      return;
    }
    setBusy(true);
    try {
      if (editingCat) {
        const res = await api({
          action: "update_category",
          venueId,
          id: editingCat.id,
          nameRo: catName.trim(),
          icon: catIcon,
        });
        setCategories((prev) =>
          prev.map((c) => (c.id === editingCat.id ? res.category : c)),
        );
      } else {
        const res = await api({
          action: "create_category",
          venueId,
          nameRo: catName.trim(),
          icon: catIcon,
        });
        setCategories((prev) => [...prev, res.category]);
      }
      toast.success(t("vendorMenu.saved"));
      setCatDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("vendorMenu.genericError"));
    } finally {
      setBusy(false);
    }
  }

  async function deleteCategory(c: Category) {
    if (!confirm(t("vendorMenu.deleteCategoryConfirm", { name: c.nameRo }))) return;
    try {
      await api({ action: "delete_category", venueId, id: c.id });
      setCategories((prev) => prev.filter((x) => x.id !== c.id));
      setItems((prev) => prev.filter((i) => i.categoryId !== c.id));
      toast.success(t("vendorMenu.categoryDeleted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("vendorMenu.genericError"));
    }
  }

  function openAddItem(categoryId: number) {
    setItemCategoryId(categoryId);
    setEditingItem(null);
    setItemName("");
    setItemDesc("");
    setItemPriceEur("");
    setItemDialogOpen(true);
  }

  function openEditItem(item: Item) {
    setItemCategoryId(item.categoryId);
    setEditingItem(item);
    setItemName(item.nameRo);
    setItemDesc(item.descriptionRo || "");
    setItemPriceEur(item.priceEur !== null ? String(item.priceEur) : "");
    setItemDialogOpen(true);
  }

  async function saveItem() {
    if (!itemName.trim() || !itemCategoryId) return;
    setBusy(true);
    try {
      const priceEurNum = itemPriceEur ? Number(itemPriceEur) : null;
      if (editingItem) {
        const res = await api({
          action: "update_item",
          venueId,
          id: editingItem.id,
          nameRo: itemName.trim(),
          descriptionRo: itemDesc.trim() || null,
          priceEur: priceEurNum,
        });
        setItems((prev) =>
          prev.map((i) => (i.id === editingItem.id ? res.item : i)),
        );
      } else {
        const res = await api({
          action: "create_item",
          venueId,
          categoryId: itemCategoryId,
          nameRo: itemName.trim(),
          descriptionRo: itemDesc.trim() || undefined,
          priceEur: priceEurNum,
        });
        setItems((prev) => [...prev, res.item]);
      }
      toast.success(t("vendorMenu.saved"));
      setItemDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("vendorMenu.genericError"));
    } finally {
      setBusy(false);
    }
  }

  async function deleteItem(i: Item) {
    if (!confirm(t("vendorMenu.deleteItemConfirm", { name: i.nameRo }))) return;
    try {
      await api({ action: "delete_item", venueId, id: i.id });
      setItems((prev) => prev.filter((x) => x.id !== i.id));
      toast.success(t("vendorMenu.deleted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("vendorMenu.genericError"));
    }
  }

  function openAddPackage() {
    setEditingPkg(null);
    setPkgName("");
    setPkgPrice("");
    setPkgIncludes("");
    setPkgExcludes("");
    setPkgMinGuests("");
    setPkgDialogOpen(true);
  }

  function openEditPackage(p: Package) {
    setEditingPkg(p);
    setPkgName(p.nameRo);
    setPkgPrice(String(p.pricePerPerson));
    setPkgIncludes(p.includes || "");
    setPkgExcludes(p.excludes || "");
    setPkgMinGuests(p.minGuests !== null ? String(p.minGuests) : "");
    setPkgDialogOpen(true);
  }

  async function savePackage() {
    if (!pkgName.trim() || !pkgPrice) return;
    const priceNum = Number(pkgPrice);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      toast.error(t("vendorMenu.invalidPrice"));
      return;
    }
    setBusy(true);
    try {
      const minGuestsNum = pkgMinGuests ? Number(pkgMinGuests) : null;
      if (editingPkg) {
        const res = await api({
          action: "update_package",
          venueId,
          id: editingPkg.id,
          nameRo: pkgName.trim(),
          pricePerPerson: priceNum,
          includes: pkgIncludes.trim() || null,
          excludes: pkgExcludes.trim() || null,
          minGuests: minGuestsNum,
        });
        setPackages((prev) =>
          prev.map((p) => (p.id === editingPkg.id ? res.package : p)),
        );
      } else {
        const res = await api({
          action: "create_package",
          venueId,
          nameRo: pkgName.trim(),
          pricePerPerson: priceNum,
          includes: pkgIncludes.trim() || undefined,
          excludes: pkgExcludes.trim() || undefined,
          minGuests: minGuestsNum ?? undefined,
        });
        setPackages((prev) => [...prev, res.package]);
      }
      toast.success(t("vendorMenu.saved"));
      setPkgDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("vendorMenu.genericError"));
    } finally {
      setBusy(false);
    }
  }

  async function deletePackage(p: Package) {
    if (!confirm(t("vendorMenu.deletePackageConfirm", { name: p.nameRo }))) return;
    try {
      await api({ action: "delete_package", venueId, id: p.id });
      setPackages((prev) => prev.filter((x) => x.id !== p.id));
      toast.success(t("vendorMenu.deleted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("vendorMenu.genericError"));
    }
  }

  async function toggleRecommended(p: Package) {
    try {
      const res = await api({
        action: "update_package",
        venueId,
        id: p.id,
        isRecommended: !p.isRecommended,
      });
      setPackages((prev) =>
        prev.map((x) => ({
          ...x,
          isRecommended:
            x.id === p.id
              ? res.package.isRecommended
              : !p.isRecommended
                ? false
                : x.isRecommended,
        })),
      );
      toast.success(
        !p.isRecommended
          ? t("vendorMenu.markedRecommended")
          : t("vendorMenu.unmarkedRecommended"),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("vendorMenu.genericError"));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">{t("vendorMenu.title")}</h1>
          <p className="text-muted-foreground">
            {t("vendorMenu.subtitlePrefix")} <strong>{venueName}</strong>{". "}
            {t("vendorMenu.subtitleSuffix")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasMenu && (
            <Button
              variant="outline"
              onClick={translateAll}
              disabled={translating}
              className="gap-2"
              title={t("vendorMenu.translateTitle")}
            >
              {translating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <span className="text-sm">🌐</span>
              )}
              {t("vendorMenu.translateButton")}
            </Button>
          )}
          <Button
            variant={showScanner ? "default" : "outline"}
            onClick={() => setShowScanner((v) => !v)}
            className={cn(
              "gap-2",
              showScanner && "bg-gold text-[#0D0D0D] hover:bg-gold-dark",
            )}
          >
            <Sparkles className="h-4 w-4" />
            {showScanner ? t("vendorMenu.closeScanner") : t("vendorMenu.openScanner")}
          </Button>
        </div>
      </div>

      {/* AI scanner — image/PDF → editable preview → import */}
      {showScanner && (
        <MenuScanner
          venueId={venueId}
          onImported={() => {
            setShowScanner(false);
            // Refresh the server-side list so imported rows show up.
            router.refresh();
          }}
        />
      )}

      {/* PDF upload alternative */}
      <Card>
        <CardContent className="p-4">
          {menuPdfUrl ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-gold/10 p-2 text-gold">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">{t("vendorMenu.pdfUploaded")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("vendorMenu.pdfPublicHint")}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <a
                  href={menuPdfUrl}
                  target="_blank"
                  rel="noopener"
                  className="rounded-md border border-border/60 px-3 py-1.5 text-xs hover:bg-muted"
                >
                  {t("vendorMenu.openPdf")}
                </a>
                <button
                  type="button"
                  onClick={removeMenuPdf}
                  disabled={uploadingPdf}
                  className="rounded-md border border-red-500/40 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
                >
                  {uploadingPdf ? "..." : t("common.delete")}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-muted/40 p-2 text-muted-foreground">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">{t("vendorMenu.uploadPdfTitle")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("vendorMenu.uploadPdfHint")}
                  </p>
                </div>
              </div>
              <label
                className={cn(
                  "cursor-pointer rounded-md bg-gold px-3 py-1.5 text-xs font-medium text-[#0D0D0D] hover:bg-gold-dark",
                  uploadingPdf && "pointer-events-none opacity-60",
                )}
              >
                {uploadingPdf ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> {t("vendorMenu.uploading")}
                  </span>
                ) : (
                  t("vendorMenu.choosePdf")
                )}
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  disabled={uploadingPdf}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadMenuPdf(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          )}
        </CardContent>
      </Card>

      {/* PACKAGES SECTION */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-heading text-xl font-semibold">{t("vendorMenu.packagesHeading")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("vendorMenu.packagesHint")}
            </p>
          </div>
          <Button
            onClick={openAddPackage}
            className="gap-1.5 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
          >
            <Plus className="h-4 w-4" /> {t("vendorMenu.newPackage")}
          </Button>
        </div>
        {packages.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-sm text-muted-foreground">
                {t("vendorMenu.noPackages")}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {packages.map((p) => (
              <Card
                key={p.id}
                className={cn(
                  "relative",
                  p.isRecommended && "border-gold ring-2 ring-gold/30",
                )}
              >
                {p.isRecommended && (
                  <div className="absolute -top-2 right-4 rounded-full bg-gold px-3 py-0.5 text-[10px] font-bold text-[#0D0D0D]">
                    {t("venue.detail.recommended")}
                  </div>
                )}
                <CardContent className="p-5">
                  <div className="mb-2 flex items-start justify-between">
                    <h3 className="font-heading text-lg font-bold">{p.nameRo}</h3>
                    <div className="flex gap-1">
                      <button
                        onClick={() => toggleRecommended(p)}
                        className={cn(
                          "rounded-md p-1.5 transition-colors",
                          p.isRecommended
                            ? "text-gold"
                            : "text-muted-foreground hover:text-gold",
                        )}
                        aria-label={t("vendorMenu.toggleRecommended")}
                      >
                        <Star
                          className={cn(
                            "h-3.5 w-3.5",
                            p.isRecommended && "fill-gold",
                          )}
                        />
                      </button>
                      <button
                        onClick={() => openEditPackage(p)}
                        className="rounded-md p-1.5 text-muted-foreground hover:text-gold"
                        aria-label={t("common.edit")}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deletePackage(p)}
                        className="rounded-md p-1.5 text-muted-foreground hover:text-red-500"
                        aria-label={t("common.delete")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="mb-3 flex items-baseline gap-1">
                    <span className="font-heading text-3xl font-bold text-gold">
                      {p.pricePerPerson}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {currencySymbol(p.currency)} {t("vendorMenu.perPerson")}
                    </span>
                  </div>
                  {p.minGuests && (
                    <p className="mb-2 text-xs text-muted-foreground">
                      {t("vendorMenu.minGuests", { count: p.minGuests })}
                    </p>
                  )}
                  {p.includes && (
                    <div className="mb-2">
                      <p className="text-xs font-medium uppercase tracking-wider text-emerald-500">
                        {t("venue.detail.included")}
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm">
                        {p.includes}
                      </p>
                    </div>
                  )}
                  {p.excludes && (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-red-400">
                        {t("venue.detail.notIncluded")}
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">
                        {p.excludes}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* CATEGORIES SECTION */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-heading text-xl font-semibold">{t("vendorMenu.categoriesHeading")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("vendorMenu.categoriesHint")}
            </p>
          </div>
          <Button
            onClick={openAddCategory}
            variant="outline"
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" /> {t("vendorMenu.newCategory")}
          </Button>
        </div>

        {categories.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <UtensilsCrossed className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {t("vendorMenu.noCategories")}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {categories.map((c) => {
              const catItems = items.filter((i) => i.categoryId === c.id);
              const Icon = iconComponent(c.icon);
              return (
                <Card key={c.id}>
                  <CardContent className="p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="h-5 w-5 text-gold" />
                        <h3 className="font-heading text-base font-semibold">
                          {c.nameRo}
                        </h3>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                          {catItems.length}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openAddItem(c.id)}
                          className="gap-1 h-7 text-xs"
                        >
                          <Plus className="h-3 w-3" /> {t("vendorMenu.dish")}
                        </Button>
                        <button
                          onClick={() => openEditCategory(c)}
                          className="rounded-md p-1.5 text-muted-foreground hover:text-gold"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => deleteCategory(c)}
                          className="rounded-md p-1.5 text-muted-foreground hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    {catItems.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border/30 py-3 text-center text-xs text-muted-foreground">
                        {t("vendorMenu.noDishes")}
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {catItems.map((item) => (
                          <li
                            key={item.id}
                            className="group flex items-start justify-between gap-3 rounded-lg bg-muted/20 p-2.5"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-medium">{item.nameRo}</p>
                              {item.descriptionRo && (
                                <p className="text-xs text-muted-foreground">
                                  {item.descriptionRo}
                                </p>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {item.priceEur !== null && (
                                <span className="text-sm font-medium text-gold">
                                  {item.priceEur}€
                                </span>
                              )}
                              <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                <button
                                  onClick={() => openEditItem(item)}
                                  className="rounded-md p-1 text-muted-foreground hover:text-gold"
                                >
                                  <Edit2 className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => deleteItem(item)}
                                  className="rounded-md p-1 text-muted-foreground hover:text-red-500"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Category Dialog */}
      <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCat ? t("vendorMenu.editCategory") : t("vendorMenu.newCategory")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">{t("vendorMenu.categoryNameLabel")}</Label>
              <Input
                className="mt-1"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder={t("vendorMenu.categoryNamePlaceholder")}
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs">{t("vendorMenu.iconLabel")}</Label>
              <Select value={catIcon} onValueChange={(v) => setCatIcon(v ?? "utensils")}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ICON_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {t(o.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCatDialogOpen(false)}
              disabled={busy}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={saveCategory}
              disabled={busy}
              className="bg-gold text-[#0D0D0D] hover:bg-gold-dark"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Item Dialog */}
      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingItem ? t("vendorMenu.editItem") : t("vendorMenu.newItem")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">{t("vendorMenu.itemNameLabel")}</Label>
              <Input
                className="mt-1"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder={t("vendorMenu.itemNamePlaceholder")}
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs">{t("vendorMenu.descriptionLabel")}</Label>
              <Textarea
                className="mt-1"
                value={itemDesc}
                onChange={(e) => setItemDesc(e.target.value)}
                rows={2}
                placeholder={t("vendorMenu.descriptionPlaceholder")}
              />
            </div>
            <div>
              <Label className="text-xs">{t("vendorMenu.itemPriceLabel")}</Label>
              <Input
                className="mt-1"
                type="number"
                min="0"
                value={itemPriceEur}
                onChange={(e) => setItemPriceEur(e.target.value)}
                placeholder={t("vendorMenu.itemPricePlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setItemDialogOpen(false)}
              disabled={busy}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={saveItem}
              disabled={busy}
              className="bg-gold text-[#0D0D0D] hover:bg-gold-dark"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Package Dialog */}
      <Dialog open={pkgDialogOpen} onOpenChange={setPkgDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingPkg ? t("vendorMenu.editPackage") : t("vendorMenu.newPackage")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">{t("vendorMenu.packageNameLabel")}</Label>
              <Input
                className="mt-1"
                value={pkgName}
                onChange={(e) => setPkgName(e.target.value)}
                placeholder={t("vendorMenu.packageNamePlaceholder")}
                autoFocus
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">{t("vendorMenu.packagePriceLabel")}</Label>
                <Input
                  className="mt-1"
                  type="number"
                  min="0"
                  value={pkgPrice}
                  onChange={(e) => setPkgPrice(e.target.value)}
                  placeholder="35"
                />
              </div>
              <div>
                <Label className="text-xs">{t("vendorMenu.minGuestsLabel")}</Label>
                <Input
                  className="mt-1"
                  type="number"
                  min="0"
                  value={pkgMinGuests}
                  onChange={(e) => setPkgMinGuests(e.target.value)}
                  placeholder="80"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">{t("vendorMenu.includesLabel")}</Label>
              <Textarea
                className="mt-1"
                value={pkgIncludes}
                onChange={(e) => setPkgIncludes(e.target.value)}
                rows={4}
                placeholder={t("vendorMenu.includesPlaceholder")}
              />
            </div>
            <div>
              <Label className="text-xs">{t("vendorMenu.excludesLabel")}</Label>
              <Textarea
                className="mt-1"
                value={pkgExcludes}
                onChange={(e) => setPkgExcludes(e.target.value)}
                rows={2}
                placeholder={t("vendorMenu.excludesPlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPkgDialogOpen(false)}
              disabled={busy}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={savePackage}
              disabled={busy}
              className="bg-gold text-[#0D0D0D] hover:bg-gold-dark"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
