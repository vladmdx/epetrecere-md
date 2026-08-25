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
import { ArrowLeft, Save, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useLocale } from "@/hooks/use-locale";

export default function BlogEditorPage() {
  const { t } = useLocale();
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const isNew = id === "new";

  const [post, setPost] = useState({
    titleRo: "", titleRu: "", titleEn: "",
    contentRo: "", contentRu: "", contentEn: "",
    excerptRo: "", excerptRu: "", excerptEn: "",
    category: "", coverImageUrl: "",
    status: "draft",
    seoTitleRo: "", seoTitleRu: "", seoTitleEn: "",
    seoDescRo: "", seoDescRu: "", seoDescEn: "",
    publishedAt: "",
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
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || t("admin.blogEdit.saveError"));
      }
      const saved = await res.json();
      toast.success(isNew ? t("admin.blogEdit.created") : t("admin.blogEdit.saved"));
      if (isNew && saved.id) router.push(`/admin/blog/${saved.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("admin.blogEdit.genericSaveError"));
    }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirm(t("admin.blogEdit.deleteConfirm"))) return;
    try {
      const res = await fetch(`/api/blog?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success(t("admin.blogEdit.deleted"));
      router.push("/admin/blog");
    } catch {
      toast.error(t("admin.blogEdit.deleteError"));
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-gold" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/blog"><Button variant="ghost" size="icon" aria-label={t("admin.blogEdit.backToList")}><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div className="flex-1"><h1 className="font-heading text-2xl font-bold">{isNew ? t("admin.blogEdit.newArticle") : t("admin.blogEdit.editArticle")}</h1></div>
        {!isNew && <Button variant="outline" className="text-destructive gap-2" onClick={handleDelete}><Trash2 className="h-4 w-4" /> {t("admin.blogEdit.delete")}</Button>}
        <select value={post.status} onChange={e => update({ status: e.target.value })} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="draft">{t("admin.blogEdit.statusDraft")}</option>
          <option value="published">{t("admin.blogEdit.statusPublished")}</option>
          <option value="archived">{t("admin.blogEdit.statusArchived")}</option>
        </select>
        <Button onClick={handleSave} disabled={saving} className="bg-gold text-[#0D0D0D] hover:bg-gold-dark gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {t("admin.blogEdit.save")}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader><CardTitle>{t("admin.blogEdit.contentCard")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>{t("admin.blogEdit.titleRo")}</Label><Input value={post.titleRo} onChange={e => update({ titleRo: e.target.value })} /></div>
              <div><Label>{t("admin.blogEdit.contentRo")}</Label><RichEditor content={post.contentRo} onChange={html => update({ contentRo: html })} /></div>
              <div><Label>{t("admin.blogEdit.titleRu")}</Label><Input value={post.titleRu} onChange={e => update({ titleRu: e.target.value })} /></div>
              <div><Label>{t("admin.blogEdit.contentRu")}</Label><RichEditor content={post.contentRu} onChange={html => update({ contentRu: html })} /></div>
              <div><Label>{t("admin.blogEdit.titleEn")}</Label><Input value={post.titleEn} onChange={e => update({ titleEn: e.target.value })} /></div>
              <div><Label>{t("admin.blogEdit.contentEn")}</Label><RichEditor content={post.contentEn} onChange={html => update({ contentEn: html })} /></div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>{t("admin.blogEdit.details")}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div><Label>{t("admin.blogEdit.category")}</Label><Input value={post.category} onChange={e => update({ category: e.target.value })} placeholder={t("admin.blogEdit.categoryPlaceholder")} /></div>
              <div><Label>{t("admin.blogEdit.excerptRo")}</Label><Input value={post.excerptRo} onChange={e => update({ excerptRo: e.target.value })} /></div>
              <div><Label>{t("admin.blogEdit.excerptRu")}</Label><Input value={post.excerptRu} onChange={e => update({ excerptRu: e.target.value })} /></div>
              <div><Label>{t("admin.blogEdit.excerptEn")}</Label><Input value={post.excerptEn} onChange={e => update({ excerptEn: e.target.value })} /></div>
              <div><Label>{t("admin.blogEdit.coverImageUrl")}</Label><Input value={post.coverImageUrl} onChange={e => update({ coverImageUrl: e.target.value })} /></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t("admin.blogEdit.seo")}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div><Label>{t("admin.blogEdit.metaTitleRo")}</Label><Input value={post.seoTitleRo} onChange={e => update({ seoTitleRo: e.target.value })} maxLength={60} /></div>
              <div><Label>{t("admin.blogEdit.metaDescRo")}</Label><Input value={post.seoDescRo} onChange={e => update({ seoDescRo: e.target.value })} maxLength={155} /></div>
              <div><Label>{t("admin.blogEdit.metaTitleRu")}</Label><Input value={post.seoTitleRu} onChange={e => update({ seoTitleRu: e.target.value })} maxLength={60} /></div>
              <div><Label>{t("admin.blogEdit.metaDescRu")}</Label><Input value={post.seoDescRu} onChange={e => update({ seoDescRu: e.target.value })} maxLength={155} /></div>
              <div><Label>{t("admin.blogEdit.metaTitleEn")}</Label><Input value={post.seoTitleEn} onChange={e => update({ seoTitleEn: e.target.value })} maxLength={60} /></div>
              <div><Label>{t("admin.blogEdit.metaDescEn")}</Label><Input value={post.seoDescEn} onChange={e => update({ seoDescEn: e.target.value })} maxLength={155} /></div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
