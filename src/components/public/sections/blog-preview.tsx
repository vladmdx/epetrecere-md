"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Calendar } from "lucide-react";
import { useLocale } from "@/hooks/use-locale";

const demoPosts = [
  { slug: "top-10-artisti-nunti", image: "/images/blog-wedding.jpg", title: "Top 10 Artiști pentru Nunți în 2026", excerpt: "Descoperă cei mai populari artiști pentru nunți din Republica Moldova.", date: "15 Mar 2026", category: "Nunți" },
  { slug: "cum-sa-alegi-sala", image: "/images/blog-decor.jpg", title: "Cum Să Alegi Sala Perfectă pentru Eveniment", excerpt: "Ghid complet pentru alegerea locației ideale pentru nunta sau evenimentul tău.", date: "20 Feb 2026", category: "Sfaturi" },
  { slug: "tendinte-muzicale-2026", image: "/images/blog-party.jpg", title: "Tendințe Muzicale pentru Evenimente în 2026", excerpt: "Ce genuri muzicale sunt la modă și cum să creezi playlist-ul perfect.", date: "10 Jan 2026", category: "Tendințe" },
];

export function BlogPreviewSection() {
  const { t } = useLocale();

  return (
    <section className="py-20 relative">
      {/* Parallax background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <img src="/images/backgrounds/club-blue.jpg" alt="" className="w-full h-full object-cover opacity-[0.06] blur-[2px] parallax-bg" loading="lazy" />
      </div>
      <div className="relative z-10 mx-auto max-w-7xl px-4 lg:px-8">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="mb-1 text-sm font-medium uppercase tracking-[3px] text-gold">Articole recente</p>
            <h2 className="font-heading text-3xl font-bold">{t("nav.blog")}</h2>
          </div>
          <Link href="/blog">
            <Button variant="outline" className="border-gold text-gold hover:bg-gold/10 gap-2">
              {t("common.viewAll")} <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {demoPosts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group flex flex-col overflow-hidden rounded-xl border border-border/40 bg-card transition-all hover:border-gold/30 hover:shadow-[0_4px_20px_rgba(201,168,76,0.1)]"
            >
              <div className="aspect-[16/9] overflow-hidden">
                <img src={post.image} alt={post.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
              </div>
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="text-gold font-medium">{post.category}</span>
                  <span>·</span>
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {post.date}</span>
                </div>
                <h3 className="mt-2 font-heading text-base font-bold group-hover:text-gold transition-colors">
                  {post.title}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{post.excerpt}</p>
                <span className="mt-auto pt-3 text-xs font-medium text-gold">
                  {t("common.readMore")} →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
