import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { conversations, users, artists, venues } from "@/lib/db/schema";
import { and, eq, desc, isNull } from "drizzle-orm";

// M0b #10 / Phase 6 — Persistent pre-booking chat for artists AND venues.
// GET /api/conversations — list conversations for the signed-in user.
//   ?role=client (default) — all conversations the user initiated (artist + venue)
//   ?role=artist — conversations for the artist owned by this user
//   ?role=venue  — conversations for the venue owned by this user
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
        venueId: conversations.venueId,
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

  if (role === "venue") {
    const [venue] = await db
      .select({ id: venues.id })
      .from(venues)
      .where(eq(venues.userId, appUser.id))
      .limit(1);
    if (!venue) return NextResponse.json([]);

    const rows = await db
      .select({
        id: conversations.id,
        artistId: conversations.artistId,
        venueId: conversations.venueId,
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
      .where(eq(conversations.venueId, venue.id))
      .orderBy(desc(conversations.lastMessageAt));

    return NextResponse.json(rows);
  }

  // Default: client role — both artist and venue conversations they've opened.
  const artistRows = await db
    .select({
      id: conversations.id,
      artistId: conversations.artistId,
      venueId: conversations.venueId,
      clientUserId: conversations.clientUserId,
      lastMessageAt: conversations.lastMessageAt,
      lastMessagePreview: conversations.lastMessagePreview,
      clientUnread: conversations.clientUnread,
      artistUnread: conversations.artistUnread,
      createdAt: conversations.createdAt,
      vendorName: artists.nameRo,
      vendorSlug: artists.slug,
      vendorKind: artists.id, // placeholder
    })
    .from(conversations)
    .innerJoin(artists, eq(artists.id, conversations.artistId))
    .where(eq(conversations.clientUserId, appUser.id));

  const venueRows = await db
    .select({
      id: conversations.id,
      artistId: conversations.artistId,
      venueId: conversations.venueId,
      clientUserId: conversations.clientUserId,
      lastMessageAt: conversations.lastMessageAt,
      lastMessagePreview: conversations.lastMessagePreview,
      clientUnread: conversations.clientUnread,
      artistUnread: conversations.artistUnread,
      createdAt: conversations.createdAt,
      vendorName: venues.nameRo,
      vendorSlug: venues.slug,
      vendorKind: venues.id, // placeholder
    })
    .from(conversations)
    .innerJoin(venues, eq(venues.id, conversations.venueId))
    .where(eq(conversations.clientUserId, appUser.id));

  const merged = [
    ...artistRows.map((r) => ({
      id: r.id,
      artistId: r.artistId,
      venueId: r.venueId,
      clientUserId: r.clientUserId,
      lastMessageAt: r.lastMessageAt,
      lastMessagePreview: r.lastMessagePreview,
      clientUnread: r.clientUnread,
      artistUnread: r.artistUnread,
      createdAt: r.createdAt,
      vendorKind: "artist" as const,
      vendorName: r.vendorName,
      vendorSlug: r.vendorSlug,
    })),
    ...venueRows.map((r) => ({
      id: r.id,
      artistId: r.artistId,
      venueId: r.venueId,
      clientUserId: r.clientUserId,
      lastMessageAt: r.lastMessageAt,
      lastMessagePreview: r.lastMessagePreview,
      clientUnread: r.clientUnread,
      artistUnread: r.artistUnread,
      createdAt: r.createdAt,
      vendorKind: "venue" as const,
      vendorName: r.vendorName,
      vendorSlug: r.vendorSlug,
    })),
  ].sort(
    (a, b) =>
      new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  );

  return NextResponse.json(merged);
}

// POST /api/conversations — find-or-create a conversation with artist OR venue.
// Body: { artistId?: number, venueId?: number } — exactly one required.
export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const artistId = body?.artistId ? Number(body.artistId) : null;
  const venueId = body?.venueId ? Number(body.venueId) : null;

  if (!artistId && !venueId) {
    return NextResponse.json(
      { error: "artistId or venueId required" },
      { status: 400 },
    );
  }
  if (artistId && venueId) {
    return NextResponse.json(
      { error: "provide only one of artistId or venueId" },
      { status: 400 },
    );
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

  const [existing] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.clientUserId, appUser.id),
        artistId
          ? eq(conversations.artistId, artistId)
          : eq(conversations.venueId, venueId!),
        artistId
          ? isNull(conversations.venueId)
          : isNull(conversations.artistId),
      ),
    )
    .limit(1);

  if (existing) {
    return NextResponse.json({ id: existing.id, created: false });
  }

  const [created] = await db
    .insert(conversations)
    .values({
      clientUserId: appUser.id,
      artistId: artistId ?? null,
      venueId: venueId ?? null,
    })
    .returning({ id: conversations.id });

  return NextResponse.json({ id: created.id, created: true }, { status: 201 });
}
