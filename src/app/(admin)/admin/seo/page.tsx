"use client";

// Admin SEO overview — links to the live SEO surfaces and documents where
// the per-entity SEO fields live (on each artist / venue / blog post).
// The old mock-data audit UI was removed because it wasn't backed by real
// data; once we have a proper scanner (e.g. Lighthouse in CI or a DB view
// over null seo_title_* columns), this page can be extended.

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Globe,
  ExternalLink,
  FileText,
  Users,
  Building2,
  BookOpen,
} from "lucide-react";

const surfaces = [
  {
    title: "Sitemap",
    description:
      "Generat automat din DB — include toți artiștii, sălile și articolele active.",
    href: "/sitemap.xml",
    external: true,
    Icon: Globe,
  },
  {
    title: "Robots.txt",
    description: "Regulile de crawl — blochează /dashboard/*, /admin/*, /api/*.",
    href: "/robots.txt",
    external: true,
    Icon: FileText,
  },
];

const entitySeo = [
  {
    title: "SEO artiști",
    description:
      "Editează titlu + meta description multi-limbă per artist în pagina de editare.",
    href: "/admin/artisti",
    Icon: Users,
  },
  {
    title: "SEO săli",
    description: 'Tab „SEO" în editorul fiecărei săli (RO / RU / EN + SERP preview).',
    href: "/admin/sali",
    Icon: Building2,
  },
  {
    title: "SEO articole blog",
    description: "Titlu + meta description per articol, din editorul de blog.",
    href: "/admin/blog",
    Icon: BookOpen,
  },
];

export default function SEOPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">SEO</h1>
        <p className="text-sm text-muted-foreground">
          Suprafețele SEO ale platformei și unde se editează fiecare tip de
          conținut.
        </p>
      </div>

      {/* Platform-level surfaces */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Fișiere platformă
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {surfaces.map(({ title, description, href, external, Icon }) => (
            <Card key={href}>
              <CardContent className="flex items-start gap-3 p-4">
                <div className="rounded-lg bg-gold/10 p-2 text-gold">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">{title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {description}
                  </p>
                </div>
                <Link
                  href={href}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noopener" : undefined}
                  className="shrink-0"
                >
                  <Button variant="ghost" size="icon" aria-label={`Deschide ${title}`}>
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Per-entity SEO navigation */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          SEO per entitate
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entitySeo.map(({ title, description, href, Icon }) => (
            <Link key={href} href={href}>
              <Card className="h-full transition-all hover:border-gold/40">
                <CardContent className="p-5">
                  <div className="mb-3 inline-flex rounded-lg bg-gold/10 p-2 text-gold">
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="font-medium">{title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {description}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Meta header fields reference */}
      <Card>
        <CardHeader>
          <CardTitle>Notă pentru redactori</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Titlu SEO</strong> — max 60
            caractere. Include cuvânt cheie la început + brand la final. Ex:
            „Moderatori Nuntă Chișinău | ePetrecere.md".
          </p>
          <p>
            <strong className="text-foreground">Meta description</strong> — max
            160 caractere. Descriere atractivă + CTA implicit. Ex: „Cei mai
            buni moderatori din Moldova pentru nuntă. Rezervă online".
          </p>
          <p>
            <strong className="text-foreground">Schema.org JSON-LD</strong> —
            generat automat pentru artist (PerformingGroup), sală
            (LocalBusiness), articol blog (Article), homepage (Organization).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
