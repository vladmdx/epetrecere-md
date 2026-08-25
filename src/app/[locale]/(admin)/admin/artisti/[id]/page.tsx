"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const RichEditor = dynamic(
  () => import("@/components/shared/rich-editor").then((m) => m.RichEditor),
  { ssr: false },
);
import { ImageUpload } from "@/components/shared/image-upload";
import { PackagesManager } from "@/components/vendor/packages-manager";
import { ArrowLeft, Save, Sparkles, Eye, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useLocale } from "@/hooks/use-locale";

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
  const { t } = useLocale();
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
        .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
        .then((data) => { setArtist(data); })
        .catch(() => { toast.error(t("admin.artistEdit.loadError")); })
        .finally(() => { setLoading(false); });
    }
  }, [id, isNew, t]);

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
      toast.success(isNew ? t("admin.artistEdit.created") : t("admin.artistEdit.saved"));
      if (isNew) router.push(`/admin/artisti/${saved.id}`);
    } catch {
      toast.error(t("admin.artistEdit.saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(t("admin.artistEdit.deleteConfirm"))) return;
    try {
      const res = await fetch(`/api/artists/crud?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success(t("admin.artistEdit.deleted"));
      router.push("/admin/artisti");
    } catch {
      toast.error(t("admin.artistEdit.deleteError"));
    }
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
      toast.success(t("admin.artistEdit.aiGenerated"));
    } catch {
      toast.error(t("admin.artistEdit.aiUnavailable"));
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-gold" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/artisti">
          <Button variant="ghost" size="icon" aria-label={t("admin.artistEdit.backToArtists")}><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="font-heading text-2xl font-bold">{isNew ? t("admin.artistEdit.newArtist") : t("admin.artistEdit.editing", { name: artist.nameRo ?? "" })}</h1>
        </div>
        {!isNew && (
          <>
            <Link href={`/artisti/${artist.slug}`} target="_blank">
              <Button variant="outline" className="gap-2"><Eye className="h-4 w-4" /> {t("admin.artistEdit.preview")}</Button>
            </Link>
            <Button variant="outline" className="text-destructive gap-2" onClick={handleDelete}><Trash2 className="h-4 w-4" /> {t("admin.artistEdit.delete")}</Button>
          </>
        )}
        <Button onClick={handleSave} disabled={saving} className="bg-gold text-[#0D0D0D] hover:bg-gold-dark gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t("admin.artistEdit.save")}
        </Button>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">{t("admin.artistEdit.tabGeneral")}</TabsTrigger>
          <TabsTrigger value="description">{t("admin.artistEdit.tabDescription")}</TabsTrigger>
          <TabsTrigger value="gallery">{t("admin.artistEdit.tabGallery")}</TabsTrigger>
          <TabsTrigger value="packages">{t("admin.artistEdit.tabPackages")}</TabsTrigger>
          <TabsTrigger value="seo">{t("admin.artistEdit.tabSeo")}</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6 space-y-6">
          <Card>
            <CardHeader><CardTitle>{t("admin.artistEdit.basicInfo")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div><Label>{t("admin.artistEdit.nameRo")}</Label><Input value={artist.nameRo || ""} onChange={(e) => update({ nameRo: e.target.value })} /></div>
                <div><Label>{t("admin.artistEdit.nameRu")}</Label><Input value={artist.nameRu || ""} onChange={(e) => update({ nameRu: e.target.value })} /></div>
                <div><Label>{t("admin.artistEdit.nameEn")}</Label><Input value={artist.nameEn || ""} onChange={(e) => update({ nameEn: e.target.value })} /></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label>{t("admin.artistEdit.slug")}</Label><Input value={artist.slug || ""} onChange={(e) => update({ slug: e.target.value })} /></div>
                <div><Label>{t("admin.artistEdit.location")}</Label><Input value={artist.location || ""} onChange={(e) => update({ location: e.target.value })} /></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div><Label>{t("admin.artistEdit.priceFrom")}</Label><Input type="number" value={artist.priceFrom || 0} onChange={(e) => update({ priceFrom: Number(e.target.value) })} /></div>
                <div><Label>{t("admin.artistEdit.phone")}</Label><Input value={artist.phone || ""} onChange={(e) => update({ phone: e.target.value })} /></div>
                <div><Label>{t("admin.artistEdit.email")}</Label><Input value={artist.email || ""} onChange={(e) => update({ email: e.target.value })} /></div>
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
            <CardHeader><CardTitle>{t("admin.artistEdit.settings")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {([
                ["isActive", "admin.artistEdit.flagActive", "admin.artistEdit.flagActiveHint"],
                ["isFeatured", "admin.artistEdit.flagFeatured", "admin.artistEdit.flagFeaturedHint"],
                ["isVerified", "admin.artistEdit.flagVerified", "admin.artistEdit.flagVerifiedHint"],
                ["isPremium", "admin.artistEdit.flagPremium", "admin.artistEdit.flagPremiumHint"],
                ["calendarEnabled", "admin.artistEdit.flagCalendar", "admin.artistEdit.flagCalendarHint"],
              ] as const).map(([key, labelKey, descKey]) => (
                <div key={key} className="flex items-center justify-between">
                  <div><Label>{t(labelKey)}</Label><p className="text-xs text-muted-foreground">{t(descKey)}</p></div>
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
                <CardTitle>{t("admin.artistEdit.descriptionTitle")}</CardTitle>
                <Button variant="outline" size="sm" className="gap-1" onClick={() => handleAIGenerate("description")}>
                  <Sparkles className="h-3.5 w-3.5 text-gold" /> {t("admin.artistEdit.generateAi")}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div><Label>{t("admin.artistEdit.descriptionRo")}</Label><RichEditor content={artist.descriptionRo || ""} onChange={(html) => update({ descriptionRo: html })} /></div>
              <div><Label>{t("admin.artistEdit.descriptionRu")}</Label><RichEditor content={artist.descriptionRu || ""} onChange={(html) => update({ descriptionRu: html })} /></div>
              <div><Label>{t("admin.artistEdit.descriptionEn")}</Label><RichEditor content={artist.descriptionEn || ""} onChange={(html) => update({ descriptionEn: html })} /></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gallery" className="mt-6">
          <Card>
            <CardHeader><CardTitle>{t("admin.artistEdit.gallery")}</CardTitle></CardHeader>
            <CardContent>
              <ImageUpload
                images={(artist.images || []).map((img) => ({ id: String(img.id), url: img.url, alt: img.altRo || "", isCover: img.isCover }))}
                onChange={(updated) =>
                  update({
                    images: updated.map((img) => ({
                      id: Number(img.id) || 0,
                      url: img.url,
                      altRo: img.alt,
                      isCover: img.isCover,
                    })),
                  })
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="packages" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("admin.artistEdit.packages")}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {t("admin.artistEdit.packagesHint")}
              </p>
            </CardHeader>
            <CardContent>
              <PackagesManager artistId={artist.id ?? null} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seo" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{t("admin.artistEdit.seo")}</CardTitle>
                <Button variant="outline" size="sm" className="gap-1" onClick={() => handleAIGenerate("seo")}>
                  <Sparkles className="h-3.5 w-3.5 text-gold" /> {t("admin.artistEdit.autoGenerateSeo")}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div><Label>{t("admin.artistEdit.metaTitleRo")}</Label><Input value={artist.seoTitleRo || ""} onChange={(e) => update({ seoTitleRo: e.target.value })} maxLength={60} /><p className="text-xs text-muted-foreground mt-1">{(artist.seoTitleRo || "").length}/60</p></div>
              <div><Label>{t("admin.artistEdit.metaDescRo")}</Label><Input value={artist.seoDescRo || ""} onChange={(e) => update({ seoDescRo: e.target.value })} maxLength={155} /><p className="text-xs text-muted-foreground mt-1">{(artist.seoDescRo || "").length}/155</p></div>
              <div className="rounded-lg border border-border/40 p-4">
                <p className="text-xs text-muted-foreground mb-1">{t("admin.artistEdit.googlePreview")}</p>
                <p className="text-blue-600 text-sm">{artist.seoTitleRo || t("admin.artistEdit.serpTitleFallback", { name: artist.nameRo ?? "" })}</p>
                <p className="text-green-700 text-xs">epetrecere.md/artisti/{artist.slug}</p>
                <p className="text-xs text-muted-foreground">{artist.seoDescRo || t("admin.artistEdit.serpDescFallback")}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
