import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { getVenueOwnerRecipients, requireVenueAccess } from "@/lib/venue-access";
import {
  chatMessages,
  conversations,
  users,
  artists,
  venues,
  bookingRequests,
} from "@/lib/db/schema";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { sendPushToUser } from "@/lib/push/expo";
import {
  containsContact,
  redactContact,
} from "@/lib/privacy/contact-redaction";
import { contactsAreShared } from "@/lib/privacy/booking-contact";
import { chatMessageForViewer } from "@/lib/privacy/chat-message";
import { plainText } from "@/lib/content/plain-text";
import { conversationMatchesVenueScope } from "@/lib/conversations/scope";

// M0b #10 — Messages for a persistent client↔artist conversation.
// GET  lists messages (oldest → newest, capped at 200) and resets the caller's
//      unread counter so the inbox badge clears immediately.
// POST appends a new message, updates lastMessageAt/Preview, and increments
//      the opposite party's unread counter.

async function loadContext(conversationId: number, clerkId: string, scopedVenueId?: number | null) {
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
  if (!conversationMatchesVenueScope(conv.venueId, scopedVenueId)) return null;

  let side: "client" | "artist" | "venue" | null = null;
  if (conv.clientUserId === appUser.id) {
    side = "client";
  } else if (conv.artistId) {
    const [ownsArtist] = await db
      .select({ id: artists.id })
      .from(artists)
      .where(and(eq(artists.id, conv.artistId), eq(artists.userId, appUser.id)))
      .limit(1);
    if (ownsArtist) side = "artist";
  } else if (conv.venueId) {
    // ADR 0028 — venue ownership via the membership chain.
    const access = await requireVenueAccess(conv.venueId, "staff");
    if (access.ok) side = "venue";
  }

  if (!side) return null;
  return { appUser, conv, side } as const;
}

async function contactIsUnlocked(conv: typeof conversations.$inferSelect) {
  const vendorCondition = conv.artistId
    ? eq(bookingRequests.artistId, conv.artistId)
    : conv.venueId
      ? eq(bookingRequests.venueId, conv.venueId)
      : null;
  if (!vendorCondition) return false;

  const [booking] = await db
    .select({ status: bookingRequests.status })
    .from(bookingRequests)
    .where(
      and(
        eq(bookingRequests.clientUserId, conv.clientUserId),
        vendorCondition,
      ),
    )
    .orderBy(desc(bookingRequests.updatedAt), desc(bookingRequests.id))
    .limit(1);

  return booking ? contactsAreShared(booking.status) : false;
}

