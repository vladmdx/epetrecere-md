"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RichEditor } from "@/components/shared/rich-editor";
import { GalleryManager } from "@/components/vendor/gallery-manager";
import { VideoManager } from "@/components/vendor/video-manager";
import { PackagesManager } from "@/components/vendor/packages-manager";
import { Save, Eye, Sparkles, Loader2 } from "lucide-react";
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
};

export default function VendorProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [artistId, setArtistId] = useState<number | null>(null);
  const [data, setData] = useState<ProfileData>(EMPTY);

  // Hydrate from the signed-in user's artist row. F-A4 before this fix
  // used hardcoded empty values and silently discarded every edit.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/artist", { cache: "no-store" });
        if (!res.ok) throw new Error("fetch failed");
        const json = await res.json();
        if (cancelled) return;
        if (!json.artist) {
          toast.error(
            "Nu ai încă un profil de artist — completează onboarding-ul.",
          );
          setLoading(false);
          return;
        }
        const a = json.artist as Record<string, unknown>;
        setArtistId((a.id as number) ?? null);
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
        </TabsList>

        <TabsContent value="info" className="mt-6 space-y-6">
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
                <Button variant="outline" size="sm" className="gap-1" onClick={handleAIImprove}><Sparkles className="h-3.5 w-3.5 text-gold" /> Îmbunătățește cu AI</Button>
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

      </Tabs>
    </div>
  );
}
