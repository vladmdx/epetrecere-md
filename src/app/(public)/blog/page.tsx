import type { Metadata } from "next";
import { db } from "@/lib/db";
import { blogPosts } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import Image from "next/image";
import { Calendar, Tag } from "lucide-react";
import { generateMeta } from "@/lib/seo/generate-meta";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";

export const metadata: Metadata = generateMeta({
  title: "Blog",
  description:
    "Sfaturi, idei și inspirație pentru organizarea evenimentelor perfecte în Moldova.",
  path: "/blog",
});

export default async function BlogListingPage() {
  const posts = await db
    .select()
    .from(blogPosts)
    .where(eq(blogPosts.status, "published"))
    .orderBy(desc(blogPosts.publishedAt), desc(blogPosts.createdAt))
    .limit(50);

  const crumbs = breadcrumbJsonLd([
    { name: "Acasă", url: "/" },
    { name: "Blog", url: "/blog" },
  ]);

  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs) }}
      />

      {/* Hero */}
      <section className="border-b border-border/40 bg-gradient-to-b from-card to-background py-12">
        <div className="container mx-auto max-w-4xl px-4 text-center">
          <h1 className="font-heading text-3xl font-bold md:text-4xl">Blog</h1>
          <p className="mt-2 text-muted-foreground">
            Sfaturi, idei și inspirație pentru evenimentele tale
          </p>
        </div>
      </section>

      {/* Posts Grid */}
      <section className="container mx-auto max-w-6xl px-4 py-12">
        {posts.length === 0 ? (
          <p className="text-center text-muted-foreground py-20">
            Nu există articole publicate momentan.
          </p>
        ) : (
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <Link
                key={post.id}
                href={`/blog/${post.slug}`}
                className="group flex flex-col overflow-hidden rounded-xl border border-border/40 bg-card transition-all hover:border-gold/30 hover:shadow-lg"
              >
                {post.coverImageUrl ? (
                  <div className="relative aspect-[16/9] overflow-hidden bg-muted">
                    <Image
                      src={post.coverImageUrl}
                      alt={post.titleRo}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                ) : (
                  <div className="flex aspect-[16/9] items-center justify-center bg-muted text-4xl">
                    📝
                  </div>
                )}
                <div className="flex flex-1 flex-col p-5">
                  <h2 className="font-heading text-lg font-bold line-clamp-2 group-hover:text-gold transition-colors">
                    {post.titleRo}
                  </h2>
                  {post.excerptRo && (
                    <p className="mt-2 text-sm text-muted-foreground line-clamp-3">
                      {post.excerptRo}
                    </p>
                  )}
                  <div className="mt-auto flex items-center gap-4 pt-4 text-xs text-muted-foreground">
                    {(post.publishedAt || post.createdAt) && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(
                          post.publishedAt || post.createdAt,
                        ).toLocaleDateString("ro-RO", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    )}
                    {post.category && (
                      <span className="flex items-center gap-1">
                        <Tag className="h-3 w-3" />
                        {post.category}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
