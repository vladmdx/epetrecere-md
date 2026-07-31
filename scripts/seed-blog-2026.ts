import { eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { blogPosts } from "../src/lib/db/schema";
import { EDITORIAL_POSTS_2026 } from "../src/lib/blog/editorial-posts-2026";

async function main() {
  for (const post of EDITORIAL_POSTS_2026) {
    const values = {
      titleRo: post.titleRo,
      titleRu: post.titleRu,
      titleEn: post.titleEn,
      slug: post.slug,
      contentRo: post.contentRo.trim(),
      contentRu: post.contentRu.trim(),
      contentEn: post.contentEn.trim(),
      excerptRo: post.excerptRo,
      excerptRu: post.excerptRu,
      excerptEn: post.excerptEn,
      coverImageUrl: post.coverImageUrl,
      category: post.category,
      tags: post.tags,
      status: "published" as const,
      publishedAt: new Date(),
      seoTitleRo: post.seoTitleRo,
      seoTitleRu: post.seoTitleRu,
      seoTitleEn: post.seoTitleEn,
      seoDescRo: post.seoDescRo,
      seoDescRu: post.seoDescRu,
      seoDescEn: post.seoDescEn,
      updatedAt: new Date(),
    };

    const [existing] = await db
      .select({ id: blogPosts.id })
      .from(blogPosts)
      .where(eq(blogPosts.slug, post.slug))
      .limit(1);

    if (existing) {
      await db.update(blogPosts).set(values).where(eq(blogPosts.id, existing.id));
      process.stdout.write(`updated ${post.slug}\n`);
    } else {
      await db.insert(blogPosts).values(values);
      process.stdout.write(`created ${post.slug}\n`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
