import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import {
  chatMessages,
  bookingRequests,
  artists,
  users,
  conversations,
  venues,
} from "@/lib/db/schema";
import { eq, and, sql, isNull, or } from "drizzle-orm";
import { escapeHtml } from "@/lib/email/escape";

// Verify the signed-in user is either the client or the artist/venue on this booking
async function verifyBookingAccess(clerkId: string, bookingRequestId: number) {
  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) return false;

  const [booking] = await db
    .select({
      clientUserId: bookingRequests.clientUserId,
      artistId: bookingRequests.artistId,
      venueId: bookingRequests.venueId,
    })
    .from(bookingRequests)
    .where(eq(bookingRequests.id, bookingRequestId))
    .limit(1);
  if (!booking) return false;

  if (booking.clientUserId === appUser.id) return true;

  if (booking.artistId) {
    const [artist] = await db
      .select({ id: artists.id })
      .from(artists)
      .where(and(eq(artists.id, booking.artistId), eq(artists.userId, appUser.id)))
      .limit(1);
    if (artist) return true;
  }
  if (booking.venueId) {
    const [venue] = await db
      .select({ id: venues.id })
      .from(venues)
      .where(and(eq(venues.id, booking.venueId), eq(venues.userId, appUser.id)))
      .limit(1);
    if (venue) return true;
  }
  return false;
}

/**
 * Find or create a conversation between the client and the vendor (artist or
 * venue) of a booking. Returns the conversation id, or null if either party
 * isn't resolvable.
 */
async function findOrCreateConversationForBooking(bookingRequestId: number) {
  const [booking] = await db
    .select({
      clientUserId: bookingRequests.clientUserId,
      artistId: bookingRequests.artistId,
      venueId: bookingRequests.venueId,
    })
    .from(bookingRequests)
    .where(eq(bookingRequests.id, bookingRequestId))
    .limit(1);
  if (!booking?.clientUserId) return null;
  if (!booking.artistId && !booking.venueId) return null;

  // Look up an existing conversation
  const [existing] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.clientUserId, booking.clientUserId),
        booking.artistId
          ? eq(conversations.artistId, booking.artistId)
          : eq(conversations.venueId, booking.venueId!),
        booking.artistId
          ? isNull(conversations.venueId)
          : isNull(conversations.artistId),
      ),
    )
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(conversations)
    .values({
      clientUserId: booking.clientUserId,
      artistId: booking.artistId ?? null,
      venueId: booking.venueId ?? null,
    })
    .returning({ id: conversations.id });
  return created?.id ?? null;
}

// GET chat messages for a booking request — returns messages from BOTH the
// booking-specific stream AND the linked client↔vendor conversation, so chats
// kicked off pre-booking are visible inline with the booking history.
export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const bookingRequestId = req.nextUrl.searchParams.get("booking_request_id");
  if (!bookingRequestId) return NextResponse.json({ error: "booking_request_id required" }, { status: 400 });

  const hasAccess = await verifyBookingAccess(clerkId, Number(bookingRequestId));
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Try to also pull messages from the global conversation linked to this
  // booking. The conversation may exist even if the booking-stream is empty
  // (pre-booking chat), so we union the two streams.
  const conversationId = await findOrCreateConversationForBooking(
    Number(bookingRequestId),
  );

  const messages = await db
    .select()
    .from(chatMessages)
    .where(
      conversationId
        ? or(
            eq(chatMessages.bookingRequestId, Number(bookingRequestId)),
            eq(chatMessages.conversationId, conversationId),
          )
        : eq(chatMessages.bookingRequestId, Number(bookingRequestId)),
    )
    .orderBy(chatMessages.createdAt)
    .limit(200);

  // De-duplicate by id (the same row may match both predicates if both FKs are
  // set, which is the case for messages sent through the bridge).
  const seen = new Set<number>();
  const dedup = messages.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  // Mark this side's unread as 0 on the linked conversation. The booking-chat
  // dialog reading this endpoint counts as "the user has seen the messages",
  // so the chat bell badge should clear too.
  if (conversationId) {
    const [appUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);
    const [conv] = await db
      .select({
        clientUserId: conversations.clientUserId,
        clientUnread: conversations.clientUnread,
        artistUnread: conversations.artistUnread,
      })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (appUser && conv) {
      const isClient = conv.clientUserId === appUser.id;
      if (isClient && conv.clientUnread > 0) {
        await db
          .update(conversations)
          .set({ clientUnread: 0 })
          .where(eq(conversations.id, conversationId));
      } else if (!isClient && conv.artistUnread > 0) {
        await db
          .update(conversations)
          .set({ artistUnread: 0 })
          .where(eq(conversations.id, conversationId));
      }
    }
  }

  return NextResponse.json(dedup);
}

