import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { chatMessages, conversations, users, artists } from "@/lib/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";

// M0b #10 — Messages for a persistent client↔artist conversation.
// GET  lists messages (oldest → newest, capped at 200) and resets the caller's
//      unread counter so the inbox badge clears immediately.
// POST appends a new message, updates lastMessageAt/Preview, and increments
//      the opposite party's unread counter.

async function loadContext(conversationId: number, clerkId: string) {
  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) return null;

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!conv) return null;

  let side: "client" | "artist" | null = null;
  if (conv.clientUserId === appUser.id) {
    side = "client";
  } else {
    // Check if the caller owns the artist on this conversation.
    const [ownsArtist] = await db
      .select({ id: artists.id })
      .from(artists)
      .where(and(eq(artists.id, conv.artistId), eq(artists.userId, appUser.id)))
      .limit(1);
    if (ownsArtist) side = "artist";
  }

  if (!side) return null;
  return { appUser, conv, side } as const;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const conversationId = Number(id);
  if (!conversationId) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const ctx = await loadContext(conversationId, clerkId);
  if (!ctx) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const messages = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(asc(chatMessages.createdAt))
    .limit(200);

  // Reset the viewer's unread counter.
  if (ctx.side === "client" && ctx.conv.clientUnread > 0) {
    await db
      .update(conversations)
      .set({ clientUnread: 0 })
      .where(eq(conversations.id, conversationId));
  } else if (ctx.side === "artist" && ctx.conv.artistUnread > 0) {
    await db
      .update(conversations)
      .set({ artistUnread: 0 })
      .where(eq(conversations.id, conversationId));
  }

  return NextResponse.json(messages);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const conversationId = Number(id);
  if (!conversationId) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const message = (body?.message || "").toString().trim();
  if (!message) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  const ctx = await loadContext(conversationId, clerkId);
  if (!ctx) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Sender display name comes from the appUser record; fall back to the side.
  const [appUserFull] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, ctx.appUser.id))
    .limit(1);
  const senderName =
    appUserFull?.name ||
    appUserFull?.email ||
    (ctx.side === "artist" ? "Artist" : "Client");

  const [inserted] = await db
    .insert(chatMessages)
    .values({
      conversationId,
      senderType: ctx.side,
      senderName,
      message,
    })
    .returning();

  // Update conversation metadata: bump timestamp, preview, and opposite-side
  // unread counter.
  const preview = message.length > 120 ? message.slice(0, 117) + "…" : message;
  await db
    .update(conversations)
    .set({
      lastMessageAt: new Date(),
      lastMessagePreview: preview,
      ...(ctx.side === "client"
        ? { artistUnread: sql`${conversations.artistUnread} + 1` }
        : { clientUnread: sql`${conversations.clientUnread} + 1` }),
    })
    .where(eq(conversations.id, conversationId));

  return NextResponse.json(inserted, { status: 201 });
}
