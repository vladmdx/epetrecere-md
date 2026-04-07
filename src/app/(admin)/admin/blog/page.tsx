"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Eye, Calendar, Loader2, Trash2 } from "lucide-react";
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
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/blog").then(r => r.json()).then(data => { setPosts(data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function handleDelete(id: number) {
    if (!confirm("Sigur ștergi?")) return;
    await fetch(`/api/blog?id=${id}`, { method: "DELETE" });
    setPosts(prev => prev.filter(p => p.id !== id));
    toast.success("Articol șters");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Blog</h1>
          <p className="text-sm text-muted-foreground">{posts.length} articole</p>
        </div>
        <Link href="/admin/blog/new"><Button className="bg-gold text-background hover:bg-gold-dark gap-2"><Plus className="h-4 w-4" /> Articol Nou</Button></Link>
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
                    <span className="font-medium">{post.titleRo || "Fără titlu"}</span>
                    <Badge variant="outline" className={`text-xs ${statusBadge[post.status] || ""}`}>
                      {post.status === "published" ? "Publicat" : post.status === "draft" ? "Draft" : "Arhivat"}
                    </Badge>
                    {post.category && <Badge variant="secondary" className="text-xs">{post.category}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">/{post.slug} · {new Date(post.createdAt).toLocaleDateString("ro-RO")}</p>
                </div>
                <Link href={`/admin/blog/${post.id}`}><Button variant="ghost" size="icon"><Edit className="h-4 w-4" /></Button></Link>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(post.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </CardContent>
            </Card>
          ))}
          {posts.length === 0 && <p className="py-8 text-center text-muted-foreground">Nu există articole. Creează primul!</p>}
        </div>
      )}
    </div>
  );
}
