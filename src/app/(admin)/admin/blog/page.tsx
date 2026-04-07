"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Eye, Calendar } from "lucide-react";

const demoPosts = [
  { id: 1, titleRo: "Top 10 Artiști pentru Nunți în 2026", slug: "top-10-artisti-nunti", status: "published", publishedAt: "2026-03-15", category: "Nunți" },
  { id: 2, titleRo: "Cum să alegi sala perfectă", slug: "cum-sa-alegi-sala", status: "draft", publishedAt: null, category: "Sfaturi" },
  { id: 3, titleRo: "Tendințe muzicale pentru evenimente 2026", slug: "tendinte-muzicale-2026", status: "published", publishedAt: "2026-02-20", category: "Tendințe" },
];

const statusBadge: Record<string, string> = {
  published: "bg-success/10 text-success border-success/30",
  draft: "bg-warning/10 text-warning border-warning/30",
  archived: "bg-muted text-muted-foreground",
};

export default function BlogPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Blog</h1>
          <p className="text-sm text-muted-foreground">{demoPosts.length} articole</p>
        </div>
        <Button className="bg-gold text-background hover:bg-gold-dark gap-2"><Plus className="h-4 w-4" /> Articol Nou</Button>
      </div>

      <div className="space-y-2">
        {demoPosts.map((post) => (
          <Card key={post.id} className="transition-all hover:border-gold/30">
            <CardContent className="flex items-center gap-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{post.titleRo}</span>
                  <Badge variant="outline" className={`text-xs ${statusBadge[post.status]}`}>
                    {post.status === "published" ? "Publicat" : post.status === "draft" ? "Draft" : "Arhivat"}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">{post.category}</Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <span>/{post.slug}</span>
                  {post.publishedAt && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {post.publishedAt}</span>}
                </div>
              </div>
              <Button variant="ghost" size="icon"><Eye className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon"><Edit className="h-4 w-4" /></Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
