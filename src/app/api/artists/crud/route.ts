import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { artists, artistImages, artistVideos, artistPackages } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const artistSchema = z.object({
  nameRo: z.string().min(2),
  nameRu: z.string().optional(),
  nameEn: z.string().optional(),
  slug: z.string().optional(),
  descriptionRo: z.string().optional(),
  descriptionRu: z.string().optional(),
  descriptionEn: z.string().optional(),
  categoryIds: z.array(z.number()).optional(),
  priceFrom: z.number().optional(),
  priceCurrency: z.string().default("EUR"),
  location: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),
  instagram: z.string().optional(),
  facebook: z.string().optional(),
  youtube: z.string().optional(),
  tiktok: z.string().optional(),
  isActive: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
  isVerified: z.boolean().default(false),
  isPremium: z.boolean().default(false),
  calendarEnabled: z.boolean().default(false),
  bufferHours: z.number().default(2),
  seoTitleRo: z.string().optional(),
  seoTitleRu: z.string().optional(),
  seoTitleEn: z.string().optional(),
  seoDescRo: z.string().optional(),
  seoDescRu: z.string().optional(),
  seoDescEn: z.string().optional(),
});

// CREATE artist
export async function POST(req: Request) {
  const body = await req.json();
  const parsed = artistSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  }

  const data = parsed.data;
  let slug = data.slug || slugify(data.nameRo);

  // Ensure unique slug
  const existing = await db.select({ id: artists.id }).from(artists).where(eq(artists.slug, slug)).limit(1);
  if (existing.length > 0) {
    slug = `${slug}-${Date.now()}`;
  }

  const [artist] = await db.insert(artists).values({
    ...data,
    slug,
    seoTitleRo: data.seoTitleRo || `${data.nameRo} — Artist Evenimente | ePetrecere.md`,
    seoDescRo: data.seoDescRo || data.descriptionRo?.substring(0, 155),
  }).returning();

  return NextResponse.json(artist, { status: 201 });
}

// UPDATE artist
export async function PUT(req: Request) {
  const body = await req.json();
  const { id, ...data } = body;

  if (!id) {
    return NextResponse.json({ error: "ID required" }, { status: 400 });
  }

  await db.update(artists).set({
    ...data,
    updatedAt: new Date(),
  }).where(eq(artists.id, id));

  const [updated] = await db.select().from(artists).where(eq(artists.id, id)).limit(1);
  return NextResponse.json(updated);
}

// DELETE artist
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "ID required" }, { status: 400 });
  }

  await db.delete(artists).where(eq(artists.id, Number(id)));
  return NextResponse.json({ success: true });
}
