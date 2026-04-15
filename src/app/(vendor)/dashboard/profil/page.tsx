"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const RichEditor = dynamic(
  () => import("@/components/shared/rich-editor").then((m) => m.RichEditor),
  { ssr: false },
);
import { GalleryManager } from "@/components/vendor/gallery-manager";
import { VideoManager } from "@/components/vendor/video-manager";
import { PackagesManager } from "@/components/vendor/packages-manager";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Save, Eye, Sparkles, Loader2, Search, Camera, Upload } from "lucide-react";
import { toast } from "sonner";

type ProfileData = {
  nameRo: string;
  location: string;
  phone: string;
  email: string;
  website: string;
  instagram: string;
  facebook: string;
  youtube: string;
  tiktok: string;
  priceFrom: number;
  showPrice: boolean;
  descriptionRo: string;
  descriptionRu: string;
  descriptionEn: string;
  calendarEnabled: boolean;
  bufferHours: number;
  autoReplyEnabled: boolean;
  autoReplyMessage: string;
  photoUrl: string;
  seoTitleRo: string;
  seoDescRo: string;
};

type Category = {
  id: number;
  nameRo: string;
};

const EMPTY: ProfileData = {
  nameRo: "",
  location: "",
  phone: "",
  email: "",
  website: "",
  instagram: "",
  facebook: "",
  youtube: "",
  tiktok: "",
  priceFrom: 0,
  showPrice: true,
  descriptionRo: "",
  descriptionRu: "",
  descriptionEn: "",
  calendarEnabled: false,
  bufferHours: 2,
  autoReplyEnabled: false,
  autoReplyMessage:
    "Mulțumim pentru cerere! Am primit-o și revin cu un răspuns în cel mai scurt timp posibil.",
  photoUrl: "",
  seoTitleRo: "",
  seoDescRo: "",
};

