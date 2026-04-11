import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { artistPackages, artists, users } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";

// M1 #1 — Artist packages list + create.
// Public GET (listing for a single artist) so the profile page stays fast.
// POST requires the caller to own the artist (artists.userId = users.id via Clerk).

const packageSchema = z.object({
  artistId: z.number().int().positive(),
  nameRo: z.string().min(2).max(200),
  nameRu: z.string().max(200).optional().nullable(),
  nameEn: z.string().max(200).optional().nullable(),
  descriptionRo: z.string().max(2000).optional().nullable(),
  descriptionRu: z.string().max(2000).optional().nullable(),
  descriptionEn: z.string().max(2000).optional().nullable(),
  price: z.number().int().min(0).optional().nullable(),
  durationHours: z.number().min(0).max(240).optional().nullable(),
  isVisible: z.boolean().default(true),
});

async function requireArtistOwner(artistId: number) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return { ok: false as const, status: 401, error: "Unauthorized" };

  const [appUser] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) return { ok: false as const, status: 403, error: "Forbidden" };

  // Admins may edit any artist's packages.
  if (appUser.role === "admin") return { ok: true as const, userId: appUser.id };

  const [artist] = await db
    .select({ id: artists.id })
    .from(artists)
    .where(and(eq(artists.id, artistId), eq(artists.userId, appUser.id)))
    .limit(1);
  if (!artist) return { ok: false as const, status: 403, error: "Forbidden" };

  return { ok: true as const, userId: appUser.id };
}

// GET /api/artist-packages?artist_id=N → public list of packages for an artist.
// Admin/owner see all rows; visitors only see `isVisible=true` packages.
export async function GET(req: NextRequest) {
  const artistIdParam = req.nextUrl.searchParams.get("artist_id");
  if (!artistIdParam) {
    return NextResponse.json({ error: "artist_id required" }, { status: 400 });
  }
  const artistId = Number(artistIdParam);
  if (!Number.isFinite(artistId)) {
    return NextResponse.json({ error: "Invalid artist_id" }, { status: 400 });
  }

  // Determine if the caller can see hidden packages.
  const { userId: clerkId } = await auth();
  let canSeeHidden = false;
  if (clerkId) {
    const [appUser] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);
    if (appUser?.role === "admin") {
      canSeeHidden = true;
    } else if (appUser) {
      const [owned] = await db
        .select({ id: artists.id })
        .from(artists)
        .where(and(eq(artists.id, artistId), eq(artists.userId, appUser.id)))
        .limit(1);
      if (owned) canSeeHidden = true;
    }
  }

  const rows = await db
    .select()
    .from(artistPackages)
    .where(
      canSeeHidden
        ? eq(artistPackages.artistId, artistId)
        : and(eq(artistPackages.artistId, artistId), eq(artistPackages.isVisible, true)),
    )
    .orderBy(asc(artistPackages.id));

  return NextResponse.json(rows);
}

// POST /api/artist-packages → create a new package. Owner-only.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = packageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const owner = await requireArtistOwner(parsed.data.artistId);
  if (!owner.ok) {
    return NextResponse.json({ error: owner.error }, { status: owner.status });
  }

  const [created] = await db
    .insert(artistPackages)
    .values({
      artistId: parsed.data.artistId,
      nameRo: parsed.data.nameRo,
      nameRu: parsed.data.nameRu ?? null,
      nameEn: parsed.data.nameEn ?? null,
      descriptionRo: parsed.data.descriptionRo ?? null,
      descriptionRu: parsed.data.descriptionRu ?? null,
      descriptionEn: parsed.data.descriptionEn ?? null,
      price: parsed.data.price ?? null,
      durationHours: parsed.data.durationHours ?? null,
      isVisible: parsed.data.isVisible,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
