"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RichEditor } from "@/components/shared/rich-editor";
import { ImageUpload } from "@/components/shared/image-upload";
import { ArrowLeft, Save, Sparkles, Eye } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

export default function EditArtistPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/artisti">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="font-heading text-2xl font-bold">Editare Artist</h1>
        </div>
        <Button variant="outline" className="gap-2"><Eye className="h-4 w-4" /> Preview</Button>
        <Button className="bg-gold text-background hover:bg-gold-dark gap-2"><Save className="h-4 w-4" /> Salvează</Button>
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
                <div><Label>Nume (RO) *</Label><Input defaultValue="Ion Suruceanu" /></div>
                <div><Label>Nume (RU)</Label><Input placeholder="Ион Суручану" /></div>
                <div><Label>Nume (EN)</Label><Input placeholder="Ion Suruceanu" /></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label>Slug</Label><Input defaultValue="ion-suruceanu" /></div>
                <div><Label>Locație</Label><Input defaultValue="Chișinău" /></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div><Label>Preț de la (€)</Label><Input type="number" defaultValue={1000} /></div>
                <div><Label>Telefon</Label><Input placeholder="+373..." /></div>
                <div><Label>Email</Label><Input type="email" /></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-4">
                <div><Label>Instagram</Label><Input placeholder="@username" /></div>
                <div><Label>Facebook</Label><Input placeholder="URL" /></div>
                <div><Label>YouTube</Label><Input placeholder="URL" /></div>
                <div><Label>TikTok</Label><Input placeholder="@username" /></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Setări</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div><Label>Activ</Label><p className="text-xs text-muted-foreground">Vizibil pe site</p></div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div><Label>Featured</Label><p className="text-xs text-muted-foreground">Apare pe homepage</p></div>
                <Switch />
              </div>
              <div className="flex items-center justify-between">
                <div><Label>Verificat</Label><p className="text-xs text-muted-foreground">Badge verificat</p></div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div><Label>Premium</Label><p className="text-xs text-muted-foreground">Badge premium</p></div>
                <Switch />
              </div>
              <div className="flex items-center justify-between">
                <div><Label>Calendar activ</Label><p className="text-xs text-muted-foreground">Afișează calendarul pe profil</p></div>
                <Switch />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="description" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Descriere</CardTitle>
                <Button variant="outline" size="sm" className="gap-1"><Sparkles className="h-3.5 w-3.5 text-gold" /> Generează cu AI</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Descriere (RO)</Label><RichEditor placeholder="Descriere în română..." /></div>
              <div><Label>Descriere (RU)</Label><RichEditor placeholder="Описание на русском..." /></div>
              <div><Label>Descriere (EN)</Label><RichEditor placeholder="Description in English..." /></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gallery" className="mt-6">
          <Card>
            <CardHeader><CardTitle>Galerie Imagini</CardTitle></CardHeader>
            <CardContent>
              <ImageUpload images={[]} onChange={() => {}} />
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
              <p className="text-sm text-muted-foreground">Nu există pachete. Adaugă un pachet pentru a-l afișa pe profil.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seo" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>SEO</CardTitle>
                <Button variant="outline" size="sm" className="gap-1"><Sparkles className="h-3.5 w-3.5 text-gold" /> Auto-generează SEO</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Meta Title (RO)</Label><Input placeholder="Max 60 caractere" maxLength={60} /><p className="text-xs text-muted-foreground mt-1">0/60</p></div>
              <div><Label>Meta Description (RO)</Label><Textarea rows={2} placeholder="Max 155 caractere" maxLength={155} /><p className="text-xs text-muted-foreground mt-1">0/155</p></div>
              <div className="rounded-lg border border-border/40 p-4">
                <p className="text-xs text-muted-foreground mb-1">Preview Google:</p>
                <p className="text-blue-600 text-sm">Ion Suruceanu — Artist Evenimente | ePetrecere.md</p>
                <p className="text-green-700 text-xs">epetrecere.md/artisti/ion-suruceanu</p>
                <p className="text-xs text-muted-foreground">Descriere meta va apărea aici...</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
