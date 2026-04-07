"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, Palette, Globe, BarChart3, Mail } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">Setări</h1>
        <Button className="bg-gold text-background hover:bg-gold-dark gap-2"><Save className="h-4 w-4" /> Salvează</Button>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general" className="gap-1"><Globe className="h-3.5 w-3.5" /> General</TabsTrigger>
          <TabsTrigger value="design" className="gap-1"><Palette className="h-3.5 w-3.5" /> Design</TabsTrigger>
          <TabsTrigger value="tracking" className="gap-1"><BarChart3 className="h-3.5 w-3.5" /> Tracking</TabsTrigger>
          <TabsTrigger value="email" className="gap-1"><Mail className="h-3.5 w-3.5" /> Email</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6 space-y-6">
          <Card>
            <CardHeader><CardTitle>Informații Site</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label>Nume Site</Label><Input defaultValue="ePetrecere.md" /></div>
                <div><Label>Descriere</Label><Input defaultValue="Marketplace pentru Evenimente" /></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label>Logo (URL)</Label><Input placeholder="https://cdn.epetrecere.md/logo.png" /></div>
                <div><Label>Favicon (URL)</Label><Input placeholder="https://cdn.epetrecere.md/favicon.ico" /></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div><Label>Telefon</Label><Input defaultValue="+373 60 123 456" /></div>
                <div><Label>Email</Label><Input defaultValue="info@epetrecere.md" /></div>
                <div><Label>Adresă</Label><Input defaultValue="Chișinău, Moldova" /></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Social Media</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div><Label>Instagram</Label><Input placeholder="https://instagram.com/..." /></div>
              <div><Label>Facebook</Label><Input placeholder="https://facebook.com/..." /></div>
              <div><Label>YouTube</Label><Input placeholder="https://youtube.com/..." /></div>
              <div><Label>TikTok</Label><Input placeholder="https://tiktok.com/..." /></div>
              <div><Label>Telegram</Label><Input placeholder="https://t.me/..." /></div>
              <div><Label>WhatsApp</Label><Input placeholder="+373..." /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Localizare</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Limba implicită</Label>
                <select className="mt-1 flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="ro">Română</option>
                  <option value="ru">Русский</option>
                  <option value="en">English</option>
                </select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="design" className="mt-6 space-y-6">
          <Card>
            <CardHeader><CardTitle>Culori</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div><Label>Gold (Accent)</Label><div className="mt-1 flex gap-2"><Input defaultValue="#C9A84C" className="flex-1" /><div className="h-10 w-10 rounded border" style={{background: "#C9A84C"}} /></div></div>
              <div><Label>Background Dark</Label><div className="mt-1 flex gap-2"><Input defaultValue="#0D0D0D" className="flex-1" /><div className="h-10 w-10 rounded border" style={{background: "#0D0D0D"}} /></div></div>
              <div><Label>Background Light</Label><div className="mt-1 flex gap-2"><Input defaultValue="#FAF8F2" className="flex-1" /><div className="h-10 w-10 rounded border" style={{background: "#FAF8F2"}} /></div></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Fonturi</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Font Heading</Label>
                <select className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option>Playfair Display</option><option>Cormorant</option><option>Lora</option><option>Merriweather</option>
                </select>
              </div>
              <div>
                <Label>Font Body</Label>
                <select className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option>DM Sans</option><option>Outfit</option><option>Nunito</option><option>Source Sans</option>
                </select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tracking" className="mt-6">
          <Card>
            <CardHeader><CardTitle>Analytics & Tracking</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Google Analytics (GA4 ID)</Label><Input placeholder="G-XXXXXXXXXX" /></div>
              <div><Label>Google Tag Manager</Label><Input placeholder="GTM-XXXXXXX" /></div>
              <div><Label>Facebook Pixel ID</Label><Input placeholder="123456789" /></div>
              <div><Label>TikTok Pixel ID</Label><Input placeholder="..." /></div>
              <div><Label>Custom HEAD scripts</Label><Textarea rows={4} placeholder="<script>...</script>" className="font-mono text-xs" /></div>
              <div><Label>Custom BODY scripts</Label><Textarea rows={4} placeholder="<script>...</script>" className="font-mono text-xs" /></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email" className="mt-6">
          <Card>
            <CardHeader><CardTitle>Configurare Email</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Resend API Key</Label><Input type="password" placeholder="re_..." /></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label>From Address</Label><Input defaultValue="noreply@epetrecere.md" /></div>
                <div><Label>Reply-To</Label><Input defaultValue="info@epetrecere.md" /></div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
