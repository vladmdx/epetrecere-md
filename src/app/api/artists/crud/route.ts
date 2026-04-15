import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { artists, redirects, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { slugify } from "@/lib/utils/slugify";

// F-A4 auth lockdown — until this fix the endpoint accepted anonymous
// POST/PUT/DELETE against any artist row. Ownership model is:
//
//   super_admin / admin → full CRUD on any artist (used by /admin/artisti)
//   artist (signed-in)  → PUT only on the artist whose `userId` matches
//                         their app-user id; cannot toggle protected flags
//                         (isActive / isFeatured / isVerified / isPremium
//                         / userId) — those are admin-only
//   anyone else         → 401 / 403 on every mutation
//
// Regular onboarding still goes through `/api/auth/register-artist`, so
// POST here is admin-only.

type AuthedUser = { id: string; role: string };

async function requireAuthedUser(): Promise<
  | { ok: true; user: AuthedUser }
  | { ok: false; status: 401 | 403; error: string }
> {
  const { userId: clerkId } = await auth();
  if (!clerkId) return { ok: false, status: 401, error: "Unauthorized" };

  const [appUser] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) return { ok: false, status: 401, error: "User not found" };

  return { ok: true, user: { id: appUser.id, role: appUser.role as string } };
}

function isAdmin(user: AuthedUser) {
  return user.role === "super_admin" || user.role === "admin";
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
  autoReplyEnabled: z.boolean().optional(),
  autoReplyMessage: z.string().optional(),
  photoUrl: z.string().nullable().optional(),
  seoTitleRo: z.string().optional(),
  seoTitleRu: z.string().optional(),
  seoTitleEn: z.string().optional(),
  seoDescRo: z.string().optional(),
  seoDescRu: z.string().optional(),
  seoDescEn: z.string().optional(),
});

// Fields an owner is NOT allowed to set on themselves — only admins can flip
// these from the admin dashboard.
const OWNER_PROTECTED_FIELDS = [
  "isActive",
  "isFeatured",
  "isVerified",
  "isPremium",
  "userId",
] as const;

// CREATE artist — admin only. Regular signup goes through
// `/api/auth/register-artist` which also sets the inactive flag and
// creates the moderation notification.
export async function POST(req: Request) {
  const gate = await requireAuthedUser();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  if (!isAdmin(gate.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = artistSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const data = parsed.data;
  let slug = data.slug || slugify(data.nameRo);

  // Ensure unique slug
  const existing = await db
    .select({ id: artists.id })
    .from(artists)
    .where(eq(artists.slug, slug))
    .limit(1);
  if (existing.length > 0) {
    slug = `${slug}-${Date.now()}`;
  }

  const [artist] = await db
    .insert(artists)
    .values({
      ...data,
      slug,
      seoTitleRo:
        data.seoTitleRo || `${data.nameRo} — Artist Evenimente | ePetrecere.md`,
      seoDescRo: data.seoDescRo || data.descriptionRo?.substring(0, 155),
    })
    .returning();

  return NextResponse.json(artist, { status: 201 });
}

// UPDATE artist — admin or the artist's owner.
export async function PUT(req: Request) {
  const gate = await requireAuthedUser();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const body = await req.json();
  const { id, ...rawData } = body as { id?: number } & Record<string, unknown>;

  if (!id || !Number.isFinite(Number(id))) {
    return NextResponse.json({ error: "ID required" }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(artists)
    .where(eq(artists.id, Number(id)))
    .limit(1);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const admin = isAdmin(gate.user);
  const isOwner = existing.userId === gate.user.id;

  if (!admin && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Owners cannot touch moderation flags or reassign ownership.
  let data = rawData;
  if (!admin) {
    const filtered = { ...rawData };
    for (const key of OWNER_PROTECTED_FIELDS) {
      delete filtered[key];
    }
    data = filtered;
  }

  // AD-29: detect slug change and record redirect
  const oldSlug = existing.slug;
  const newSlug = typeof data.slug === "string" ? data.slug : oldSlug;
  const slugChanged = newSlug !== oldSlug;

  await db
    .update(artists)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(artists.id, Number(id)));

  if (slugChanged) {
    await db.insert(redirects).values({
      fromPath: `/artisti/${oldSlug}`,
      toPath: `/artisti/${newSlug}`,
    });
  }

  const [updated] = await db
    .select()
    .from(artists)
    .where(eq(artists.id, Number(id)))
    .limit(1);
  return NextResponse.json(updated);
}

// DELETE artist — admin only. Artists who want off the platform go through
// the account-deletion flow.
export async function DELETE(req: NextRequest) {
  const gate = await requireAuthedUser();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  if (!isAdmin(gate.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "ID required" }, { status: 400 });
  }

  await db.delete(artists).where(eq(artists.id, Number(id)));
  return NextResponse.json({ success: true });
}
