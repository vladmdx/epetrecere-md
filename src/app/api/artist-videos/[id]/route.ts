import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { artistVideos, artists, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// F-A4 (video) — Update / delete a single video row. Owner-only.
//
// PUT is intentionally narrow — editable fields are title + sortOrder.
// If the owner wants to change the actual video they should delete and
// re-add so the platform/video_id stay in lockstep with the URL they
// actually pasted.

const updateSchema = z.object({
  title: z.string().max(200).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

async function loadOwnedVideo(videoId: number) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }

  const [row] = await db
    .select({
      videoId: artistVideos.id,
      artistId: artistVideos.artistId,
      ownerId: artists.userId,
    })
    .from(artistVideos)
    .leftJoin(artists, eq(artists.id, artistVideos.artistId))
    .where(eq(artistVideos.id, videoId))
    .limit(1);

  if (!row) {
    return { ok: false as const, status: 404, error: "Not found" };
  }

  const [appUser] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  const isAdmin = appUser.role === "admin" || appUser.role === "super_admin";
  if (!isAdmin && row.ownerId !== appUser.id) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return {
    ok: true as const,
    videoId: row.videoId,
    artistId: row.artistId,
  };
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const videoId = Number(id);
  if (!Number.isFinite(videoId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const owner = await loadOwnedVideo(videoId);
  if (!owner.ok) {
    return NextResponse.json({ error: owner.error }, { status: owner.status });
  }

  await db
    .update(artistVideos)
    .set(parsed.data)
    .where(eq(artistVideos.id, videoId));

  const [updated] = await db
    .select()
    .from(artistVideos)
    .where(eq(artistVideos.id, videoId))
    .limit(1);

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const videoId = Number(id);
  if (!Number.isFinite(videoId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const owner = await loadOwnedVideo(videoId);
  if (!owner.ok) {
    return NextResponse.json({ error: owner.error }, { status: owner.status });
  }

  await db.delete(artistVideos).where(eq(artistVideos.id, videoId));
  return NextResponse.json({ success: true });
}
