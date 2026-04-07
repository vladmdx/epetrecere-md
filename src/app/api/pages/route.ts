import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const allPages = await db.select().from(pages);
  return NextResponse.json(allPages);
}

export async function PUT(req: Request) {
  const body = await req.json();
  const { id, ...data } = body;
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
  await db.update(pages).set({ ...data, updatedAt: new Date() }).where(eq(pages.id, id));
  return NextResponse.json({ success: true });
}

export async function POST(req: Request) {
  const body = await req.json();
  const [page] = await db.insert(pages).values({
    slug: body.slug,
    titleRo: body.titleRo || "",
    contentRo: body.contentRo || null,
    isSystem: body.isSystem || false,
  }).returning();
  return NextResponse.json(page, { status: 201 });
}
