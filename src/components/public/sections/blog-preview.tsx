"use client";

import Link from "@/components/shared/locale-link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ArrowRight, Calendar } from "lucide-react";
import { useLocale } from "@/hooks/use-locale";
import { useState, useEffect } from "react";
import { getLocalized } from "@/i18n";
import { localizeBlogCategory } from "@/i18n/blog-categories";

interface BlogPost {
  slug: string;
  coverImageUrl: string | null;
  titleRo: string;
  titleRu: string | null;
  titleEn: string | null;
  excerptRo: string | null;
  excerptRu: string | null;
  excerptEn: string | null;
  publishedAt: string | null;
  category: string | null;
}

export function BlogPreviewSection() {
  const { t, locale } = useLocale();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/blog?limit=3&status=published");
        if (res.ok) {
          const data = await res.json();
          setPosts(Array.isArray(data.posts) ? data.posts : Array.isArray(data) ? data : []);
        }
      } catch {
        // If blog API not available, section simply won't render
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Don't render section if no posts available
  if (!loading && posts.length === 0) return null;

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

        {loading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-border/40 bg-card animate-pulse">
                <div className="aspect-[16/9] bg-muted" />
                <div className="p-5 space-y-3">
                  <div className="h-3 w-24 rounded bg-muted" />
                  <div className="h-4 w-3/4 rounded bg-muted" />
                  <div className="h-3 w-full rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group flex flex-col overflow-hidden rounded-xl border border-border/40 bg-card transition-all hover:border-gold/30 hover:shadow-[0_4px_20px_rgba(201,168,76,0.1)]"
              >
                <div className="relative aspect-[16/9] overflow-hidden bg-muted">
                  {post.coverImageUrl ? (
                    <Image
                      src={post.coverImageUrl}
                      alt={getLocalized(post, "title", locale)}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <Calendar className="h-8 w-8" />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {post.category && <span className="text-gold font-medium">{localizeBlogCategory(post.category, locale)}</span>}
                    {post.category && post.publishedAt && <span>·</span>}
                    {post.publishedAt && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(post.publishedAt).toLocaleDateString(locale === "ru" ? "ru-RU" : locale === "en" ? "en-GB" : "ro-RO", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-2 font-heading text-base font-bold group-hover:text-gold transition-colors">
                    {getLocalized(post, "title", locale)}
                  </h3>
                  {getLocalized(post, "excerpt", locale) && (
                    <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{getLocalized(post, "excerpt", locale)}</p>
                  )}
                  <span className="mt-auto pt-3 text-xs font-medium text-gold">
                    {t("common.readMore")} →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
