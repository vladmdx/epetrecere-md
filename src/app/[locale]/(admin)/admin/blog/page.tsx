"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Loader2, Trash2 } from "lucide-react";
import { useLocale } from "@/hooks/use-locale";
import { toast } from "sonner";

interface BlogPost {
  id: number; titleRo: string; slug: string; status: string;
  category: string | null; publishedAt: string | null; createdAt: string;
}

const statusBadge: Record<string, string> = {
  published: "bg-success/10 text-success border-success/30",
  draft: "bg-warning/10 text-warning border-warning/30",
  archived: "bg-muted text-muted-foreground",
};

export default function BlogPage() {
  const { t } = useLocale();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPosts() {
      try {
        const res = await fetch("/api/blog?all=true");
        if (!res.ok) {
          throw new Error(t("adminUi.blog.loadHttpError", { status: res.status }));
        }
        const data = await res.json();
        setPosts(data);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("adminUi.blog.toastLoadError"));
      } finally {
        setLoading(false);
      }
    }
    fetchPosts();
  }, []);

  async function handleDelete(id: number) {
    if (!confirm(t("adminUi.blog.confirmDelete"))) return;
    try {
      const res = await fetch(`/api/blog?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setPosts(prev => prev.filter(p => p.id !== id));
      toast.success(t("adminUi.blog.toastDeleted"));
    } catch {
      toast.error(t("adminUi.blog.toastDeleteError"));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">{t("adminUi.blog.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("adminUi.blog.count", { count: posts.length })}</p>
        </div>
        <Link href="/admin/blog/new"><Button className="bg-gold text-[#0D0D0D] hover:bg-gold-dark gap-2"><Plus className="h-4 w-4" /> {t("adminUi.blog.newPost")}</Button></Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gold" /></div>
      ) : (
        <div className="space-y-2">
          {posts.map(post => (
            <Card key={post.id} className="transition-all hover:border-gold/30">
              <CardContent className="flex items-center gap-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{post.titleRo || t("adminUi.blog.untitled")}</span>
                    <Badge variant="outline" className={`text-xs ${statusBadge[post.status] || ""}`}>
                      {post.status === "published" ? t("adminUi.blog.statusPublished") : post.status === "draft" ? t("adminUi.blog.statusDraft") : t("adminUi.blog.statusArchived")}
                    </Badge>
                    {post.category && <Badge variant="secondary" className="text-xs">{post.category}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">/{post.slug} · {new Date(post.createdAt).toLocaleDateString("ro-RO")}</p>
                </div>
                <Link href={`/admin/blog/${post.id}`}><Button variant="ghost" size="icon" aria-label={t("adminUi.blog.editPost")}><Edit className="h-4 w-4" /></Button></Link>
                <Button variant="ghost" size="icon" aria-label={t("adminUi.blog.deletePost")} onClick={() => handleDelete(post.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </CardContent>
            </Card>
          ))}
          {posts.length === 0 && <p className="py-8 text-center text-muted-foreground">{t("adminUi.blog.empty")}</p>}
        </div>
      )}
    </div>
  );
}