export async function GET(
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

  const scopedVenueId = Number(req.nextUrl.searchParams.get("venueId") ?? "") || null;
  const ctx = await loadContext(conversationId, clerkId, scopedVenueId);
  if (!ctx) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const messages = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(asc(chatMessages.createdAt))
    .limit(200);
  const contactUnlocked = await contactIsUnlocked(ctx.conv);

  // Reset the viewer's unread counter.
  if (ctx.side === "client" && ctx.conv.clientUnread > 0) {
    await db
      .update(conversations)
      .set({ clientUnread: 0 })
      .where(eq(conversations.id, conversationId));
  } else if (
    (ctx.side === "artist" || ctx.side === "venue") &&
    ctx.conv.artistUnread > 0
  ) {
    await db
      .update(conversations)
      .set({ artistUnread: 0 })
      .where(eq(conversations.id, conversationId));
  }

  return NextResponse.json(
    messages.map(message => chatMessageForViewer(message, contactUnlocked)),
  );
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
  const attachmentUrl = body?.attachmentUrl
    ? String(body.attachmentUrl).trim()
    : null;
  const attachmentName = body?.attachmentName
    ? String(body.attachmentName).slice(0, 200)
    : null;
  const attachmentMime = body?.attachmentMime
    ? String(body.attachmentMime).slice(0, 100)
    : null;

  // Either a text message OR an attachment is required — an empty POST is
  // meaningless and usually a UI bug on the sender's side.
  if (!message && !attachmentUrl) {
    return NextResponse.json(
      { error: "message or attachment required" },
      { status: 400 },
    );
  }
  if (attachmentUrl && !/^https?:\/\//i.test(attachmentUrl)) {
    return NextResponse.json(
      { error: "attachmentUrl must be an absolute URL" },
      { status: 400 },
    );
  }

  const ctx = await loadContext(
    conversationId,
    clerkId,
    Number(req.nextUrl.searchParams.get("venueId") ?? "") || null,
  );
  if (!ctx) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const contactUnlocked = await contactIsUnlocked(ctx.conv);
  if (!contactUnlocked && (containsContact(message) || containsContact(plainText(message)) || attachmentUrl)) {
    return NextResponse.json(
      {
        error:
          "Datele de contact și atașamentele devin disponibile după confirmarea rezervării.",
        code: "CONTACT_LOCKED",
      },
      { status: 422 },
    );
  }

  // Sender display name comes from the appUser record; fall back to the side.
  const [appUserFull] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, ctx.appUser.id))
    .limit(1);
  const rawSenderName =
    appUserFull?.name ||
    (ctx.side === "artist"
      ? "Artist"
      : ctx.side === "venue"
        ? "Sală"
        : "Client");
  const senderName = contactUnlocked ? rawSenderName : redactContact(plainText(rawSenderName));

  const [inserted] = await db
    .insert(chatMessages)
    .values({
      conversationId,
      senderType: ctx.side,
      senderName,
      message: message || "",
      attachmentUrl,
      attachmentName,
      attachmentMime,
    })
    .returning();

  // Update conversation metadata: bump timestamp, preview, and opposite-side
  // unread counter. For attachment-only messages the preview shows a hint so
  // the inbox doesn't look like an empty row.
  const previewBase =
    message ||
    (attachmentUrl
      ? attachmentMime?.startsWith("image/")
        ? "📷 Imagine"
        : attachmentMime === "application/pdf"
          ? "📎 PDF"
          : "📎 Atașament"
      : "");
  const preview =
    previewBase.length > 120 ? previewBase.slice(0, 117) + "…" : previewBase;
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

      // Resolve the vendor (artist OR venue)
      let vendorName = "Vendor";
      let vendorUserId: string | null = null;
      let vendorEmail: string | null = null;
      let venueRecipients: Awaited<ReturnType<typeof getVenueOwnerRecipients>> = [];
      let vendorDashboardUrl = "/dashboard/mesaje";

      if (ctx.conv.artistId) {
        const [artist] = await db
          .select({
            userId: artists.userId,
            email: artists.email,
            nameRo: artists.nameRo,
          })
          .from(artists)
          .where(eq(artists.id, ctx.conv.artistId))
          .limit(1);
        if (artist) {
          vendorName = artist.nameRo;
          vendorUserId = artist.userId;
          vendorEmail = artist.email;
        }
      } else if (ctx.conv.venueId) {
        const [venue] = await db
          .select({
            userId: venues.userId,
            email: venues.email,
            nameRo: venues.nameRo,
          })
          .from(venues)
          .where(eq(venues.id, ctx.conv.venueId))
          .limit(1);
        if (venue) {
          vendorName = venue.nameRo;
          vendorUserId = venue.userId;
          vendorEmail = venue.email;
          venueRecipients = await getVenueOwnerRecipients(ctx.conv.venueId);
          vendorDashboardUrl = "/dashboard/sala/mesaje";
        }
      }

      if (!contactUnlocked) vendorName = redactContact(plainText(vendorName));
      if (ctx.side === "artist" || ctx.side === "venue") {
        // Vendor sent a message → notify the client
        const [clientUser] = await db
          .select({ id: users.id, email: users.email, name: users.name })
          .from(users)
          .where(eq(users.id, ctx.conv.clientUserId))
          .limit(1);

        if (clientUser) {
          await dispatchNotification({
            userId: clientUser.id,
            type: "booking_status_changed",
            title: `Mesaj nou de la ${vendorName}`,
            message: preview,
            actionUrl: `/cabinet/mesaje?conversation=${conversationId}`,
            email: clientUser.email ?? undefined,
            emailSubject: `💬 Mesaj nou de la ${vendorName} pe ePetrecere.md`,
            emailHtml: notificationEmail({
              title: `Mesaj nou de la ${vendorName}`,
              message: `<strong>${escapeHtml(vendorName)}</strong> ți-a trimis un mesaj:<br><br><div style="padding:12px;border-left:3px solid #C9A84C;background:#1a1a2e;border-radius:4px;color:#D4D4E0;">${escapeHtml(preview)}</div>`,
              ctaUrl: `https://epetrecere.md/cabinet/mesaje?conversation=${conversationId}`,
              ctaText: "Răspunde →",
              emoji: "💬",
            }),
          });
          // Mobile push to client — deep-link opens the chat thread.
          void sendPushToUser({
            userId: clientUser.id,
            title: vendorName,
            body: preview,
            data: { kind: "message_new", id: conversationId },
          });
        }
      } else {
        // Client sent a message → notify the vendor
        const recipients = ctx.conv.venueId
          ? venueRecipients
          : vendorUserId
            ? [{ userId: vendorUserId, email: vendorEmail }]
            : [];
        await Promise.all(recipients.map((recipient) => dispatchNotification({
            userId: recipient.userId,
            type: "booking_request_new",
            title: `Mesaj nou de la ${senderName}`,
            message: preview,
            actionUrl: `${vendorDashboardUrl}?conversation=${conversationId}`,
            email: recipient.email ?? undefined,
            emailSubject: `💬 Mesaj nou de la ${senderName} pe ePetrecere.md`,
            emailHtml: notificationEmail({
              title: `Mesaj nou de la ${senderName}`,
              message: `<strong>${escapeHtml(senderName)}</strong> ți-a trimis un mesaj:<br><br><div style="padding:12px;border-left:3px solid #C9A84C;background:#1a1a2e;border-radius:4px;color:#D4D4E0;">${escapeHtml(preview)}</div>`,
              ctaUrl: `https://epetrecere.md${vendorDashboardUrl}?conversation=${conversationId}`,
              ctaText: "Răspunde →",
              emoji: "💬",
            }),
          })));
          // Mobile push to vendor — same deep-link contract.
          for (const recipient of recipients) {
            void sendPushToUser({
              userId: recipient.userId,
              title: senderName,
              body: preview,
              data: { kind: "message_new", id: conversationId },
            });
          }
      }
    } catch (err) {
      console.error("[chat] message notification failed:", err);
    }
  })();

  return NextResponse.json(chatMessageForViewer(inserted, contactUnlocked), { status: 201 });
}
