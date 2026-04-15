import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { bookingRequests, calendarEvents, artists, users } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { sendEmail } from "@/lib/email/send";
import { bookingResponseEmail } from "@/lib/email/templates/booking-response";
import { reviewRequestEmail } from "@/lib/email/templates/review-request";
import { dispatchNotification } from "@/lib/notifications/dispatch";

// UPDATE booking request — drives the bilateral confirmation flow (M0b #9):
//   action=accept          → artist accepts, status becomes "accepted"
//   action=reject          → artist rejects, status becomes "rejected"
//   action=client_confirm  → client confirms, status becomes "confirmed_by_client"
//   action=cancel          → client cancels while still pending, status "cancelled"
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const { action, reply } = body as {
    action: "accept" | "reject" | "client_confirm" | "cancel" | "complete";
    reply?: string;
  };

  const [booking] = await db
    .select()
    .from(bookingRequests)
    .where(eq(bookingRequests.id, Number(id)))
    .limit(1);

  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Ownership helper — for artist-side actions (accept/reject), resolve the
  // signed-in user to the artist that owns the target booking. Surfaced as
  // a vulnerability by the E2E BOOK-02 pass: previously any unauthenticated
  // caller could flip a booking to accepted/rejected and mutate the
  // artist's calendar.
  async function requireBookingArtistOwner() {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return { ok: false as const, status: 401, error: "Unauthorized" };
    }
    const [appUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);
    if (!appUser) {
      return { ok: false as const, status: 401, error: "Unauthorized" };
    }
    const [artist] = await db
      .select({ id: artists.id, userId: artists.userId })
      .from(artists)
      .where(eq(artists.id, booking.artistId))
      .limit(1);
    if (!artist || artist.userId !== appUser.id) {
      return { ok: false as const, status: 403, error: "Forbidden" };
    }
    return { ok: true as const };
  }

  if (action === "accept") {
    const owner = await requireBookingArtistOwner();
    if (!owner.ok) {
      return NextResponse.json({ error: owner.error }, { status: owner.status });
    }
    await db.update(bookingRequests).set({
      status: "accepted",
      artistReply: reply || "Cererea a fost acceptată!",
      updatedAt: new Date(),
    }).where(eq(bookingRequests.id, Number(id)));

    // Tentatively block the artist's date — confirmed_by_client will promote
    // the event to a fully-confirmed booking in the calendar.
    if (booking.eventDate) {
      await db.insert(calendarEvents).values({
        entityType: "artist",
        entityId: booking.artistId,
        date: booking.eventDate,
        status: "booked",
        source: "booking",
        note: `Rezervare: ${booking.clientName} - ${booking.eventType || "Eveniment"}`,
      });
    }
  } else if (action === "reject") {
    const owner = await requireBookingArtistOwner();
    if (!owner.ok) {
      return NextResponse.json({ error: owner.error }, { status: owner.status });
    }
    await db.update(bookingRequests).set({
      status: "rejected",
      artistReply: reply || "Ne pare rău, nu suntem disponibili.",
      updatedAt: new Date(),
    }).where(eq(bookingRequests.id, Number(id)));

    // If the booking had already been accepted, the calendar has a
    // source="booking" block on that date — remove it so the artist is
    // bookable again.
    if (booking.status === "accepted" && booking.eventDate) {
      await db
        .delete(calendarEvents)
        .where(
          and(
            eq(calendarEvents.entityType, "artist"),
            eq(calendarEvents.entityId, booking.artistId),
            eq(calendarEvents.date, booking.eventDate),
            eq(calendarEvents.source, "booking"),
          ),
        );
    }
  } else if (action === "client_confirm") {
    // Only the original client (matched via users.clerkId → clientUserId) may
    // promote an "accepted" booking to "confirmed_by_client".
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const [appUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);
    if (!appUser || appUser.id !== booking.clientUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (booking.status !== "accepted") {
      return NextResponse.json(
        { error: "Booking must be accepted by artist first" },
        { status: 409 },
      );
    }
    await db.update(bookingRequests).set({
      status: "confirmed_by_client",
      updatedAt: new Date(),
    }).where(eq(bookingRequests.id, Number(id)));
  } else if (action === "cancel") {
    // The client may cancel while the request is still pending.
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const [appUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);
    if (!appUser || appUser.id !== booking.clientUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await db.update(bookingRequests).set({
      status: "cancelled",
      updatedAt: new Date(),
    }).where(eq(bookingRequests.id, Number(id)));

    // Same cleanup as reject: if the artist had already accepted, release
    // the calendar block so they become bookable again.
    if (
      (booking.status === "accepted" || booking.status === "confirmed_by_client") &&
      booking.eventDate
    ) {
      await db
        .delete(calendarEvents)
        .where(
          and(
            eq(calendarEvents.entityType, "artist"),
            eq(calendarEvents.entityId, booking.artistId),
            eq(calendarEvents.date, booking.eventDate),
            eq(calendarEvents.source, "booking"),
          ),
        );
    }
  } else if (action === "complete") {
    const owner = await requireBookingArtistOwner();
    if (!owner.ok) {
      return NextResponse.json({ error: owner.error }, { status: owner.status });
    }
    if (booking.status !== "accepted" && booking.status !== "confirmed_by_client") {
      return NextResponse.json(
        { error: "Booking must be accepted or confirmed first" },
        { status: 409 },
      );
    }
    await db.update(bookingRequests).set({
      status: "completed",
      updatedAt: new Date(),
    }).where(eq(bookingRequests.id, Number(id)));
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  // M5 — in-app notifications for both sides of the flow.
  void (async () => {
    try {
      if (action === "accept" || action === "reject") {
        if (booking.clientUserId) {
          const [artist] = await db
            .select({ nameRo: artists.nameRo })
            .from(artists)
            .where(eq(artists.id, booking.artistId))
            .limit(1);
          const { notificationEmail } = await import("@/lib/email/templates/notification-email");
          const clientUser = await db.select({ email: (await import("@/lib/db/schema")).users.email }).from((await import("@/lib/db/schema")).users).where(eq((await import("@/lib/db/schema")).users.id, booking.clientUserId)).limit(1);
          await dispatchNotification({
            userId: booking.clientUserId,
            type: "booking_status_changed",
            title:
              action === "accept"
                ? `Rezervarea ta la ${artist?.nameRo ?? "artist"} a fost acceptată`
                : `Răspuns la cererea ta către ${artist?.nameRo ?? "artist"}`,
            message: reply ?? undefined,
            actionUrl: "/cabinet",
            email: clientUser[0]?.email ?? undefined,
            emailSubject: action === "accept"
              ? `✅ Rezervarea ta la ${artist?.nameRo ?? "artist"} a fost acceptată!`
              : `Răspuns la cererea ta — ${artist?.nameRo ?? "artist"}`,
            emailHtml: notificationEmail({
              title: action === "accept" ? "Rezervare Acceptată!" : "Răspuns la Cererea Ta",
              message: action === "accept"
                ? `<strong>${artist?.nameRo ?? "Artist"}</strong> a acceptat cererea ta de rezervare pentru ${booking.eventDate}.`
                : `<strong>${artist?.nameRo ?? "Artist"}</strong> a răspuns la cererea ta. ${reply ?? ""}`,
              ctaUrl: "https://epetrecere.md/cabinet",
              ctaText: "Vezi detalii →",
              emoji: action === "accept" ? "✅" : "📩",
            }),
          });
        }
      } else if (action === "client_confirm") {
        const [artist] = await db
          .select({ userId: artists.userId, nameRo: artists.nameRo, slug: artists.slug, email: artists.email })
          .from(artists)
          .where(eq(artists.id, booking.artistId))
          .limit(1);
        if (artist?.userId) {
          const { notificationEmail } = await import("@/lib/email/templates/notification-email");
          await dispatchNotification({
            userId: artist.userId,
            type: "booking_request_status_changed",
            title: "Client a confirmat rezervarea",
            message: `${booking.clientName} — ${booking.eventDate}`,
            actionUrl: "/dashboard/rezervari",
            email: artist.email ?? undefined,
            emailSubject: `✅ ${booking.clientName} a confirmat rezervarea!`,
            emailHtml: notificationEmail({
              title: "Rezervare Confirmată de Client!",
              message: `<strong>${booking.clientName}</strong> a confirmat rezervarea pentru ${booking.eventDate}. Evenimentul este acum confirmat!`,
              ctaUrl: "https://epetrecere.md/dashboard/rezervari",
              ctaText: "Vezi rezervarea →",
              emoji: "🎉",
            }),
          });
        }

        // Schedule a review request email to the client after the event date.
        // If the event already passed, send immediately. Otherwise the Inngest
        // event-reminder cron will pick it up.
        if (booking.clientEmail && artist) {
          const eventDate = new Date(booking.eventDate);
          const now = new Date();
          if (eventDate <= now) {
            try {
              const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://epetrecere.md";
              await sendEmail({
                to: booking.clientEmail,
                subject: `Cum a fost evenimentul cu ${artist.nameRo ?? "artist"}?`,
                html: reviewRequestEmail({
                  clientName: booking.clientName,
                  artistName: artist.nameRo ?? "Artist",
                  eventDate: booking.eventDate,
                  reviewUrl: `${appUrl}/artisti/${artist.slug}#recenzii`,
                }),
              });
            } catch (mailErr) {
              console.error("[review-request] email failed", mailErr);
            }
          }
        }
      }
    } catch (err) {
      console.error("[notifications] booking PUT", err);
    }
  })();

  // Send email notification to the client on accept/reject. client_confirm
  // and cancel are silent — the artist already sees them in the dashboard.
  if ((action === "accept" || action === "reject") && booking.clientEmail) {
    try {
      const [artist] = await db.select({ nameRo: artists.nameRo }).from(artists).where(eq(artists.id, booking.artistId)).limit(1);
      const finalReply = action === "accept"
        ? (reply || "Cererea a fost acceptată!")
        : (reply || "Ne pare rău, nu suntem disponibili.");

      await sendEmail({
        to: booking.clientEmail,
        subject: action === "accept"
          ? `✅ Rezervarea ta la ${artist?.nameRo || "artist"} a fost acceptată!`
          : `Răspuns la cererea ta — ${artist?.nameRo || "artist"}`,
        html: bookingResponseEmail({
          clientName: booking.clientName,
          artistName: artist?.nameRo || "Artist",
          eventDate: booking.eventDate,
          status: action === "accept" ? "accepted" : "rejected",
          reply: finalReply,
        }),
      });
    } catch { /* email send failed silently */ }
  }

  return NextResponse.json({ success: true });
}
