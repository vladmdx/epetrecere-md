"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RichEditor } from "@/components/shared/rich-editor";
import { ImageUpload } from "@/components/shared/image-upload";
import { Save, Eye, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function VendorProfilePage() {
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState({
    nameRo: "", location: "", phone: "", email: "",
    website: "", instagram: "", facebook: "", youtube: "", tiktok: "",
    priceFrom: 0, showPrice: true,
    descriptionRo: "", descriptionRu: "", descriptionEn: "",
    calendarEnabled: false, bufferHours: 2,
    images: [] as { id: string; url: string; alt: string; isCover: boolean }[],
  });

  function update(partial: Partial<typeof data>) {
    setData((prev) => ({ ...prev, ...partial }));
  }

  async function handleSave() {
    setSaving(true);
    // In production: PUT /api/artists/crud with artist ID from auth context
    toast.success("Profilul a fost salvat!");
    setSaving(false);
  }

  async function handleAIImprove() {
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "description", name: data.nameRo, description: data.descriptionRo, language: "ro" }),
      });
      if (!res.ok) throw new Error();
      const result = await res.json();
      update({ descriptionRo: result.result });
      toast.success("Descriere îmbunătățită cu AI!");
    } catch {
      toast.error("AI indisponibil");
    }
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
          <Button onClick={handleSave} disabled={saving} className="bg-gold text-background hover:bg-gold-dark gap-2">
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
          <TabsTrigger value="settings">Setări</TabsTrigger>
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

        <TabsContent value="gallery" className="mt-6">
          <Card>
            <CardHeader><CardTitle>Galerie Foto & Video</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <ImageUpload images={data.images} onChange={(images) => update({ images })} maxFiles={10} />
              <div>
                <Label>Link-uri Video YouTube/Vimeo</Label>
                <div className="mt-2 space-y-2">
                  <Input placeholder="https://youtube.com/watch?v=..." />
                  <Button variant="outline" size="sm">+ Adaugă Video</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="packages" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Pachete Servicii</CardTitle>
                <Button variant="outline" size="sm">+ Adaugă Pachet</Button>
              </div>
            </CardHeader>
            <CardContent><p className="text-sm text-muted-foreground">Creează pachete cu prețuri diferite.</p></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <Card>
            <CardHeader><CardTitle>Setări Profil</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div><Label>Calendar activ</Label><p className="text-xs text-muted-foreground">Afișează calendarul pe profil</p></div>
                <Switch checked={data.calendarEnabled} onCheckedChange={(v) => update({ calendarEnabled: v })} />
              </div>
              <div className="flex items-center justify-between">
                <div><Label>Buffer între evenimente (ore)</Label></div>
                <Input type="number" value={data.bufferHours} onChange={(e) => update({ bufferHours: Number(e.target.value) })} className="w-20" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
