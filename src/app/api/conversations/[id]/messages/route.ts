import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { chatMessages, conversations, users, artists } from "@/lib/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { dispatchNotification } from "@/lib/notifications/dispatch";

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

  // Notify the other party about the new message (fire-and-forget)
  void (async () => {
    try {
      const { notificationEmail } = await import("@/lib/email/templates/notification-email");

      if (ctx.side === "artist") {
        // Artist sent a message → notify the client
        const [clientUser] = await db
          .select({ id: users.id, email: users.email, name: users.name })
          .from(users)
          .where(eq(users.id, ctx.conv.clientUserId))
          .limit(1);
        const [artist] = await db
          .select({ nameRo: artists.nameRo, slug: artists.slug })
          .from(artists)
          .where(eq(artists.id, ctx.conv.artistId))
          .limit(1);
        const artistName = artist?.nameRo ?? "Artist";

        if (clientUser) {
          await dispatchNotification({
            userId: clientUser.id,
            type: "booking_status_changed",
            title: `Mesaj nou de la ${artistName}`,
            message: preview,
            actionUrl: `/cabinet/mesaje?conversation=${conversationId}`,
            email: clientUser.email ?? undefined,
            emailSubject: `💬 Mesaj nou de la ${artistName} pe ePetrecere.md`,
            emailHtml: notificationEmail({
              title: `Mesaj nou de la ${artistName}`,
              message: `<strong>${artistName}</strong> ți-a trimis un mesaj:<br><br><div style="padding:12px;border-left:3px solid #C9A84C;background:#1a1a2e;border-radius:4px;color:#D4D4E0;">${preview}</div>`,
              ctaUrl: `https://epetrecere.md/cabinet/mesaje?conversation=${conversationId}`,
              ctaText: "Răspunde →",
              emoji: "💬",
            }),
          });
        }
      } else {
        // Client sent a message → notify the artist
        const [artist] = await db
          .select({ userId: artists.userId, email: artists.email, nameRo: artists.nameRo })
          .from(artists)
          .where(eq(artists.id, ctx.conv.artistId))
          .limit(1);

        if (artist?.userId) {
          await dispatchNotification({
            userId: artist.userId,
            type: "booking_request_new",
            title: `Mesaj nou de la ${senderName}`,
            message: preview,
            actionUrl: `/dashboard/mesaje?conversation=${conversationId}`,
            email: artist.email ?? undefined,
            emailSubject: `💬 Mesaj nou de la ${senderName} pe ePetrecere.md`,
            emailHtml: notificationEmail({
              title: `Mesaj nou de la ${senderName}`,
              message: `<strong>${senderName}</strong> ți-a trimis un mesaj:<br><br><div style="padding:12px;border-left:3px solid #C9A84C;background:#1a1a2e;border-radius:4px;color:#D4D4E0;">${preview}</div>`,
              ctaUrl: `https://epetrecere.md/dashboard/mesaje?conversation=${conversationId}`,
              ctaText: "Răspunde →",
              emoji: "💬",
            }),
          });
        }
      }
    } catch (err) {
      console.error("[chat] message notification failed:", err);
    }
  })();

  return NextResponse.json(inserted, { status: 201 });
}
