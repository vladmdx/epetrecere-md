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
import { useLocale } from "@/hooks/use-locale";

const surfaces = [
  {
    titleKey: "adminUi.seo.sitemapTitle",
    descriptionKey: "adminUi.seo.sitemapDesc",
    href: "/sitemap.xml",
    external: true,
    Icon: Globe,
  },
  {
    titleKey: "adminUi.seo.robotsTitle",
    descriptionKey: "adminUi.seo.robotsDesc",
    href: "/robots.txt",
    external: true,
    Icon: FileText,
  },
];

const entitySeo = [
  {
    titleKey: "adminUi.seo.artistsTitle",
    descriptionKey: "adminUi.seo.artistsDesc",
    href: "/admin/artisti",
    Icon: Users,
  },
  {
    titleKey: "adminUi.seo.venuesTitle",
    descriptionKey: "adminUi.seo.venuesDesc",
    href: "/admin/sali",
    Icon: Building2,
  },
  {
    titleKey: "adminUi.seo.blogTitle",
    descriptionKey: "adminUi.seo.blogDesc",
    href: "/admin/blog",
    Icon: BookOpen,
  },
];

export default function SEOPage() {
  const { t } = useLocale();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{t("adminUi.seo.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("adminUi.seo.subtitle")}
        </p>
      </div>

      {/* Platform-level surfaces */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("adminUi.seo.platformFiles")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {surfaces.map(({ titleKey, descriptionKey, href, external, Icon }) => (
            <Card key={href}>
              <CardContent className="flex items-start gap-3 p-4">
                <div className="rounded-lg bg-gold/10 p-2 text-gold">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">{t(titleKey)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t(descriptionKey)}
                  </p>
                </div>
                <Link
                  href={href}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noopener" : undefined}
                  className="shrink-0"
                >
                  <Button variant="ghost" size="icon" aria-label={t("adminUi.seo.open", { name: t(titleKey) })}>
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
          {t("adminUi.seo.perEntity")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entitySeo.map(({ titleKey, descriptionKey, href, Icon }) => (
            <Link key={href} href={href}>
              <Card className="h-full transition-all hover:border-gold/40">
                <CardContent className="p-5">
                  <div className="mb-3 inline-flex rounded-lg bg-gold/10 p-2 text-gold">
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="font-medium">{t(titleKey)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(descriptionKey)}
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
          <CardTitle>{t("adminUi.seo.editorsNote")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">{t("adminUi.seo.noteTitleTerm")}</strong>{" "}
            {t("adminUi.seo.noteTitleBody")}
          </p>
          <p>
            <strong className="text-foreground">{t("adminUi.seo.noteDescTerm")}</strong>{" "}
            {t("adminUi.seo.noteDescBody")}
          </p>
          <p>
            <strong className="text-foreground">{t("adminUi.seo.noteSchemaTerm")}</strong>{" "}
            {t("adminUi.seo.noteSchemaBody")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
