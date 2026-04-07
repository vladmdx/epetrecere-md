import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { artists, users, notifications } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

const registerSchema = z.object({
  clerkUserId: z.string(),
  email: z.string(),
  name: z.string().min(2),
  phone: z.string().min(6),
  categoryId: z.number(),
  description: z.string().optional(),
  location: z.string().optional(),
  imageUrl: z.string().optional(),
});

function slugify(text: string): string {
  const cyMap: Record<string, string> = {
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i',
    'й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t',
    'у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y',
    'ь':'','э':'e','ю':'yu','я':'ya',
  };
  const transliterated = text.split('').map(c => cyMap[c.toLowerCase()] || c).join('');
  return transliterated.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 80);
}

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const data = parsed.data;
  let slug = slugify(data.name);
  slug = `${slug}-${Date.now().toString(36)}`;

  // Create artist (inactive — needs admin approval)
  const [artist] = await db.insert(artists).values({
    nameRo: data.name,
    nameRu: data.name,
    nameEn: data.name,
    slug,
    phone: data.phone,
    email: data.email,
    descriptionRo: data.description || null,
    location: data.location || "Chișinău",
    categoryIds: [data.categoryId],
    isActive: false, // Needs admin approval
    isVerified: false,
    isFeatured: false,
    isPremium: false,
    calendarEnabled: false,
    seoTitleRo: `${data.name} — Artist Evenimente | ePetrecere.md`,
  }).returning();

  // Update user role to artist in our DB
  await db.execute(
    sql`UPDATE users SET role = 'artist' WHERE clerk_id = ${data.clerkUserId}`,
  );

  // Create notification for admin
  const admins = await db.select().from(users).where(eq(users.role, "super_admin"));
  for (const admin of admins) {
    await db.insert(notifications).values({
      userId: admin.id,
      type: "artist_registered",
      title: "Artist nou înregistrat!",
      message: `${data.name} (${data.email}) s-a înregistrat ca artist și așteaptă aprobare.`,
      actionUrl: `/admin/artisti/${artist.id}`,
    });
  }

  return NextResponse.json({ success: true, artistId: artist.id });
}
