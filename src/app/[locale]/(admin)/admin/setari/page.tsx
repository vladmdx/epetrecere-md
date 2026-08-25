"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, Palette, Globe, BarChart3, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppearanceSettings } from "@/components/shared/appearance-settings";
import { useLocale } from "@/hooks/use-locale";

type Settings = Record<string, string>;

export default function SettingsPage() {
  const { t } = useLocale();
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/site-settings");
        if (res.ok) {
          const data = await res.json();
          // Flatten nested values
          const flat: Settings = {};
          for (const [key, value] of Object.entries(data)) {
            flat[key] = typeof value === "string" ? value : JSON.stringify(value);
          }
          setSettings(flat);
        }
      } catch {
        // defaults will be used
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function get(key: string, fallback = "") {
    return settings[key] ?? fallback;
  }

  function set(key: string, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/site-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        toast.success(t("admin.settingsPage.saved"));
      } else {
        toast.error(t("admin.settingsPage.saveError"));
      }
    } catch {
      toast.error(t("admin.settingsPage.saveError"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">
          {t("admin.settingsPage.title")}
        </h1>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-gold text-[#0D0D0D] hover:bg-gold-dark gap-2"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t("admin.settingsPage.save")}
        </Button>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general" className="gap-1"><Globe className="h-3.5 w-3.5" /> {t("admin.settingsPage.tabGeneral")}</TabsTrigger>
          <TabsTrigger value="design" className="gap-1"><Palette className="h-3.5 w-3.5" /> {t("admin.settingsPage.tabDesign")}</TabsTrigger>
          <TabsTrigger value="tracking" className="gap-1"><BarChart3 className="h-3.5 w-3.5" /> {t("admin.settingsPage.tabTracking")}</TabsTrigger>
          <TabsTrigger value="email" className="gap-1"><Mail className="h-3.5 w-3.5" /> {t("admin.settingsPage.tabEmail")}</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6 space-y-6">
          <Card>
            <CardHeader><CardTitle>{t("admin.settingsPage.siteInfo")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label>{t("admin.settingsPage.siteName")}</Label><Input value={get("site_name", "ePetrecere.md")} onChange={(e) => set("site_name", e.target.value)} /></div>
                <div><Label>{t("admin.settingsPage.siteDescription")}</Label><Input value={get("site_description", t("admin.settingsPage.siteDescriptionDefault"))} onChange={(e) => set("site_description", e.target.value)} /></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label>{t("admin.settingsPage.logoUrl")}</Label><Input value={get("logo_url")} onChange={(e) => set("logo_url", e.target.value)} placeholder="https://cdn.epetrecere.md/logo.png" /></div>
                <div><Label>{t("admin.settingsPage.faviconUrl")}</Label><Input value={get("favicon_url")} onChange={(e) => set("favicon_url", e.target.value)} placeholder="https://cdn.epetrecere.md/favicon.ico" /></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t("admin.settingsPage.contact")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div><Label>{t("admin.settingsPage.phone")}</Label><Input value={get("contact_phone", "")} onChange={(e) => set("contact_phone", e.target.value)} /></div>
                <div><Label>{t("admin.settingsPage.email")}</Label><Input value={get("contact_email", "info@epetrecere.md")} onChange={(e) => set("contact_email", e.target.value)} /></div>
                <div><Label>{t("admin.settingsPage.address")}</Label><Input value={get("contact_address", "Chișinău, Moldova")} onChange={(e) => set("contact_address", e.target.value)} /></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t("admin.settingsPage.socialMedia")}</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div><Label>Instagram</Label><Input value={get("social_instagram")} onChange={(e) => set("social_instagram", e.target.value)} placeholder="https://instagram.com/..." /></div>
              <div><Label>Facebook</Label><Input value={get("social_facebook")} onChange={(e) => set("social_facebook", e.target.value)} placeholder="https://facebook.com/..." /></div>
              <div><Label>YouTube</Label><Input value={get("social_youtube")} onChange={(e) => set("social_youtube", e.target.value)} placeholder="https://youtube.com/..." /></div>
              <div><Label>TikTok</Label><Input value={get("social_tiktok")} onChange={(e) => set("social_tiktok", e.target.value)} placeholder="https://tiktok.com/..." /></div>
              <div><Label>Telegram</Label><Input value={get("social_telegram")} onChange={(e) => set("social_telegram", e.target.value)} placeholder="https://t.me/..." /></div>
              <div><Label>WhatsApp</Label><Input value={get("social_whatsapp")} onChange={(e) => set("social_whatsapp", e.target.value)} placeholder="+373..." /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t("admin.settingsPage.localization")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>{t("admin.settingsPage.defaultLanguage")}</Label>
                <select
                  value={get("default_language", "ro")}
                  onChange={(e) => set("default_language", e.target.value)}
                  className="mt-1 flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
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
            <CardHeader><CardTitle>{t("admin.settingsPage.colors")}</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>{t("admin.settingsPage.colorGold")}</Label>
                <div className="mt-1 flex gap-2">
                  <input type="color" value={get("color_gold", "#C9A84C")} onChange={(e) => set("color_gold", e.target.value)} className="h-10 w-10 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0.5" />
                  <Input value={get("color_gold", "#C9A84C")} onChange={(e) => set("color_gold", e.target.value)} className="flex-1 font-mono text-sm" />
                </div>
              </div>
              <div>
                <Label>{t("admin.settingsPage.colorBgDark")}</Label>
                <div className="mt-1 flex gap-2">
                  <input type="color" value={get("color_bg_dark", "#0D0D0D")} onChange={(e) => set("color_bg_dark", e.target.value)} className="h-10 w-10 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0.5" />
                  <Input value={get("color_bg_dark", "#0D0D0D")} onChange={(e) => set("color_bg_dark", e.target.value)} className="flex-1 font-mono text-sm" />
                </div>
              </div>
              <div>
                <Label>{t("admin.settingsPage.colorBgLight")}</Label>
                <div className="mt-1 flex gap-2">
                  <input type="color" value={get("color_bg_light", "#FAF8F2")} onChange={(e) => set("color_bg_light", e.target.value)} className="h-10 w-10 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0.5" />
                  <Input value={get("color_bg_light", "#FAF8F2")} onChange={(e) => set("color_bg_light", e.target.value)} className="flex-1 font-mono text-sm" />
                </div>
              </div>
              <div>
                <Label>{t("admin.settingsPage.colorSuccess")}</Label>
                <div className="mt-1 flex gap-2">
                  <input type="color" value={get("color_success", "#22C55E")} onChange={(e) => set("color_success", e.target.value)} className="h-10 w-10 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0.5" />
                  <Input value={get("color_success", "#22C55E")} onChange={(e) => set("color_success", e.target.value)} className="flex-1 font-mono text-sm" />
                </div>
              </div>
              <div>
                <Label>{t("admin.settingsPage.colorWarning")}</Label>
                <div className="mt-1 flex gap-2">
                  <input type="color" value={get("color_warning", "#F59E0B")} onChange={(e) => set("color_warning", e.target.value)} className="h-10 w-10 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0.5" />
                  <Input value={get("color_warning", "#F59E0B")} onChange={(e) => set("color_warning", e.target.value)} className="flex-1 font-mono text-sm" />
                </div>
              </div>
              <div>
                <Label>{t("admin.settingsPage.colorDestructive")}</Label>
                <div className="mt-1 flex gap-2">
                  <input type="color" value={get("color_destructive", "#EF4444")} onChange={(e) => set("color_destructive", e.target.value)} className="h-10 w-10 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0.5" />
                  <Input value={get("color_destructive", "#EF4444")} onChange={(e) => set("color_destructive", e.target.value)} className="flex-1 font-mono text-sm" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t("admin.settingsPage.fonts")}</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>{t("admin.settingsPage.fontHeading")}</Label>
                <select
                  value={get("font_heading", "Playfair Display")}
                  onChange={(e) => set("font_heading", e.target.value)}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  style={{ fontFamily: get("font_heading", "Playfair Display") }}
                >
                  <option>Playfair Display</option><option>Cormorant</option><option>Lora</option><option>Merriweather</option><option>Georgia</option><option>Cinzel</option><option>Libre Baskerville</option>
                </select>
                <p className="mt-2 text-lg" style={{ fontFamily: get("font_heading", "Playfair Display") }}>
                  {t("admin.settingsPage.previewHeading")}
                </p>
              </div>
              <div>
                <Label>{t("admin.settingsPage.fontBody")}</Label>
                <select
                  value={get("font_body", "DM Sans")}
                  onChange={(e) => set("font_body", e.target.value)}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  style={{ fontFamily: get("font_body", "DM Sans") }}
                >
                  <option>DM Sans</option><option>Outfit</option><option>Nunito</option><option>Source Sans 3</option><option>Inter</option><option>Open Sans</option><option>Roboto</option><option>Raleway</option>
                </select>
                <p className="mt-2 text-sm" style={{ fontFamily: get("font_body", "DM Sans") }}>
                  {t("admin.settingsPage.previewBody")}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tracking" className="mt-6">
          <Card>
            <CardHeader><CardTitle>{t("admin.settingsPage.analyticsTracking")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Google Analytics (GA4 ID)</Label><Input value={get("ga4_id")} onChange={(e) => set("ga4_id", e.target.value)} placeholder="G-XXXXXXXXXX" /></div>
              <div><Label>Google Tag Manager</Label><Input value={get("gtm_id")} onChange={(e) => set("gtm_id", e.target.value)} placeholder="GTM-XXXXXXX" /></div>
              <div><Label>Facebook Pixel ID</Label><Input value={get("fb_pixel")} onChange={(e) => set("fb_pixel", e.target.value)} placeholder="123456789" /></div>
              <div><Label>TikTok Pixel ID</Label><Input value={get("tiktok_pixel")} onChange={(e) => set("tiktok_pixel", e.target.value)} placeholder="..." /></div>
              <div><Label>{t("admin.settingsPage.headScripts")}</Label><Textarea rows={4} value={get("custom_head_scripts")} onChange={(e) => set("custom_head_scripts", e.target.value)} placeholder="<script>...</script>" className="font-mono text-xs" /></div>
              <div><Label>{t("admin.settingsPage.bodyScripts")}</Label><Textarea rows={4} value={get("custom_body_scripts")} onChange={(e) => set("custom_body_scripts", e.target.value)} placeholder="<script>...</script>" className="font-mono text-xs" /></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email" className="mt-6">
          <Card>
            <CardHeader><CardTitle>{t("admin.settingsPage.emailConfig")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label>{t("admin.settingsPage.fromAddress")}</Label><Input value={get("email_from", "noreply@epetrecere.md")} onChange={(e) => set("email_from", e.target.value)} /></div>
                <div><Label>{t("admin.settingsPage.replyTo")}</Label><Input value={get("email_reply_to", "info@epetrecere.md")} onChange={(e) => set("email_reply_to", e.target.value)} /></div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AppearanceSettings />
    </div>
  );
}
