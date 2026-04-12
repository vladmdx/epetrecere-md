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
import { Save, FileText, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface Page {
  id: number; slug: string; titleRo: string; contentRo: string | null;
  seoTitleRo: string | null; seoDescRo: string | null;
}

export default function AdminPagesPage() {
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPage, setSelectedPage] = useState<Page | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/pages").then(r => r.json()).then(data => {
      setPages(data);
      if (data.length) setSelectedPage(data[0]);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

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
        toast.success("Pagina salvată!");
      } else {
        toast.error("Eroare la salvarea paginii");
      }
    } catch {
      toast.error("Eroare la salvarea paginii");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-gold" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">Pagini Statice</h1>
        <Button onClick={handleSave} disabled={saving} className="bg-gold text-background hover:bg-gold-dark gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvează
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
          {pages.length === 0 && <p className="text-sm text-muted-foreground">Nu există pagini</p>}
        </div>

        {selectedPage && (
          <div className="lg:col-span-3 space-y-4">
            <Card>
              <CardHeader><CardTitle>{selectedPage.titleRo || selectedPage.slug}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div><Label>Titlu (RO)</Label><Input value={selectedPage.titleRo} onChange={e => setSelectedPage({ ...selectedPage, titleRo: e.target.value })} /></div>
                <div><Label>Conținut (RO)</Label><RichEditor content={selectedPage.contentRo || ""} onChange={html => setSelectedPage({ ...selectedPage, contentRo: html })} /></div>
                <div><Label>SEO Title</Label><Input value={selectedPage.seoTitleRo || ""} onChange={e => setSelectedPage({ ...selectedPage, seoTitleRo: e.target.value })} maxLength={60} /></div>
                <div><Label>SEO Description</Label><Input value={selectedPage.seoDescRo || ""} onChange={e => setSelectedPage({ ...selectedPage, seoDescRo: e.target.value })} maxLength={155} /></div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
