import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { artists, users, notifications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { slugify } from "@/lib/utils/slugify";

const registerSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(6),
  categoryId: z.number(),
  description: z.string().optional(),
  location: z.string().optional(),
  imageUrl: z.string().optional(),
});

export async function POST(req: Request) {
  // Auth: use Clerk session instead of trusting client-supplied clerkUserId
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  // Look up the app user by clerkId
  const [appUser] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  if (!appUser) {
    return NextResponse.json({ error: "User not found in database" }, { status: 404 });
  }

  // Check if already registered as artist
  const [existingArtist] = await db
    .select({ id: artists.id })
    .from(artists)
    .where(eq(artists.userId, appUser.id))
    .limit(1);

  if (existingArtist) {
    return NextResponse.json({ error: "Already registered as artist", artistId: existingArtist.id }, { status: 409 });
  }

  const data = parsed.data;
  let slug = slugify(data.name);
  slug = `${slug}-${Date.now().toString(36)}`;

  // Create artist (inactive — needs admin approval) with userId link
  const [artist] = await db.insert(artists).values({
    userId: appUser.id,
    nameRo: data.name,
    nameRu: data.name,
    nameEn: data.name,
    slug,
    phone: data.phone,
    email: appUser.email,
    descriptionRo: data.description || null,
    location: data.location || "Chișinău",
    categoryIds: [data.categoryId],
    isActive: false,
    isVerified: false,
    isFeatured: false,
    isPremium: false,
    calendarEnabled: false,
    seoTitleRo: `${data.name} — Artist Evenimente | ePetrecere.md`,
  }).returning();

  // Update user role to artist
  await db.update(users).set({ role: "artist" }).where(eq(users.id, appUser.id));

  // Notify admins
  const admins = await db.select().from(users).where(eq(users.role, "super_admin"));
  for (const admin of admins) {
    await db.insert(notifications).values({
      userId: admin.id,
      type: "artist_registered",
      title: "Artist nou înregistrat!",
      message: `${data.name} (${appUser.email}) s-a înregistrat ca artist și așteaptă aprobare.`,
      actionUrl: `/admin/artisti/${artist.id}`,
    });
  }

  return NextResponse.json({ success: true, artistId: artist.id });
}
