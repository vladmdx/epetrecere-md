import type { Metadata } from "next";
import { db } from "@/lib/db";
import { blogPosts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Calendar, Tag, Edit } from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import { generateMeta } from "@/lib/seo/generate-meta";
import { articleJsonLd, breadcrumbJsonLd } from "@/lib/seo/jsonld";

interface Props {
  params: Promise<{ slug: string }>;
}

// SEO — blog posts are the primary long-tail content surface.
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
      post.seoDescRo || post.excerptRo || post.contentRo?.substring(0, 155) || "",
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

  if (!post) notFound();

  // Real blog post from DB
  const { userId } = await auth();

  const jsonLd = articleJsonLd({
    title: post.titleRo,
    description: post.excerptRo || post.contentRo?.substring(0, 155) || "",
    url: `/blog/${slug}`,
    image: post.coverImageUrl || undefined,
    datePublished: (post.publishedAt || post.createdAt).toISOString(),
    dateModified: post.updatedAt.toISOString(),
    category: post.category || undefined,
  });

  const crumbs = breadcrumbJsonLd([
    { name: "Acasă", url: "/" },
    { name: "Blog", url: "/blog" },
    { name: post.titleRo, url: `/blog/${slug}` },
  ]);

  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs) }}
      />
      {post.coverImageUrl && (
        <div className="relative h-[40vh] overflow-hidden">
          <img src={post.coverImageUrl} alt={post.titleRo} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0D0D0D] via-black/50 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-8">
            <div className="mx-auto max-w-3xl">
              <div className="flex items-center gap-3 text-sm text-[#D4D4E0] mb-3">
                {post.category && (
                  <>
                    <span className="text-gold font-medium flex items-center gap-1"><Tag className="h-3 w-3" /> {post.category}</span>
                    <span>·</span>
                  </>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("ro-RO") : new Date(post.createdAt).toLocaleDateString("ro-RO")}
                </span>
              </div>
              <h1 className="font-heading text-3xl font-bold text-white md:text-4xl">{post.titleRo}</h1>
            </div>
          </div>
        </div>
      )}

      {!post.coverImageUrl && (
        <div className="pt-24 pb-8 section-navy">
          <div className="mx-auto max-w-3xl px-4">
            <div className="flex items-center gap-3 text-sm text-[#D4D4E0] mb-3">
              {post.category && (
                <>
                  <span className="text-gold font-medium flex items-center gap-1"><Tag className="h-3 w-3" /> {post.category}</span>
                  <span>·</span>
                </>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("ro-RO") : new Date(post.createdAt).toLocaleDateString("ro-RO")}
              </span>
            </div>
            <h1 className="font-heading text-3xl font-bold md:text-4xl">{post.titleRo}</h1>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-gold transition-colors">
            <ArrowLeft className="h-4 w-4" /> Înapoi la pagina principală
          </Link>
          {userId && (
            <Link href={`/admin/blog/${post.id}`} className="ml-auto flex items-center gap-2 text-sm text-gold hover:text-gold-dark transition-colors">
              <Edit className="h-4 w-4" /> Editează în admin
            </Link>
          )}
        </div>
        {post.contentRo ? (
          <article
            className="prose prose-invert prose-gold max-w-none prose-headings:font-heading prose-headings:text-gold prose-p:text-[#D4D4E0] prose-a:text-gold"
            dangerouslySetInnerHTML={{ __html: post.contentRo }}
          />
        ) : (
          <p className="text-muted-foreground">Conținutul articolului nu este disponibil momentan.</p>
        )}
      </div>
    </div>
  );
}
