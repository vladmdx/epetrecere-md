"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, Eye, Sparkles, Upload } from "lucide-react";

export default function VendorProfilePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Profilul Meu</h1>
          <p className="text-sm text-muted-foreground">Editează informațiile și portofoliul tău</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2"><Eye className="h-4 w-4" /> Preview Profil</Button>
          <Button className="bg-gold text-background hover:bg-gold-dark gap-2"><Save className="h-4 w-4" /> Salvează</Button>
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
                <div><Label>Nume artistic</Label><Input defaultValue="Ion Suruceanu" /></div>
                <div><Label>Locație</Label><Input defaultValue="Chișinău" /></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label>Telefon</Label><Input defaultValue="+373 69 123 456" /></div>
                <div><Label>Email</Label><Input defaultValue="ion@example.md" /></div>
              </div>
              <div><Label>Website</Label><Input placeholder="https://..." /></div>
              <div className="grid gap-4 sm:grid-cols-4">
                <div><Label>Instagram</Label><Input placeholder="@username" /></div>
                <div><Label>Facebook</Label><Input placeholder="URL" /></div>
                <div><Label>YouTube</Label><Input placeholder="URL" /></div>
                <div><Label>TikTok</Label><Input placeholder="@username" /></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Preț</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label>Preț de la (€)</Label><Input type="number" defaultValue={1000} /></div>
                <div>
                  <Label>Afișează prețul pe profil</Label>
                  <div className="mt-2"><Switch defaultChecked /></div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="description" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Descriere</CardTitle>
                <Button variant="outline" size="sm" className="gap-1">
                  <Sparkles className="h-3.5 w-3.5 text-gold" /> Îmbunătățește cu AI
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Descriere (RO)</Label><Textarea rows={8} defaultValue="Unul dintre cei mai iubiți cântăreți din Republica Moldova, cu o carieră de peste 30 de ani." /></div>
              <div><Label>Descriere (RU)</Label><Textarea rows={6} placeholder="Описание на русском..." /></div>
              <div><Label>Descriere (EN)</Label><Textarea rows={6} placeholder="Description in English..." /></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gallery" className="mt-6">
          <Card>
            <CardHeader><CardTitle>Galerie Foto & Video</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-border/60 p-8">
                <Upload className="h-8 w-8 text-gold" />
                <p className="text-sm text-muted-foreground">Trage imaginile aici sau click pentru upload</p>
                <Button variant="outline">Upload Imagini</Button>
              </div>
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
            <CardContent>
              <p className="text-sm text-muted-foreground">Creează pachete cu prețuri diferite pentru a oferi clienților mai multe opțiuni.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <Card>
            <CardHeader><CardTitle>Setări Profil</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div><Label>Calendar activ</Label><p className="text-xs text-muted-foreground">Afișează calendarul pe profilul public</p></div>
                <Switch />
              </div>
              <div className="flex items-center justify-between">
                <div><Label>Buffer între evenimente</Label><p className="text-xs text-muted-foreground">Ore pauză între 2 evenimente</p></div>
                <Input type="number" defaultValue={2} className="w-20" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
