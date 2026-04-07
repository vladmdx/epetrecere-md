"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Globe, CheckCircle, AlertTriangle, XCircle, Sparkles, RefreshCw, ArrowRight } from "lucide-react";

const seoPages = [
  { path: "/", title: "Homepage", score: 95, hasMeta: true, hasSchema: true, hasAlt: true },
  { path: "/artisti", title: "Artiști", score: 90, hasMeta: true, hasSchema: true, hasAlt: true },
  { path: "/sali", title: "Săli", score: 85, hasMeta: true, hasSchema: true, hasAlt: false },
  { path: "/contact", title: "Contact", score: 70, hasMeta: true, hasSchema: false, hasAlt: true },
  { path: "/despre", title: "Despre", score: 80, hasMeta: true, hasSchema: false, hasAlt: true },
  { path: "/servicii", title: "Servicii", score: 75, hasMeta: true, hasSchema: false, hasAlt: true },
];

function ScoreBadge({ score }: { score: number }) {
  if (score >= 80) return <Badge className="bg-success/10 text-success border-success/30">{score}%</Badge>;
  if (score >= 60) return <Badge className="bg-warning/10 text-warning border-warning/30">{score}%</Badge>;
  return <Badge className="bg-destructive/10 text-destructive border-destructive/30">{score}%</Badge>;
}

export default function SEOPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">SEO Engine</h1>
          <p className="text-sm text-muted-foreground">Gestionează SEO pentru toate paginile</p>
        </div>
        <Button className="bg-gold text-background hover:bg-gold-dark gap-2"><Sparkles className="h-4 w-4" /> Auto-generează SEO</Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pages">Per Pagină</TabsTrigger>
          <TabsTrigger value="redirects">Redirecturi</TabsTrigger>
          <TabsTrigger value="sitemap">Sitemap</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <div className="grid gap-4 sm:grid-cols-3 mb-6">
            <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-success">82%</p><p className="text-sm text-muted-foreground">Scor Mediu SEO</p></CardContent></Card>
            <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold">{seoPages.length}</p><p className="text-sm text-muted-foreground">Pagini Indexate</p></CardContent></Card>
            <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-gold">0</p><p className="text-sm text-muted-foreground">Imagini fără Alt</p></CardContent></Card>
          </div>

          <div className="space-y-2">
            {seoPages.map((page) => (
              <Card key={page.path}>
                <CardContent className="flex items-center gap-4 py-3">
                  <ScoreBadge score={page.score} />
                  <div className="flex-1">
                    <span className="font-medium text-sm">{page.title}</span>
                    <span className="text-xs text-muted-foreground ml-2">{page.path}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {page.hasMeta ? <CheckCircle className="h-3.5 w-3.5 text-success" /> : <XCircle className="h-3.5 w-3.5 text-destructive" />}
                    <span className="text-muted-foreground">Meta</span>
                    {page.hasSchema ? <CheckCircle className="h-3.5 w-3.5 text-success" /> : <AlertTriangle className="h-3.5 w-3.5 text-warning" />}
                    <span className="text-muted-foreground">Schema</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="pages" className="mt-6">
          <Card>
            <CardHeader><CardTitle>Editare SEO — Selectează Pagina</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Meta Title</Label><Input placeholder="Max 60 caractere" /><p className="text-xs text-muted-foreground mt-1">0/60</p></div>
              <div><Label>Meta Description</Label><Textarea rows={2} placeholder="Max 155 caractere" /><p className="text-xs text-muted-foreground mt-1">0/155</p></div>
              <div className="rounded-lg border border-border/40 p-4">
                <p className="text-xs text-muted-foreground mb-2">SERP Preview:</p>
                <p className="text-blue-600 text-sm">ePetrecere.md — Marketplace pentru Evenimente</p>
                <p className="text-green-700 text-xs">epetrecere.md</p>
                <p className="text-xs text-muted-foreground">Descrierea meta va apărea aici...</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="redirects" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Redirecturi</CardTitle>
                <Button variant="outline" size="sm">+ Adaugă Redirect</Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Nu există redirecturi configurate.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sitemap" className="mt-6">
          <Card>
            <CardHeader><CardTitle>Sitemap & Robots.txt</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg bg-accent/50 p-4">
                <div>
                  <p className="text-sm font-medium">sitemap.xml</p>
                  <p className="text-xs text-muted-foreground">Auto-generat la fiecare build</p>
                </div>
                <Button variant="outline" size="sm" className="gap-1"><RefreshCw className="h-3.5 w-3.5" /> Regenerează</Button>
              </div>
              <div>
                <Label>robots.txt</Label>
                <Textarea rows={6} defaultValue={`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /dashboard\nDisallow: /api\nSitemap: https://epetrecere.md/sitemap.xml`} className="mt-1 font-mono text-xs" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