export default function VendorProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [artistId, setArtistId] = useState<number | null>(null);
  const [data, setData] = useState<ProfileData>(EMPTY);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [artistCategoryIds, setArtistCategoryIds] = useState<number[]>([]);

  // Hydrate from the signed-in user's artist row. F-A4 before this fix
  // used hardcoded empty values and silently discarded every edit.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Fetch artist data and categories in parallel
        const [artistRes, catRes] = await Promise.all([
          fetch("/api/me/artist", { cache: "no-store" }),
          fetch("/api/categories", { cache: "no-store" }),
        ]);
        if (!artistRes.ok) throw new Error("fetch failed");
        const json = await artistRes.json();
        if (cancelled) return;

        // Load categories for SEO auto-generation
        if (catRes.ok) {
          const cats = await catRes.json();
          if (!cancelled) setCategories(cats as Category[]);
        }

        if (!json.artist) {
          toast.error(
            "Nu ai încă un profil de artist — completează onboarding-ul.",
          );
          setLoading(false);
          return;
        }
        const a = json.artist as Record<string, unknown>;
        setArtistId((a.id as number) ?? null);
        setArtistCategoryIds((a.categoryIds as number[]) ?? []);
        setData({
          nameRo: (a.nameRo as string) ?? "",
          location: (a.location as string) ?? "",
          phone: (a.phone as string) ?? "",
          email: (a.email as string) ?? "",
          website: (a.website as string) ?? "",
          instagram: (a.instagram as string) ?? "",
          facebook: (a.facebook as string) ?? "",
          youtube: (a.youtube as string) ?? "",
          tiktok: (a.tiktok as string) ?? "",
          priceFrom: (a.priceFrom as number) ?? 0,
          showPrice: true,
          descriptionRo: (a.descriptionRo as string) ?? "",
          descriptionRu: (a.descriptionRu as string) ?? "",
          descriptionEn: (a.descriptionEn as string) ?? "",
          calendarEnabled: Boolean(a.calendarEnabled),
          bufferHours: (a.bufferHours as number) ?? 2,
          autoReplyEnabled: Boolean(a.autoReplyEnabled),
          autoReplyMessage:
            (a.autoReplyMessage as string) ?? EMPTY.autoReplyMessage,
          photoUrl: (a.photoUrl as string) ?? "",
          seoTitleRo: (a.seoTitleRo as string) ?? "",
          seoDescRo: (a.seoDescRo as string) ?? "",
        });
      } catch {
        if (!cancelled) toast.error("Nu am putut încărca profilul");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function update(partial: Partial<ProfileData>) {
    setData((prev) => ({ ...prev, ...partial }));
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selectează o imagine validă");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Imaginea nu poate depăși 10MB");
      return;
    }
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "avatars");
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Upload failed (${res.status})`);
      }
      const { url } = await res.json();
      update({ photoUrl: url });
      toast.success("Poza de profil încărcată! Nu uita să salvezi.");
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : "Nu s-a putut încărca imaginea";
      toast.error(msg);
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  }

  function toggleCategory(catId: number) {
    setArtistCategoryIds((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId],
    );
  }

  async function handleSave() {
    if (!artistId) {
      toast.error("Profil indisponibil");
      return;
    }
    setSaving(true);
    try {
      // Send only the editable schema fields — `showPrice` / `images` are
      // not persisted by this endpoint (showPrice is UI-only until we wire
      // a dedicated column; images live under /api/artist-images).
      const payload = {
        id: artistId,
        nameRo: data.nameRo,
        location: data.location,
        phone: data.phone,
        email: data.email,
        website: data.website,
        instagram: data.instagram,
        facebook: data.facebook,
        youtube: data.youtube,
        tiktok: data.tiktok,
        priceFrom: data.priceFrom,
        descriptionRo: data.descriptionRo,
        descriptionRu: data.descriptionRu,
        descriptionEn: data.descriptionEn,
        calendarEnabled: data.calendarEnabled,
        bufferHours: data.bufferHours,
        autoReplyEnabled: data.autoReplyEnabled,
        autoReplyMessage: data.autoReplyMessage,
        photoUrl: data.photoUrl || null,
        categoryIds: artistCategoryIds,
        seoTitleRo: data.seoTitleRo,
        seoDescRo: data.seoDescRo,
      };
      const res = await fetch("/api/artists/crud", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Save failed");
      }
      toast.success("Profilul a fost salvat!");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Eroare la salvarea profilului",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleAIImprove() {
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "description",
          name: data.nameRo,
          description: data.descriptionRo,
          language: "ro",
        }),
      });
      if (!res.ok) throw new Error();
      const result = await res.json();
      update({ descriptionRo: result.result });
      toast.success("Descriere îmbunătățită cu AI!");
    } catch {
      toast.error("AI indisponibil");
    }
  }

  async function handleAIGenerate() {
    if (!data.nameRo.trim()) {
      toast.error("Completează mai întâi numele artistic");
      return;
    }
    setGeneratingAI(true);
    try {
      // Resolve category names from the artist's categoryIds
      const categoryNames = artistCategoryIds
        .map((cid) => categories.find((c) => c.id === cid)?.nameRo)
        .filter(Boolean);
      const categoryLabel = categoryNames.length > 0
        ? categoryNames.join(", ")
        : "artist";

      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "generate-description",
          name: data.nameRo,
          category: categoryLabel,
          location: data.location || "",
          language: "ro",
        }),
      });
      if (!res.ok) throw new Error();
      const result = await res.json();
      update({ descriptionRo: result.result });
      toast.success("Descriere generată cu AI!");
    } catch {
      toast.error("AI indisponibil — încearcă din nou");
    } finally {
      setGeneratingAI(false);
    }
  }

  function handleAutoGenerateSEO() {
    // Resolve category names from the artist's categoryIds
    const categoryNames = artistCategoryIds
      .map((cid) => categories.find((c) => c.id === cid)?.nameRo)
      .filter(Boolean);
    const categoryLabel = categoryNames.length > 0
      ? categoryNames.join(", ")
      : "Artist";
    const locationLabel = data.location || "Moldova";

    // Title: max 60 chars
    const titleBase = `${data.nameRo} — ${categoryLabel} pentru Evenimente | ePetrecere.md`;
    const seoTitle = titleBase.length > 60
      ? `${data.nameRo} — ${categoryLabel} | ePetrecere.md`.substring(0, 60)
      : titleBase;

    // Description: max 155 chars
    const descBase = `Rezervă ${data.nameRo} pentru evenimentul tău. ${categoryLabel} din ${locationLabel}. Solicită preț pe ePetrecere.md`;
    const seoDesc = descBase.length > 155 ? descBase.substring(0, 152) + "..." : descBase;

    update({ seoTitleRo: seoTitle, seoDescRo: seoDesc });
    toast.success("SEO generat automat!");
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Profilul Meu</h1>
          <p className="text-sm text-muted-foreground">Editează informațiile și portofoliul tău</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2"><Eye className="h-4 w-4" /> Preview</Button>
          <Button onClick={handleSave} disabled={saving || !artistId} className="bg-gold text-background hover:bg-gold-dark gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvează
          </Button>
        </div>
      </div>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Informații</TabsTrigger>
          <TabsTrigger value="description">Descriere</TabsTrigger>
          <TabsTrigger value="gallery">Galerie</TabsTrigger>
          <TabsTrigger value="packages">Pachete</TabsTrigger>
          <TabsTrigger value="seo">SEO</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-6 space-y-6">
          {/* Profile Photo */}
          <Card>
            <CardHeader><CardTitle>Poza de Profil</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl border-2 border-gold/30 bg-muted">
                  {data.photoUrl ? (
                    <img src={data.photoUrl} alt="Profil" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-3xl text-muted-foreground">
                      <Camera className="h-8 w-8" />
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Aceasta este poza principală care apare pe cardul tău și în profil.
                  </p>
                  <div className="flex gap-2">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handlePhotoUpload}
                        disabled={uploadingPhoto}
                      />
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors">
                        {uploadingPhoto ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                        {data.photoUrl ? "Schimbă poza" : "Încarcă poza"}
                      </span>
                    </label>
                    {data.photoUrl && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => update({ photoUrl: "" })}
                      >
                        Șterge
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Categories */}
          <Card>
            <CardHeader>
              <CardTitle>Categorii</CardTitle>
              <p className="text-sm text-muted-foreground">Selectează categoriile în care activezi</p>
            </CardHeader>
            <CardContent>
              {/* Current categories as badges */}
              {artistCategoryIds.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {artistCategoryIds.map((cid) => {
                    const cat = categories.find((c) => c.id === cid);
                    return cat ? (
                      <Badge key={cid} variant="secondary" className="gap-1">
                        {cat.nameRo}
                        <button
                          type="button"
                          className="ml-1 text-muted-foreground hover:text-foreground"
                          onClick={() => toggleCategory(cid)}
                        >
                          ✕
                        </button>
                      </Badge>
                    ) : null;
                  })}
                </div>
              )}
              {artistCategoryIds.length === 0 && (
                <p className="mb-4 text-sm text-amber-600">Nu ai nicio categorie selectată. Alege cel puțin una.</p>
              )}
              {/* Category checkboxes */}
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {categories.map((cat) => (
                  <label
                    key={cat.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md border p-3 transition-colors hover:bg-accent"
                  >
                    <Checkbox
                      checked={artistCategoryIds.includes(cat.id)}
                      onCheckedChange={() => toggleCategory(cat.id)}
                    />
                    <span className="text-sm">{cat.nameRo}</span>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Informații de bază</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label>Nume artistic</Label><Input value={data.nameRo} onChange={(e) => update({ nameRo: e.target.value })} /></div>
                <div><Label>Locație</Label><Input value={data.location} onChange={(e) => update({ location: e.target.value })} /></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label>Telefon</Label><Input value={data.phone} onChange={(e) => update({ phone: e.target.value })} /></div>
                <div><Label>Email</Label><Input value={data.email} onChange={(e) => update({ email: e.target.value })} /></div>
              </div>
              <div><Label>Website</Label><Input value={data.website} onChange={(e) => update({ website: e.target.value })} /></div>
              <div className="grid gap-4 sm:grid-cols-4">
                <div><Label>Instagram</Label><Input value={data.instagram} onChange={(e) => update({ instagram: e.target.value })} /></div>
                <div><Label>Facebook</Label><Input value={data.facebook} onChange={(e) => update({ facebook: e.target.value })} /></div>
                <div><Label>YouTube</Label><Input value={data.youtube} onChange={(e) => update({ youtube: e.target.value })} /></div>
                <div><Label>TikTok</Label><Input value={data.tiktok} onChange={(e) => update({ tiktok: e.target.value })} /></div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Preț</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div><Label>Preț de la (€)</Label><Input type="number" value={data.priceFrom} onChange={(e) => update({ priceFrom: Number(e.target.value) })} /></div>
              <div><Label>Afișează prețul</Label><div className="mt-2"><Switch checked={data.showPrice} onCheckedChange={(v) => update({ showPrice: v })} /></div></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="description" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Descriere</CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={generatingAI}
                    onClick={handleAIGenerate}
                  >
                    {generatingAI ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 text-gold" />
                    )}
                    Generează cu AI
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1" onClick={handleAIImprove}>
                    <Sparkles className="h-3.5 w-3.5 text-gold" /> Îmbunătățește cu AI
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Descriere (RO)</Label><RichEditor content={data.descriptionRo} onChange={(html) => update({ descriptionRo: html })} /></div>
              <div><Label>Descriere (RU)</Label><RichEditor content={data.descriptionRu} onChange={(html) => update({ descriptionRu: html })} /></div>
              <div><Label>Descriere (EN)</Label><RichEditor content={data.descriptionEn} onChange={(html) => update({ descriptionEn: html })} /></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gallery" className="mt-6 space-y-6">
          <Card>
            <CardHeader><CardTitle>Galerie Foto</CardTitle></CardHeader>
            <CardContent>
              <GalleryManager artistId={artistId} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Videoclipuri</CardTitle></CardHeader>
            <CardContent>
              <VideoManager artistId={artistId} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="packages" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Pachete Servicii</CardTitle>
            </CardHeader>
            <CardContent>
              <PackagesManager artistId={artistId} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seo" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  SEO — Optimizare pentru Motoarele de Căutare
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={handleAutoGenerateSEO}
                >
                  <Sparkles className="h-3.5 w-3.5 text-gold" />
                  Auto-generează SEO
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Controlează cum apare profilul tău în rezultatele Google.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>
                  Meta Title{" "}
                  <span className="text-xs text-muted-foreground">
                    ({data.seoTitleRo.length}/60 caractere)
                  </span>
                </Label>
                <Input
                  value={data.seoTitleRo}
                  onChange={(e) => update({ seoTitleRo: e.target.value })}
                  maxLength={60}
                  placeholder="ex: DJ Andrei — DJ pentru Nunți | ePetrecere.md"
                />
                {data.seoTitleRo.length > 60 && (
                  <p className="mt-1 text-xs text-destructive">
                    Titlul depășește 60 de caractere și poate fi trunchiat în Google.
                  </p>
                )}
              </div>
              <div>
                <Label>
                  Meta Description{" "}
                  <span className="text-xs text-muted-foreground">
                    ({data.seoDescRo.length}/155 caractere)
                  </span>
                </Label>
                <Textarea
                  value={data.seoDescRo}
                  onChange={(e) => update({ seoDescRo: e.target.value })}
                  maxLength={155}
                  rows={3}
                  placeholder="ex: Rezervă DJ Andrei pentru nunta ta. DJ profesionist din Chișinău. Solicită preț pe ePetrecere.md"
                />
                {data.seoDescRo.length > 155 && (
                  <p className="mt-1 text-xs text-destructive">
                    Descrierea depășește 155 de caractere și poate fi trunchiată în Google.
                  </p>
                )}
              </div>
              {/* Live preview of how it looks in search results */}
              {(data.seoTitleRo || data.seoDescRo) && (
                <div className="rounded-lg border bg-muted/30 p-4">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Previzualizare Google</p>
                  <p className="text-base text-blue-600 hover:underline">
                    {data.seoTitleRo || "Titlu pagină"}
                  </p>
                  <p className="text-xs text-green-700">
                    epetrecere.md/artisti/...
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {data.seoDescRo || "Descrierea paginii va apărea aici..."}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}
