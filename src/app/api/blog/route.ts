import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { blogPosts } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/admin";
import { slugify } from "@/lib/utils/slugify";
import { z } from "zod/v4";

const optionalText = (max: number) =>
  z.string().trim().max(max).nullish().transform((value) => value || null);

const blogWriteSchema = z.object({
  titleRo: z.string().trim().min(1, "Titlul în română este obligatoriu").max(240),
  titleRu: optionalText(240),
  titleEn: optionalText(240),
  slug: z.string().trim().max(260).optional(),
  contentRo: optionalText(500_000),
  contentRu: optionalText(500_000),
  contentEn: optionalText(500_000),
  excerptRo: optionalText(1_000),
  excerptRu: optionalText(1_000),
  excerptEn: optionalText(1_000),
  coverImageUrl: optionalText(2_000),
  category: optionalText(120),
  tags: z.array(z.string().trim().min(1).max(80)).max(30).optional().default([]),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  publishedAt: z
    .union([z.string().datetime(), z.literal("")])
    .nullish()
    .transform((value) => value || null),
  seoTitleRo: optionalText(120),
  seoTitleRu: optionalText(120),
  seoTitleEn: optionalText(120),
  seoDescRo: optionalText(320),
  seoDescRu: optionalText(320),
  seoDescEn: optionalText(320),
});

function validationError(error: z.ZodError) {
  return NextResponse.json(
    {
      error: error.issues[0]?.message || "Date articol invalide",
      issues: error.issues,
    },
    { status: 400 },
  );
}

// GET — public (blog listing used by the public page).
// By default only published posts are returned.
// Admin callers can pass ?all=true to include drafts.
export async function GET(req: NextRequest) {
  const showAll = req.nextUrl.searchParams.get("all") === "true";

  if (showAll) {
    const admin = await requireAdmin();
    if (!admin.ok) {
      return NextResponse.json({ error: admin.error }, { status: admin.status });
    }
    const posts = await db.select().from(blogPosts).orderBy(desc(blogPosts.createdAt)).limit(100);
    return NextResponse.json(posts);
  }

  const posts = await db
    .select()
    .from(blogPosts)
    .where(eq(blogPosts.status, "published"))
    .orderBy(desc(blogPosts.createdAt))
    .limit(100);
  return NextResponse.json(posts);
}

// SEC — blog CMS writes are admin-only. Anonymous access would let
// anyone create, edit, or delete blog posts.

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const parsed = blogWriteSchema.safeParse(await req.json());
  if (!parsed.success) return validationError(parsed.error);
  const body = parsed.data;
  const slug =
    (body.slug && slugify(body.slug)) ||
    `${slugify(body.titleRo)}-${Date.now().toString(36)}`;

  const [post] = await db.insert(blogPosts).values({
    titleRo: body.titleRo,
    titleRu: body.titleRu,
    titleEn: body.titleEn,
    slug,
    contentRo: body.contentRo,
    contentRu: body.contentRu,
    contentEn: body.contentEn,
    excerptRo: body.excerptRo,
    excerptRu: body.excerptRu,
    excerptEn: body.excerptEn,
    coverImageUrl: body.coverImageUrl,
    category: body.category,
    tags: body.tags,
    authorId: admin.userId,
    status: body.status,
    publishedAt:
      body.publishedAt
        ? new Date(body.publishedAt)
        : body.status === "published"
          ? new Date()
          : null,
    seoTitleRo: body.seoTitleRo || body.titleRo,
    seoTitleRu: body.seoTitleRu,
    seoTitleEn: body.seoTitleEn,
    seoDescRo: body.seoDescRo || body.excerptRo,
    seoDescRu: body.seoDescRu,
    seoDescEn: body.seoDescEn,
  }).returning();

  return NextResponse.json(post, { status: 201 });
}

export async function PUT(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const raw = await req.json();
  const id = Number(raw.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "ID invalid" }, { status: 400 });
  }
  const parsed = blogWriteSchema.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);
  const body = parsed.data;

  const [post] = await db
    .update(blogPosts)
    .set({
      titleRo: body.titleRo,
      titleRu: body.titleRu,
      titleEn: body.titleEn,
      contentRo: body.contentRo,
      contentRu: body.contentRu,
      contentEn: body.contentEn,
      excerptRo: body.excerptRo,
      excerptRu: body.excerptRu,
      excerptEn: body.excerptEn,
      coverImageUrl: body.coverImageUrl,
      category: body.category,
      tags: body.tags,
      status: body.status,
      publishedAt:
        body.publishedAt
          ? new Date(body.publishedAt)
          : body.status === "published"
            ? new Date()
            : null,
      seoTitleRo: body.seoTitleRo || body.titleRo,
      seoTitleRu: body.seoTitleRu,
      seoTitleEn: body.seoTitleEn,
      seoDescRo: body.seoDescRo || body.excerptRo,
      seoDescRu: body.seoDescRu,
      seoDescEn: body.seoDescEn,
      updatedAt: new Date(),
    })
    .where(eq(blogPosts.id, id))
    .returning();

  if (!post) {
    return NextResponse.json({ error: "Articol inexistent" }, { status: 404 });
  }
  return NextResponse.json(post);
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const id = req.nextUrl.searchParams.get("id");
  const postId = Number(id);
  if (!Number.isInteger(postId) || postId <= 0) {
    return NextResponse.json({ error: "ID invalid" }, { status: 400 });
  }
  const [deleted] = await db
    .delete(blogPosts)
    .where(eq(blogPosts.id, postId))
    .returning({ id: blogPosts.id });
  if (!deleted) {
    return NextResponse.json({ error: "Articol inexistent" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
