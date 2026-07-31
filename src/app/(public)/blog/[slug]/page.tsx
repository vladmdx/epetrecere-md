import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, Tag } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { blogPosts } from "@/lib/db/schema";
import { generateMeta } from "@/lib/seo/generate-meta";
import { articleJsonLd, breadcrumbJsonLd, safeJsonLd } from "@/lib/seo/jsonld";

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

  return generateMeta({
    title: post.seoTitleRo || post.titleRo,
    description:
      post.seoDescRo ||
      post.excerptRo ||
      post.contentRo?.replace(/<[^>]+>/g, "").substring(0, 155) ||
      "",
    entity: post,
    path: `/blog/${slug}`,
    type: "article",
    image: post.coverImageUrl || undefined,
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

  const publishedDate = post.publishedAt || post.createdAt;
  const jsonLd = articleJsonLd({
    title: post.titleRo,
    description:
      post.excerptRo ||
      post.contentRo?.replace(/<[^>]+>/g, "").substring(0, 155) ||
      "",
    url: `/blog/${slug}`,
    image: post.coverImageUrl || undefined,
    datePublished: publishedDate.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    category: post.category || undefined,
  });
  const crumbs = breadcrumbJsonLd([
    { name: "Acasă", url: "/" },
    { name: "Blog", url: "/blog" },
    { name: post.titleRo, url: `/blog/${slug}` },
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

      <header className="relative isolate overflow-hidden border-b border-white/8">
        {post.coverImageUrl ? (
          <Image
            src={post.coverImageUrl}
            alt={post.titleRo}
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
            Înapoi la blog
          </Link>
          <div className="mt-10 flex flex-wrap items-center gap-3 text-[11px]">
            {post.category && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/25 bg-black/30 px-3 py-1 font-semibold uppercase tracking-wider text-gold backdrop-blur">
                <Tag className="h-3 w-3" />
                {post.category}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 text-white/48">
              <Calendar className="h-3.5 w-3.5" />
              {publishedDate.toLocaleDateString("ro-RO", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>
          <h1 className="mt-5 max-w-4xl font-heading text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
            {post.titleRo}
          </h1>
          {post.excerptRo && (
            <p className="mt-6 max-w-2xl text-base leading-7 text-white/64 sm:text-lg">
              {post.excerptRo}
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-10 px-4 py-12 lg:grid-cols-[minmax(0,1fr)_190px] lg:px-8 lg:py-16">
        <div>
          {post.contentRo ? (
            <article
              className="prose prose-lg prose-invert max-w-none prose-headings:font-heading prose-headings:font-semibold prose-headings:text-[#edcf87] prose-p:leading-8 prose-p:text-white/68 prose-a:text-gold prose-a:no-underline hover:prose-a:underline prose-strong:text-white prose-li:text-white/66 prose-blockquote:border-gold prose-blockquote:text-white/56"
              dangerouslySetInnerHTML={{ __html: post.contentRo }}
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
              Transformă inspirația într-un plan clar pentru evenimentul tău.
            </p>
            <Link
              href="/planifica"
              className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-gold px-3 py-2.5 text-xs font-semibold text-[#0b0d12] hover:bg-gold-dark"
            >
              Planifică
            </Link>
          </div>
        </aside>
      </main>
    </div>
  );
}
