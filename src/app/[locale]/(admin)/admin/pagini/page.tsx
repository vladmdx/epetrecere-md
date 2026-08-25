"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const RichEditor = dynamic(
  () => import("@/components/shared/rich-editor").then((m) => m.RichEditor),
  { ssr: false },
);
import { Save, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "@/hooks/use-locale";

interface Page {
  id: number; slug: string; titleRo: string; contentRo: string | null;
  seoTitleRo: string | null; seoDescRo: string | null;
}

export default function AdminPagesPage() {
  const { t } = useLocale();
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPage, setSelectedPage] = useState<Page | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/pages")
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => {
        setPages(data);
        if (data.length) setSelectedPage(data[0]);
      })
      .catch(() => toast.error(t("admin.pagesList.loadError")))
      .finally(() => setLoading(false));
  }, [t]);

  async function handleSave() {
    if (!selectedPage) return;
    setSaving(true);
    try {
      const res = await fetch("/api/pages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selectedPage),
      });
      if (res.ok) {
        toast.success(t("admin.pagesList.saved"));
      } else {
        toast.error(t("admin.pagesList.saveError"));
      }
    } catch {
      toast.error(t("admin.pagesList.saveError"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-gold" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">{t("admin.pagesList.title")}</h1>
        <Button onClick={handleSave} disabled={saving} className="bg-gold text-[#0D0D0D] hover:bg-gold-dark gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {t("admin.pagesList.save")}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        <div className="space-y-2">
          {pages.map(p => (
            <button key={p.id} onClick={() => setSelectedPage(p)}
              className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition-all ${selectedPage?.id === p.id ? "border-gold bg-gold/10 text-gold font-medium" : "border-border/40 hover:border-gold/30"}`}>
              <FileText className="inline h-3.5 w-3.5 mr-1.5" />{p.titleRo || p.slug}
            </button>
          ))}
          {pages.length === 0 && <p className="text-sm text-muted-foreground">{t("admin.pagesList.empty")}</p>}
        </div>

        {selectedPage && (
          <div className="lg:col-span-3 space-y-4">
            <Card>
              <CardHeader><CardTitle>{selectedPage.titleRo || selectedPage.slug}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div><Label>{t("admin.pagesList.titleRo")}</Label><Input value={selectedPage.titleRo} onChange={e => setSelectedPage({ ...selectedPage, titleRo: e.target.value })} /></div>
                <div><Label>{t("admin.pagesList.contentRo")}</Label><RichEditor content={selectedPage.contentRo || ""} onChange={html => setSelectedPage({ ...selectedPage, contentRo: html })} /></div>
                <div><Label>{t("admin.pagesList.seoTitle")}</Label><Input value={selectedPage.seoTitleRo || ""} onChange={e => setSelectedPage({ ...selectedPage, seoTitleRo: e.target.value })} maxLength={60} /></div>
                <div><Label>{t("admin.pagesList.seoDescription")}</Label><Input value={selectedPage.seoDescRo || ""} onChange={e => setSelectedPage({ ...selectedPage, seoDescRo: e.target.value })} maxLength={155} /></div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
