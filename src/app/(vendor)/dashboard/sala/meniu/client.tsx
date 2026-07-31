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
  priceMdl: number | null;
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
  { value: "salad", label: "🥗 Salată / Aperitiv", Icon: Salad },
  { value: "beef", label: "🍖 Fel principal", Icon: Beef },
  { value: "cake", label: "🍰 Desert", Icon: Cake },
  { value: "wine", label: "🍷 Băuturi alcoolice", Icon: Wine },
  { value: "coffee", label: "🥤 Băuturi non-alcoolice", Icon: Coffee },
  { value: "utensils", label: "🍽 Altele", Icon: UtensilsCrossed },
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
      !confirm(
        "Trimit tot meniul la Claude pentru traducere în RU + EN. Cele care au deja traduceri vor fi ignorate. Continui?",
      )
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
        toast.error(err.error || "Traducere eșuată");
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
        toast.success(data.message || "Tot meniul are deja traduceri");
      } else {
        toast.success(
          `Traduse ${data.translated} nume (${data.categories} categorii · ${data.items} produse · ${data.packages} pachete)`,
        );
      }
      router.refresh();
    } finally {
      setTranslating(false);
    }
  }

  async function uploadMenuPdf(file: File) {
    if (file.type !== "application/pdf") {
      toast.error("Doar fișiere PDF sunt acceptate");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Fișierul e prea mare (max 10MB)");
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
        toast.error(err.error || "Upload eșuat");
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
        toast.error("Nu s-a putut salva pe sală");
        return;
      }
      setMenuPdfUrl(upData.url);
      toast.success("Meniu PDF încărcat");
    } finally {
      setUploadingPdf(false);
    }
  }

  async function removeMenuPdf() {
    if (!confirm("Sigur ștergi meniul PDF?")) return;
    setUploadingPdf(true);
    try {
      const res = await fetch(`/api/venues/${venueId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menuPdfUrl: "" }),
      });
      if (!res.ok) {
        toast.error("Nu s-a putut șterge");
        return;
      }
      setMenuPdfUrl(null);
      toast.success("Meniu PDF șters");
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
      throw new Error(err.error || "Eroare");
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
      toast.error("Numele este obligatoriu");
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
      toast.success("Salvat");
      setCatDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eroare");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCategory(c: Category) {
    if (!confirm(`Ștergi categoria "${c.nameRo}" și toate preparatele din ea?`)) return;
    try {
      await api({ action: "delete_category", venueId, id: c.id });
      setCategories((prev) => prev.filter((x) => x.id !== c.id));
      setItems((prev) => prev.filter((i) => i.categoryId !== c.id));
      toast.success("Categorie ștearsă");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eroare");
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
      toast.success("Salvat");
      setItemDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eroare");
    } finally {
      setBusy(false);
    }
  }

  async function deleteItem(i: Item) {
    if (!confirm(`Ștergi "${i.nameRo}"?`)) return;
    try {
      await api({ action: "delete_item", venueId, id: i.id });
      setItems((prev) => prev.filter((x) => x.id !== i.id));
      toast.success("Șters");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eroare");
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
      toast.error("Preț invalid");
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
      toast.success("Salvat");
      setPkgDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eroare");
    } finally {
      setBusy(false);
    }
  }

  async function deletePackage(p: Package) {
    if (!confirm(`Ștergi pachetul "${p.nameRo}"?`)) return;
    try {
      await api({ action: "delete_package", venueId, id: p.id });
      setPackages((prev) => prev.filter((x) => x.id !== p.id));
      toast.success("Șters");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eroare");
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
      toast.success(!p.isRecommended ? "Marcat ca recomandat" : "Nu mai e recomandat");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eroare");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Meniu Digital</h1>
          <p className="text-muted-foreground">
            Gestionează meniul pentru <strong>{venueName}</strong>. Va apărea pe
            profilul public al sălii.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasMenu && (
            <Button
              variant="outline"
              onClick={translateAll}
              disabled={translating}
              className="gap-2"
              title="Traduce toate numele categoriilor, produselor și pachetelor în Rusă și Engleză"
            >
              {translating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <span className="text-sm">🌐</span>
              )}
              Traduce RU + EN
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
            {showScanner ? "Închide scanarea" : "Scanează meniul cu AI"}
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
                  <p className="font-medium">Meniu PDF încărcat</p>
                  <p className="text-xs text-muted-foreground">
                    Apare ca buton „Descarcă meniu PDF” pe profilul public.
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
                  Deschide PDF
                </a>
                <button
                  type="button"
                  onClick={removeMenuPdf}
                  disabled={uploadingPdf}
                  className="rounded-md border border-red-500/40 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
                >
                  {uploadingPdf ? "..." : "Șterge"}
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
                  <p className="font-medium">Încarcă meniu PDF (opțional)</p>
                  <p className="text-xs text-muted-foreground">
                    Alternativă rapidă: încarcă PDF-ul existent în loc de meniu digital item-by-item. Ambele opțiuni pot coexista.
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
                    <Loader2 className="h-3 w-3 animate-spin" /> Încarcă...
                  </span>
                ) : (
                  "Alege PDF"
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
            <h2 className="font-heading text-xl font-semibold">Pachete</h2>
            <p className="text-xs text-muted-foreground">
              Oferte complete per persoană (Standard / Premium / Lux)
            </p>
          </div>
          <Button
            onClick={openAddPackage}
            className="gap-1.5 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
          >
            <Plus className="h-4 w-4" /> Pachet nou
          </Button>
        </div>
        {packages.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-sm text-muted-foreground">
                Niciun pachet încă. Adaugă primul pachet pentru a-ți prezenta
                oferta clienților.
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
                    RECOMANDAT
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
                        aria-label="Toggle recomandat"
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
                        aria-label="Editează"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deletePackage(p)}
                        className="rounded-md p-1.5 text-muted-foreground hover:text-red-500"
                        aria-label="Șterge"
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
                      {p.currency || "EUR"} / persoană
                    </span>
                  </div>
                  {p.minGuests && (
                    <p className="mb-2 text-xs text-muted-foreground">
                      Min. {p.minGuests} persoane
                    </p>
                  )}
                  {p.includes && (
                    <div className="mb-2">
                      <p className="text-xs font-medium uppercase tracking-wider text-emerald-500">
                        Include
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm">
                        {p.includes}
                      </p>
                    </div>
                  )}
                  {p.excludes && (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-red-400">
                        Nu include
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
            <h2 className="font-heading text-xl font-semibold">Categorii & Preparate</h2>
            <p className="text-xs text-muted-foreground">
              Ex: Aperitive, Preparate Calde, Deserturi, Băuturi
            </p>
          </div>
          <Button
            onClick={openAddCategory}
            variant="outline"
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" /> Categorie nouă
          </Button>
        </div>

        {categories.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <UtensilsCrossed className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                Nicio categorie încă. Adaugă prima categorie (ex: Aperitive) și apoi adaugă preparatele în ea.
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
                          <Plus className="h-3 w-3" /> Preparat
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
                        Niciun preparat. Adaugă primul.
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
              {editingCat ? "Editează categorie" : "Categorie nouă"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nume categorie</Label>
              <Input
                className="mt-1"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="Ex: Aperitive reci"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs">Iconiță</Label>
              <Select value={catIcon} onValueChange={(v) => setCatIcon(v ?? "utensils")}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ICON_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
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
              Anulează
            </Button>
            <Button
              onClick={saveCategory}
              disabled={busy}
              className="bg-gold text-[#0D0D0D] hover:bg-gold-dark"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Salvează
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Item Dialog */}
      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingItem ? "Editează preparat" : "Preparat nou"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nume</Label>
              <Input
                className="mt-1"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="Ex: Salată Caesar"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs">Descriere (opțional)</Label>
              <Textarea
                className="mt-1"
                value={itemDesc}
                onChange={(e) => setItemDesc(e.target.value)}
                rows={2}
                placeholder="Salată romană, pui, parmezan, sos Caesar..."
              />
            </div>
            <div>
              <Label className="text-xs">Preț per persoană (€)</Label>
              <Input
                className="mt-1"
                type="number"
                min="0"
                value={itemPriceEur}
                onChange={(e) => setItemPriceEur(e.target.value)}
                placeholder="Ex: 12"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setItemDialogOpen(false)}
              disabled={busy}
            >
              Anulează
            </Button>
            <Button
              onClick={saveItem}
              disabled={busy}
              className="bg-gold text-[#0D0D0D] hover:bg-gold-dark"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Salvează
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Package Dialog */}
      <Dialog open={pkgDialogOpen} onOpenChange={setPkgDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingPkg ? "Editează pachet" : "Pachet nou"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nume pachet</Label>
              <Input
                className="mt-1"
                value={pkgName}
                onChange={(e) => setPkgName(e.target.value)}
                placeholder="Ex: Pachet Standard"
                autoFocus
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Preț / persoană (€)</Label>
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
                <Label className="text-xs">Minim persoane</Label>
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
              <Label className="text-xs">Ce include</Label>
              <Textarea
                className="mt-1"
                value={pkgIncludes}
                onChange={(e) => setPkgIncludes(e.target.value)}
                rows={4}
                placeholder="3 aperitive, 2 preparate calde, 1 desert, apă + sucuri nelimitate, vin de casă"
              />
            </div>
            <div>
              <Label className="text-xs">Ce NU include (opțional)</Label>
              <Textarea
                className="mt-1"
                value={pkgExcludes}
                onChange={(e) => setPkgExcludes(e.target.value)}
                rows={2}
                placeholder="băuturi tari, tort"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPkgDialogOpen(false)}
              disabled={busy}
            >
              Anulează
            </Button>
            <Button
              onClick={savePackage}
              disabled={busy}
              className="bg-gold text-[#0D0D0D] hover:bg-gold-dark"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Salvează
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
