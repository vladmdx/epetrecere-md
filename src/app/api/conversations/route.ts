import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { conversations, users, artists } from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";

// M0b #10 — Persistent pre-booking chat.
// GET /api/conversations — list conversations for the signed-in user.
//   ?role=client (default) lists conversations where the user is the client.
//   ?role=artist lists conversations for the artist owned by the current user.
export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return NextResponse.json([], { status: 200 });
  }

  const role = req.nextUrl.searchParams.get("role") || "client";

  if (role === "artist") {
    // Find the artist owned by this user.
    const [artist] = await db
      .select({ id: artists.id })
      .from(artists)
      .where(eq(artists.userId, appUser.id))
      .limit(1);
    if (!artist) return NextResponse.json([]);

    const rows = await db
      .select({
        id: conversations.id,
        artistId: conversations.artistId,
        clientUserId: conversations.clientUserId,
        lastMessageAt: conversations.lastMessageAt,
        lastMessagePreview: conversations.lastMessagePreview,
        clientUnread: conversations.clientUnread,
        artistUnread: conversations.artistUnread,
        createdAt: conversations.createdAt,
        clientName: users.name,
        clientEmail: users.email,
      })
      .from(conversations)
      .leftJoin(users, eq(users.id, conversations.clientUserId))
      .where(eq(conversations.artistId, artist.id))
      .orderBy(desc(conversations.lastMessageAt));

    return NextResponse.json(rows);
  }

  // Default: client role — conversations initiated by this user.
  const rows = await db
    .select({
      id: conversations.id,
      artistId: conversations.artistId,
      clientUserId: conversations.clientUserId,
      lastMessageAt: conversations.lastMessageAt,
      lastMessagePreview: conversations.lastMessagePreview,
      clientUnread: conversations.clientUnread,
      artistUnread: conversations.artistUnread,
      createdAt: conversations.createdAt,
      artistName: artists.nameRo,
      artistSlug: artists.slug,
    })
    .from(conversations)
    .leftJoin(artists, eq(artists.id, conversations.artistId))
    .where(eq(conversations.clientUserId, appUser.id))
    .orderBy(desc(conversations.lastMessageAt));

  return NextResponse.json(rows);
}

// POST /api/conversations — find-or-create a conversation with an artist.
// Body: { artistId: number }
// Returns { id, created } so callers can open the chat immediately.
export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const artistId = Number(body?.artistId);
  if (!artistId) {
    return NextResponse.json({ error: "artistId required" }, { status: 400 });
  }

  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return NextResponse.json(
      { error: "User record not found — sync required" },
      { status: 404 },
    );
  }

  // Reuse existing conversation if one already links this client↔artist pair.
  const [existing] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.clientUserId, appUser.id),
        eq(conversations.artistId, artistId),
      ),
    )
    .limit(1);

  if (existing) {
    return NextResponse.json({ id: existing.id, created: false });
  }

  const [created] = await db
    .insert(conversations)
    .values({ clientUserId: appUser.id, artistId })
    .returning({ id: conversations.id });

  return NextResponse.json({ id: created.id, created: true }, { status: 201 });
}
