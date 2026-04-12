import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { artistVideos, artists, users } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";

// F-A4 (video) — Artist video embeds (YouTube / Vimeo).
//
// The profile editor lets artists paste a URL; we parse out the
// platform + video id here so the public page can embed without
// re-parsing. Raw URLs are rejected with 400 so the row is always
// renderable.
//
// Shape mirrors `/api/artist-images` — public GET, owner-gated POST —
// so the profile page can reuse the same fetch/post pattern.

const createSchema = z
  .object({
    artistId: z.number().int().positive(),
    url: z.string().url(),
    title: z.string().max(200).optional().nullable(),
  })
  .strict();

type ParsedVideo = { platform: "youtube" | "vimeo"; videoId: string };

/** Extract platform + id from a YouTube or Vimeo URL.
 *  Returns null if the URL doesn't match a known pattern. */
function parseVideoUrl(raw: string): ParsedVideo | null {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    // YouTube: watch?v=, youtu.be/, /embed/, /shorts/
    if (host.includes("youtube.com") || host === "youtu.be") {
      if (host === "youtu.be") {
        const id = url.pathname.replace(/^\//, "");
        return id ? { platform: "youtube", videoId: id } : null;
      }
      const v = url.searchParams.get("v");
      if (v) return { platform: "youtube", videoId: v };
      const parts = url.pathname.split("/").filter(Boolean);
      const marker = parts.indexOf("embed") >= 0 ? "embed" : "shorts";
      const idx = parts.indexOf(marker);
      if (idx >= 0 && parts[idx + 1]) {
        return { platform: "youtube", videoId: parts[idx + 1]! };
      }
      return null;
    }
    // Vimeo: vimeo.com/<id> or player.vimeo.com/video/<id>
    if (host.includes("vimeo.com")) {
      const parts = url.pathname.split("/").filter(Boolean);
      const last = parts[parts.length - 1];
      if (last && /^\d+$/.test(last)) {
        return { platform: "vimeo", videoId: last };
      }
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

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
    .from(artistVideos)
    .where(eq(artistVideos.artistId, artistId))
    .orderBy(asc(artistVideos.sortOrder), asc(artistVideos.id));

  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const video = parseVideoUrl(parsed.data.url);
  if (!video) {
    return NextResponse.json(
      {
        error:
          "Invalid video URL — only YouTube and Vimeo links are supported",
      },
      { status: 400 },
    );
  }

  const owner = await requireArtistOwner(parsed.data.artistId);
  if (!owner.ok) {
    return NextResponse.json({ error: owner.error }, { status: owner.status });
  }

  const [created] = await db
    .insert(artistVideos)
    .values({
      artistId: parsed.data.artistId,
      platform: video.platform,
      videoId: video.videoId,
      title: parsed.data.title ?? null,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
