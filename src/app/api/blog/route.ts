import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { blogPosts } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/admin";

function slugify(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").substring(0, 80);
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

  const body = await req.json();
  const slug = body.slug || slugify(body.titleRo || "post") + "-" + Date.now().toString(36);

  const [post] = await db.insert(blogPosts).values({
    titleRo: body.titleRo || "",
    titleRu: body.titleRu || null,
    titleEn: body.titleEn || null,
    slug,
    contentRo: body.contentRo || null,
    contentRu: body.contentRu || null,
    contentEn: body.contentEn || null,
    excerptRo: body.excerptRo || null,
    coverImageUrl: body.coverImageUrl || null,
    category: body.category || null,
    tags: body.tags || [],
    status: body.status || "draft",
    seoTitleRo: body.seoTitleRo || body.titleRo,
    seoDescRo: body.seoDescRo || body.excerptRo,
  }).returning();

  return NextResponse.json(post, { status: 201 });
}

export async function PUT(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const body = await req.json();
  const { id, ...data } = body;
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  await db.update(blogPosts).set({ ...data, updatedAt: new Date() }).where(eq(blogPosts.id, id));
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
  await db.delete(blogPosts).where(eq(blogPosts.id, Number(id)));
  return NextResponse.json({ success: true });
}
