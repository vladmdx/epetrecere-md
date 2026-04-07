import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { blogPosts } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

function slugify(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").substring(0, 80);
}

export async function GET() {
  const posts = await db.select().from(blogPosts).orderBy(desc(blogPosts.createdAt)).limit(100);
  return NextResponse.json(posts);
}

export async function POST(req: Request) {
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
  const body = await req.json();
  const { id, ...data } = body;
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  await db.update(blogPosts).set({ ...data, updatedAt: new Date() }).where(eq(blogPosts.id, id));
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
  await db.delete(blogPosts).where(eq(blogPosts.id, Number(id)));
  return NextResponse.json({ success: true });
}
