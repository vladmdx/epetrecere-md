"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const RichEditor = dynamic(
  () => import("@/components/shared/rich-editor").then((m) => m.RichEditor),
  { ssr: false },
);
import { ArrowLeft, Save, Eye, Trash2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

export default function BlogEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const isNew = id === "new";

  const [post, setPost] = useState({
    titleRo: "", titleRu: "", titleEn: "",
    contentRo: "", contentRu: "", contentEn: "",
    excerptRo: "", category: "", coverImageUrl: "",
    status: "draft", seoTitleRo: "", seoDescRo: "",
  });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isNew) {
      fetch("/api/blog?all=true").then(r => {
        if (!r.ok) throw new Error();
        return r.json();
      }).then(posts => {
        const found = posts.find((p: { id: number }) => p.id === Number(id));
        if (found) setPost(found);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [id, isNew]);

  function update(partial: Partial<typeof post>) {
    setPost(prev => ({ ...prev, ...partial }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const method = isNew ? "POST" : "PUT";
      const body = isNew ? post : { id: Number(id), ...post };
      const res = await fetch("/api/blog", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      const saved = await res.json();
      toast.success(isNew ? "Articol creat!" : "Articol salvat!");
      if (isNew && saved.id) router.push(`/admin/blog/${saved.id}`);
    } catch { toast.error("Eroare"); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirm("Sigur ștergi articolul?")) return;
    await fetch(`/api/blog?id=${id}`, { method: "DELETE" });
    toast.success("Articol șters");
    router.push("/admin/blog");
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-gold" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/blog"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div className="flex-1"><h1 className="font-heading text-2xl font-bold">{isNew ? "Articol Nou" : "Editare Articol"}</h1></div>
        {!isNew && <Button variant="outline" className="text-destructive gap-2" onClick={handleDelete}><Trash2 className="h-4 w-4" /> Șterge</Button>}
        <select value={post.status} onChange={e => update({ status: e.target.value })} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="draft">Draft</option>
          <option value="published">Publicat</option>
          <option value="archived">Arhivat</option>
        </select>
        <Button onClick={handleSave} disabled={saving} className="bg-gold text-background hover:bg-gold-dark gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvează
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader><CardTitle>Conținut</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Titlu (RO) *</Label><Input value={post.titleRo} onChange={e => update({ titleRo: e.target.value })} /></div>
              <div><Label>Conținut (RO)</Label><RichEditor content={post.contentRo} onChange={html => update({ contentRo: html })} /></div>
              <div><Label>Titlu (RU)</Label><Input value={post.titleRu} onChange={e => update({ titleRu: e.target.value })} /></div>
              <div><Label>Titlu (EN)</Label><Input value={post.titleEn} onChange={e => update({ titleEn: e.target.value })} /></div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Detalii</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div><Label>Categorie</Label><Input value={post.category} onChange={e => update({ category: e.target.value })} placeholder="Nunți, Sfaturi..." /></div>
              <div><Label>Excerpt (RO)</Label><Input value={post.excerptRo} onChange={e => update({ excerptRo: e.target.value })} /></div>
              <div><Label>Cover Image URL</Label><Input value={post.coverImageUrl} onChange={e => update({ coverImageUrl: e.target.value })} /></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>SEO</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div><Label>Meta Title</Label><Input value={post.seoTitleRo} onChange={e => update({ seoTitleRo: e.target.value })} maxLength={60} /></div>
              <div><Label>Meta Description</Label><Input value={post.seoDescRo} onChange={e => update({ seoDescRo: e.target.value })} maxLength={155} /></div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
