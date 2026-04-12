import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { artistImages, artists, users } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";

// F-A4 (gallery) — Artist gallery images CRUD.
//
// Paired with the Vercel Blob upload endpoint at /api/upload: the client
// uploads the file to blob storage, then POSTs the returned URL here
// along with alt text + cover flag. Rows are scoped by artist_id and
// owner-gated (artists.userId === users.id from Clerk) so one artist
// can't write into another's gallery. Admins can write any row.
//
// GET is public so the same endpoint can power the public artist detail
// page gallery. No authentication needed to read.

const createSchema = z.object({
  artistId: z.number().int().positive(),
  url: z.string().url(),
  altRo: z.string().max(500).optional().nullable(),
  altRu: z.string().max(500).optional().nullable(),
  altEn: z.string().max(500).optional().nullable(),
  isCover: z.boolean().default(false),
});

async function requireArtistOwner(artistId: number) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }

  const [appUser] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  // Admins bypass the ownership check so they can curate galleries in
  // the admin dashboard without standing up a separate endpoint.
  if (appUser.role === "admin" || appUser.role === "super_admin") {
    return { ok: true as const, userId: appUser.id };
  }

  const [artist] = await db
    .select({ id: artists.id })
    .from(artists)
    .where(and(eq(artists.id, artistId), eq(artists.userId, appUser.id)))
    .limit(1);
  if (!artist) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return { ok: true as const, userId: appUser.id };
}

// GET /api/artist-images?artist_id=N — public list of gallery images.
// Sorted by sort_order asc so the cover (or whatever the owner wanted
// first) shows up at the top.
export async function GET(req: NextRequest) {
  const artistIdParam = req.nextUrl.searchParams.get("artist_id");
  if (!artistIdParam) {
    return NextResponse.json({ error: "artist_id required" }, { status: 400 });
  }
  const artistId = Number(artistIdParam);
  if (!Number.isFinite(artistId)) {
    return NextResponse.json({ error: "Invalid artist_id" }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(artistImages)
    .where(eq(artistImages.artistId, artistId))
    .orderBy(asc(artistImages.sortOrder), asc(artistImages.id));

  return NextResponse.json(rows);
}

// POST /api/artist-images — attach an uploaded blob to an artist.
// Owner-only. When `isCover` is true we demote all other rows on the
// same artist first, so there's always exactly one cover at a time.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
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

  if (parsed.data.isCover) {
    await db
      .update(artistImages)
      .set({ isCover: false })
      .where(eq(artistImages.artistId, parsed.data.artistId));
  }

  const [created] = await db
    .insert(artistImages)
    .values({
      artistId: parsed.data.artistId,
      url: parsed.data.url,
      altRo: parsed.data.altRo ?? null,
      altRu: parsed.data.altRu ?? null,
      altEn: parsed.data.altEn ?? null,
      isCover: parsed.data.isCover,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