// SEND chat message
//
// CRITICAL: This endpoint bridges the legacy booking-chat system (rows tied
// to bookingRequestId) and the persistent conversation system (rows tied to
// conversationId, surfaced in /cabinet/mesaje and the chat bell).
//
// On every send we:
//   1. Find/create the conversation for (client, vendor)
//   2. Insert ONE chat_messages row with BOTH foreign keys set
//   3. Update conversation metadata (lastMessageAt, preview, unread counter)
//
// This means a partner sending a message from /dashboard/rezervari shows up
// instantly in the client's /cabinet/mesaje and chat bell — and vice versa.
export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { bookingRequestId, message } = body;

  if (!bookingRequestId || !message) {
    return NextResponse.json({ error: "bookingRequestId and message required" }, { status: 400 });
  }

  const hasAccess = await verifyBookingAccess(clerkId, Number(bookingRequestId));
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [appUser] = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  // Look up the booking once for routing decisions.
  const [booking] = await db
    .select({
      clientUserId: bookingRequests.clientUserId,
      artistId: bookingRequests.artistId,
      venueId: bookingRequests.venueId,
      clientEmail: bookingRequests.clientEmail,
    })
    .from(bookingRequests)
    .where(eq(bookingRequests.id, Number(bookingRequestId)))
    .limit(1);

  let senderType: "client" | "artist" | "venue" = "client";
  let senderName = appUser?.name || "Client";

  if (appUser && booking) {
    if (booking.artistId) {
      const [artist] = await db
        .select({ id: artists.id, nameRo: artists.nameRo })
        .from(artists)
        .where(and(eq(artists.id, booking.artistId), eq(artists.userId, appUser.id)))
        .limit(1);
      if (artist) {
        senderType = "artist";
        senderName = artist.nameRo || appUser.name || "Artist";
      }
    }
    if (senderType === "client" && booking.venueId) {
      const [venue] = await db
        .select({ id: venues.id, nameRo: venues.nameRo })
        .from(venues)
        .where(and(eq(venues.id, booking.venueId), eq(venues.userId, appUser.id)))
        .limit(1);
      if (venue) {
        senderType = "venue";
        senderName = venue.nameRo || appUser.name || "Sală";
      }
    }
  }

  // Bridge: ensure a conversation exists and tag the message with both FKs
  const conversationId = await findOrCreateConversationForBooking(
    Number(bookingRequestId),
  );

  const [msg] = await db
    .insert(chatMessages)
    .values({
      bookingRequestId,
      conversationId: conversationId ?? null,
      senderType,
      senderName,
      message,
    })
    .returning();

  // Update conversation metadata so the chat bell + /cabinet/mesaje reflect
  // the new message immediately.
  if (conversationId) {
    const preview = message.length > 120 ? message.slice(0, 117) + "..." : message;
    const isVendorSender = senderType === "artist" || senderType === "venue";
    await db
      .update(conversations)
      .set({
        lastMessageAt: new Date(),
        lastMessagePreview: preview,
        ...(isVendorSender
          ? { clientUnread: sql`${conversations.clientUnread} + 1` }
          : { artistUnread: sql`${conversations.artistUnread} + 1` }),
      })
      .where(eq(conversations.id, conversationId));
  }

  // Dispatch notification to the OTHER party (fire-and-forget)
  void (async () => {
    try {
      if (!booking) return;

      const { dispatchNotification } = await import("@/lib/notifications/dispatch");
      const { notificationEmail } = await import("@/lib/email/templates/notification-email");
      const truncated = message.length > 100 ? message.slice(0, 100) + "..." : message;

      const isVendorSender = senderType === "artist" || senderType === "venue";

      if (isVendorSender) {
        // Vendor sent — notify client. Route to /cabinet/mesaje so the message
        // is surfaced in the unified inbox, not just the booking detail view.
        if (booking.clientUserId) {
          const [client] = await db
            .select({ email: users.email })
            .from(users)
            .where(eq(users.id, booking.clientUserId))
            .limit(1);
          await dispatchNotification({
            userId: booking.clientUserId,
            type: "booking_request_status_changed",
            title: `Mesaj nou de la ${senderName}`,
            message: truncated,
            actionUrl: conversationId
              ? `/cabinet/mesaje?conversation=${conversationId}`
              : "/cabinet/rezervari",
            email: client?.email ?? booking.clientEmail ?? undefined,
            emailSubject: `💬 Mesaj nou de la ${senderName}`,
            emailHtml: notificationEmail({
              title: `Mesaj nou de la ${senderName}`,
              message: `<em>"${escapeHtml(message)}"</em>`,
              ctaUrl: conversationId
                ? `https://epetrecere.md/cabinet/mesaje?conversation=${conversationId}`
                : "https://epetrecere.md/cabinet/rezervari",
              ctaText: "Răspunde →",
              emoji: "💬",
            }),
          });
        }
      } else {
        // Client sent — notify vendor
        let vendorUserId: string | null = null;
        let vendorEmail: string | null = null;
        let vendorDashboardUrl = "/dashboard/mesaje";
        if (booking.artistId) {
          const [a] = await db
            .select({ userId: artists.userId, email: artists.email })
            .from(artists)
            .where(eq(artists.id, booking.artistId))
            .limit(1);
          vendorUserId = a?.userId ?? null;
          vendorEmail = a?.email ?? null;
        } else if (booking.venueId) {
          const [v] = await db
            .select({ userId: venues.userId, email: venues.email })
            .from(venues)
            .where(eq(venues.id, booking.venueId))
            .limit(1);
          vendorUserId = v?.userId ?? null;
          vendorEmail = v?.email ?? null;
          vendorDashboardUrl = "/dashboard/sala/mesaje";
        }
        if (vendorUserId) {
          await dispatchNotification({
            userId: vendorUserId,
            type: "booking_request_new",
            title: `Mesaj nou de la ${senderName}`,
            message: truncated,
            actionUrl: conversationId
              ? `${vendorDashboardUrl}?conversation=${conversationId}`
              : "/dashboard/rezervari",
            email: vendorEmail ?? undefined,
            emailSubject: `💬 Mesaj nou de la ${senderName}`,
            emailHtml: notificationEmail({
              title: `Mesaj nou de la ${senderName}`,
              message: `<em>"${escapeHtml(message)}"</em>`,
              ctaUrl: conversationId
                ? `https://epetrecere.md${vendorDashboardUrl}?conversation=${conversationId}`
                : "https://epetrecere.md/dashboard/rezervari",
              ctaText: "Răspunde →",
              emoji: "💬",
            }),
          });
        }
      }
    } catch (err) {
      console.error("[chat] notification dispatch failed", err);
    }
  })();

  return NextResponse.json(msg, { status: 201 });
}
