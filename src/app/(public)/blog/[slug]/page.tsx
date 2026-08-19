import type { Metadata } from "next";
import Image from "next/image";
import Link from "@/components/shared/locale-link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, Tag } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { blogPosts } from "@/lib/db/schema";
import { getLocalized } from "@/i18n";
import { getServerLocale } from "@/lib/i18n/server-locale";
import { findEditorialPost2026 } from "@/lib/blog/editorial-posts-2026";
import { generateMeta } from "@/lib/seo/generate-meta";
import { articleJsonLd, breadcrumbJsonLd, faqJsonLd, safeJsonLd } from "@/lib/seo/jsonld";
import { localizeBlogCategory } from "@/i18n/blog-categories";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [post] = await db
    .select()
    .from(blogPosts)
    .where(eq(blogPosts.slug, slug))
    .limit(1);

  if (!post) return {};
  const locale = await getServerLocale();
  const title = getLocalized(post, "seoTitle", locale) || getLocalized(post, "title", locale);
  const excerpt = getLocalized(post, "seoDesc", locale) || getLocalized(post, "excerpt", locale);
  const content = getLocalized(post, "content", locale);

  return generateMeta({
    title,
    description:
      excerpt ||
      content.replace(/<[^>]+>/g, "").substring(0, 155) ||
      "",
    entity: post,
    path: `/blog/${slug}`,
    type: "article",
    image: post.coverImageUrl || undefined,
    locale,
  });
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const [post] = await db
    .select()
    .from(blogPosts)
    .where(eq(blogPosts.slug, slug))
    .limit(1);

  if (!post || post.status !== "published") notFound();

  const locale = await getServerLocale();
  const title = getLocalized(post, "title", locale);
  const excerpt = getLocalized(post, "excerpt", locale);
  const content = getLocalized(post, "content", locale);
  const editorial = findEditorialPost2026(slug);
  const coverAlt = editorial
    ? locale === "ru"
      ? editorial.coverAltRu
      : locale === "en"
        ? editorial.coverAltEn
        : editorial.coverAltRo
    : title;
  const faq = editorial?.faq[locale] || [];
  const labels = {
    ro: { home: "Acasă", back: "Înapoi la blog", plan: "Planifică", cta: "Transformă inspirația într-un plan clar pentru evenimentul tău." },
    ru: { home: "Главная", back: "Вернуться в блог", plan: "Планировать", cta: "Превратите вдохновение в четкий план вашего события." },
    en: { home: "Home", back: "Back to blog", plan: "Start planning", cta: "Turn inspiration into a clear plan for your event." },
  }[locale];
  const dateLocale = locale === "ru" ? "ru-RU" : locale === "en" ? "en-GB" : "ro-RO";
  const publishedDate = post.publishedAt || post.createdAt;
  const jsonLd = articleJsonLd({
    title,
    description:
      excerpt ||
      content.replace(/<[^>]+>/g, "").substring(0, 155) ||
      "",
    url: `/blog/${slug}`,
    image: post.coverImageUrl || undefined,
    datePublished: publishedDate.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    category: post.category || undefined,
  });
  const crumbs = breadcrumbJsonLd([
    { name: labels.home, url: "/" },
    { name: "Blog", url: "/blog" },
    { name: title, url: `/blog/${slug}` },
  ]);

  return (
    <div className="-mt-16 min-h-screen bg-[#05080d] pt-16 text-[#f6f0e5]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(crumbs) }}
      />
      {faq.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd(faq)) }}
        />
      )}

      <header className="relative isolate overflow-hidden border-b border-white/8">
        {post.coverImageUrl ? (
          <Image
            src={post.coverImageUrl}
            alt={coverAlt}
            fill
            priority
            sizes="100vw"
            className="absolute inset-0 -z-20 object-cover"
          />
        ) : (
          <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_70%_35%,rgba(230,184,77,.2),transparent_26%),linear-gradient(135deg,#151b28,#070a10)]" />
        )}
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(5,8,13,.99),rgba(5,8,13,.88)_58%,rgba(5,8,13,.58))]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-transparent to-[#05080d]" />

        <div className="mx-auto max-w-5xl px-4 pb-14 pt-20 lg:px-8 lg:pb-20 lg:pt-28">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-xs text-white/52 transition hover:text-gold"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {labels.back}
          </Link>
          <div className="mt-10 flex flex-wrap items-center gap-3 text-[11px]">
            {post.category && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/25 bg-black/30 px-3 py-1 font-semibold uppercase tracking-wider text-gold backdrop-blur">
                <Tag className="h-3 w-3" />
                {localizeBlogCategory(post.category, locale)}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 text-white/48">
              <Calendar className="h-3.5 w-3.5" />
              {publishedDate.toLocaleDateString(dateLocale, {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>
          <h1 className="mt-5 max-w-4xl font-heading text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
            {title}
          </h1>
          {excerpt && (
            <p className="mt-6 max-w-2xl text-base leading-7 text-white/64 sm:text-lg">
              {excerpt}
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-10 px-4 py-12 lg:grid-cols-[minmax(0,1fr)_190px] lg:px-8 lg:py-16">
        <div>
          {content ? (
            <article
              className="prose prose-lg prose-invert max-w-none prose-headings:font-heading prose-headings:font-semibold prose-headings:text-[#edcf87] prose-p:leading-8 prose-p:text-white/68 prose-a:text-gold prose-a:no-underline hover:prose-a:underline prose-strong:text-white prose-li:text-white/66 prose-blockquote:border-gold prose-blockquote:text-white/56"
              dangerouslySetInnerHTML={{ __html: content }}
            />
          ) : (
            <div className="rounded-xl border border-white/8 bg-white/[.025] p-6 text-sm text-white/52">
              Conținutul articolului nu este disponibil momentan.
            </div>
          )}
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-xl border border-gold/16 bg-[#0d1119] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-gold">
              ePetrecere.md
            </p>
            <p className="mt-3 text-xs leading-5 text-white/48">
              {labels.cta}
            </p>
            <Link
              href="/planifica"
              className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-gold px-3 py-2.5 text-xs font-semibold text-[#0b0d12] hover:bg-gold-dark"
            >
              {labels.plan}
            </Link>
          </div>
        </aside>
      </main>
    </div>
  );
}
