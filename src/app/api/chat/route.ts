import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { chatMessages, bookingRequests, artists, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// Verify the signed-in user is either the client or the artist on this booking
async function verifyBookingAccess(clerkId: string, bookingRequestId: number) {
  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) return false;

  const [booking] = await db
    .select({ clientUserId: bookingRequests.clientUserId, artistId: bookingRequests.artistId })
    .from(bookingRequests)
    .where(eq(bookingRequests.id, bookingRequestId))
    .limit(1);
  if (!booking) return false;

  // Client side
  if (booking.clientUserId === appUser.id) return true;

  // Artist side
  if (booking.artistId) {
    const [artist] = await db
      .select({ id: artists.id })
      .from(artists)
      .where(and(eq(artists.id, booking.artistId), eq(artists.userId, appUser.id)))
      .limit(1);
    if (artist) return true;
  }
  return false;
}

// GET chat messages for a booking request
export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const bookingRequestId = req.nextUrl.searchParams.get("booking_request_id");
  if (!bookingRequestId) return NextResponse.json({ error: "booking_request_id required" }, { status: 400 });

  const hasAccess = await verifyBookingAccess(clerkId, Number(bookingRequestId));
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const messages = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.bookingRequestId, Number(bookingRequestId)))
    .orderBy(chatMessages.createdAt)
    .limit(100);

  return NextResponse.json(messages);
}

// SEND chat message
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

  // Derive senderType and senderName from the authenticated user (not client input)
  const [appUser] = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  let senderType = "client";
  let senderName = appUser?.name || "Client";

  if (appUser) {
    // Check if user is the artist on this booking
    const [booking] = await db
      .select({ artistId: bookingRequests.artistId })
      .from(bookingRequests)
      .where(eq(bookingRequests.id, Number(bookingRequestId)))
      .limit(1);

    if (booking && booking.artistId) {
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
  }

  const [msg] = await db.insert(chatMessages).values({
    bookingRequestId,
    senderType,
    senderName,
    message,
  }).returning();

  // Dispatch notification to the OTHER party (fire-and-forget)
  void (async () => {
    try {
      const [booking] = await db
        .select({
          clientUserId: bookingRequests.clientUserId,
          clientEmail: bookingRequests.clientEmail,
          artistId: bookingRequests.artistId,
          venueId: bookingRequests.venueId,
        })
        .from(bookingRequests)
        .where(eq(bookingRequests.id, Number(bookingRequestId)))
        .limit(1);
      if (!booking) return;

      const { dispatchNotification } = await import("@/lib/notifications/dispatch");
      const { notificationEmail } = await import("@/lib/email/templates/notification-email");
      const truncated = message.length > 100 ? message.slice(0, 100) + "..." : message;

      if (senderType === "artist") {
        // Artist sent — notify client
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
            actionUrl: "/cabinet/rezervari",
            email: client?.email ?? booking.clientEmail ?? undefined,
            emailSubject: `💬 Mesaj nou de la ${senderName}`,
            emailHtml: notificationEmail({
              title: `Mesaj nou de la ${senderName}`,
              message: `<em>"${message}"</em>`,
              ctaUrl: "https://epetrecere.md/cabinet/rezervari",
              ctaText: "Răspunde →",
              emoji: "💬",
            }),
          });
        }
      } else {
        // Client sent — notify vendor
        let vendorUserId: string | null = null;
        let vendorEmail: string | null = null;
        if (booking.artistId) {
          const [a] = await db
            .select({ userId: artists.userId, email: artists.email })
            .from(artists)
            .where(eq(artists.id, booking.artistId))
            .limit(1);
          vendorUserId = a?.userId ?? null;
          vendorEmail = a?.email ?? null;
        } else if (booking.venueId) {
          const { venues } = await import("@/lib/db/schema");
          const [v] = await db
            .select({ userId: venues.userId, email: venues.email })
            .from(venues)
            .where(eq(venues.id, booking.venueId))
            .limit(1);
          vendorUserId = v?.userId ?? null;
          vendorEmail = v?.email ?? null;
        }
        if (vendorUserId) {
          await dispatchNotification({
            userId: vendorUserId,
            type: "booking_request_new",
            title: `Mesaj nou de la ${senderName}`,
            message: truncated,
            actionUrl: "/dashboard/rezervari",
            email: vendorEmail ?? undefined,
            emailSubject: `💬 Mesaj nou de la ${senderName}`,
            emailHtml: notificationEmail({
              title: `Mesaj nou de la ${senderName}`,
              message: `<em>"${message}"</em>`,
              ctaUrl: "https://epetrecere.md/dashboard/rezervari",
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
