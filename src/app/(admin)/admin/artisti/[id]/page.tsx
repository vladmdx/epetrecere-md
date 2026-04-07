"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RichEditor } from "@/components/shared/rich-editor";
import { ImageUpload } from "@/components/shared/image-upload";
import { ArrowLeft, Save, Sparkles, Eye, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface ArtistData {
  id: number;
  nameRo: string; nameRu: string | null; nameEn: string | null;
  slug: string;
  descriptionRo: string | null; descriptionRu: string | null; descriptionEn: string | null;
  categoryIds: number[] | null;
  priceFrom: number | null; priceCurrency: string | null;
  location: string | null; phone: string | null; email: string | null;
  website: string | null; instagram: string | null; facebook: string | null;
  youtube: string | null; tiktok: string | null;
  isActive: boolean; isFeatured: boolean; isVerified: boolean; isPremium: boolean;
  calendarEnabled: boolean; bufferHours: number | null;
  seoTitleRo: string | null; seoTitleRu: string | null; seoTitleEn: string | null;
  seoDescRo: string | null; seoDescRu: string | null; seoDescEn: string | null;
  images: { id: number; url: string; altRo: string | null; isCover: boolean }[];
  videos: { id: number; platform: string; videoId: string; title: string | null }[];
}

export default function EditArtistPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const isNew = id === "new";

  const [artist, setArtist] = useState<Partial<ArtistData>>({
    nameRo: "", nameRu: "", nameEn: "", slug: "",
    descriptionRo: "", descriptionRu: "", descriptionEn: "",
    priceFrom: 0, location: "", phone: "", email: "",
    website: "", instagram: "", facebook: "", youtube: "", tiktok: "",
    isActive: false, isFeatured: false, isVerified: false, isPremium: false,
    calendarEnabled: false, bufferHours: 2,
    seoTitleRo: "", seoDescRo: "",
  });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isNew) {
      fetch(`/api/artists/${id}`)
        .then((r) => r.json())
        .then((data) => { setArtist(data); setLoading(false); })
        .catch(() => { toast.error("Nu s-a putut încărca artistul"); setLoading(false); });
    }
  }, [id, isNew]);

  function update(partial: Partial<ArtistData>) {
    setArtist((prev) => ({ ...prev, ...partial }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const method = isNew ? "POST" : "PUT";
      const body = isNew ? artist : { id: Number(id), ...artist };
      const res = await fetch("/api/artists/crud", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Save failed");
      const saved = await res.json();
      toast.success(isNew ? "Artist creat!" : "Artist salvat!");
      if (isNew) router.push(`/admin/artisti/${saved.id}`);
    } catch {
      toast.error("Eroare la salvare");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Sigur vrei să ștergi acest artist?")) return;
    await fetch(`/api/artists/crud?id=${id}`, { method: "DELETE" });
    toast.success("Artist șters");
    router.push("/admin/artisti");
  }

  async function handleAIGenerate(field: string) {
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: field === "seo" ? "seo" : "description",
          name: artist.nameRo,
          description: artist.descriptionRo || "",
          entityType: "artist",
          language: "ro",
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (field === "seo") {
        update({ seoTitleRo: data.result.title, seoDescRo: data.result.metaDescription });
      } else {
        update({ descriptionRo: data.result });
      }
      toast.success("Generat cu AI!");
    } catch {
      toast.error("AI indisponibil");
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-gold" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/artisti">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="font-heading text-2xl font-bold">{isNew ? "Artist Nou" : `Editare: ${artist.nameRo}`}</h1>
        </div>
        {!isNew && (
          <>
            <Link href={`/artisti/${artist.slug}`} target="_blank">
              <Button variant="outline" className="gap-2"><Eye className="h-4 w-4" /> Preview</Button>
            </Link>
            <Button variant="outline" className="text-destructive gap-2" onClick={handleDelete}><Trash2 className="h-4 w-4" /> Șterge</Button>
          </>
        )}
        <Button onClick={handleSave} disabled={saving} className="bg-gold text-background hover:bg-gold-dark gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvează
        </Button>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="description">Descriere</TabsTrigger>
          <TabsTrigger value="gallery">Galerie</TabsTrigger>
          <TabsTrigger value="packages">Pachete</TabsTrigger>
          <TabsTrigger value="seo">SEO</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6 space-y-6">
          <Card>
            <CardHeader><CardTitle>Informații de bază</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div><Label>Nume (RO) *</Label><Input value={artist.nameRo || ""} onChange={(e) => update({ nameRo: e.target.value })} /></div>
                <div><Label>Nume (RU)</Label><Input value={artist.nameRu || ""} onChange={(e) => update({ nameRu: e.target.value })} /></div>
                <div><Label>Nume (EN)</Label><Input value={artist.nameEn || ""} onChange={(e) => update({ nameEn: e.target.value })} /></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label>Slug</Label><Input value={artist.slug || ""} onChange={(e) => update({ slug: e.target.value })} /></div>
                <div><Label>Locație</Label><Input value={artist.location || ""} onChange={(e) => update({ location: e.target.value })} /></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div><Label>Preț de la (€)</Label><Input type="number" value={artist.priceFrom || 0} onChange={(e) => update({ priceFrom: Number(e.target.value) })} /></div>
                <div><Label>Telefon</Label><Input value={artist.phone || ""} onChange={(e) => update({ phone: e.target.value })} /></div>
                <div><Label>Email</Label><Input value={artist.email || ""} onChange={(e) => update({ email: e.target.value })} /></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-4">
                <div><Label>Instagram</Label><Input value={artist.instagram || ""} onChange={(e) => update({ instagram: e.target.value })} /></div>
                <div><Label>Facebook</Label><Input value={artist.facebook || ""} onChange={(e) => update({ facebook: e.target.value })} /></div>
                <div><Label>YouTube</Label><Input value={artist.youtube || ""} onChange={(e) => update({ youtube: e.target.value })} /></div>
                <div><Label>TikTok</Label><Input value={artist.tiktok || ""} onChange={(e) => update({ tiktok: e.target.value })} /></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Setări</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {([
                ["isActive", "Activ", "Vizibil pe site"],
                ["isFeatured", "Featured", "Apare pe homepage"],
                ["isVerified", "Verificat", "Badge verificat"],
                ["isPremium", "Premium", "Badge premium"],
                ["calendarEnabled", "Calendar activ", "Afișează calendarul pe profil"],
              ] as const).map(([key, label, desc]) => (
                <div key={key} className="flex items-center justify-between">
                  <div><Label>{label}</Label><p className="text-xs text-muted-foreground">{desc}</p></div>
                  <Switch checked={!!artist[key]} onCheckedChange={(v) => update({ [key]: v } as Partial<ArtistData>)} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="description" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Descriere</CardTitle>
                <Button variant="outline" size="sm" className="gap-1" onClick={() => handleAIGenerate("description")}>
                  <Sparkles className="h-3.5 w-3.5 text-gold" /> Generează cu AI
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Descriere (RO)</Label><RichEditor content={artist.descriptionRo || ""} onChange={(html) => update({ descriptionRo: html })} /></div>
              <div><Label>Descriere (RU)</Label><RichEditor content={artist.descriptionRu || ""} onChange={(html) => update({ descriptionRu: html })} /></div>
              <div><Label>Descriere (EN)</Label><RichEditor content={artist.descriptionEn || ""} onChange={(html) => update({ descriptionEn: html })} /></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gallery" className="mt-6">
          <Card>
            <CardHeader><CardTitle>Galerie Imagini</CardTitle></CardHeader>
            <CardContent>
              <ImageUpload
                images={(artist.images || []).map((img) => ({ id: String(img.id), url: img.url, alt: img.altRo || "", isCover: img.isCover }))}
                onChange={() => {}}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="packages" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Pachete</CardTitle>
                <Button variant="outline" size="sm">+ Adaugă Pachet</Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Pachetele vor fi disponibile în curând.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seo" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>SEO</CardTitle>
                <Button variant="outline" size="sm" className="gap-1" onClick={() => handleAIGenerate("seo")}>
                  <Sparkles className="h-3.5 w-3.5 text-gold" /> Auto-generează SEO
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Meta Title (RO)</Label><Input value={artist.seoTitleRo || ""} onChange={(e) => update({ seoTitleRo: e.target.value })} maxLength={60} /><p className="text-xs text-muted-foreground mt-1">{(artist.seoTitleRo || "").length}/60</p></div>
              <div><Label>Meta Description (RO)</Label><Input value={artist.seoDescRo || ""} onChange={(e) => update({ seoDescRo: e.target.value })} maxLength={155} /><p className="text-xs text-muted-foreground mt-1">{(artist.seoDescRo || "").length}/155</p></div>
              <div className="rounded-lg border border-border/40 p-4">
                <p className="text-xs text-muted-foreground mb-1">Preview Google:</p>
                <p className="text-blue-600 text-sm">{artist.seoTitleRo || `${artist.nameRo} — Artist Evenimente | ePetrecere.md`}</p>
                <p className="text-green-700 text-xs">epetrecere.md/artisti/{artist.slug}</p>
                <p className="text-xs text-muted-foreground">{artist.seoDescRo || "Descrierea meta va apărea aici..."}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
