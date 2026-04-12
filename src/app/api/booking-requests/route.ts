import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { bookingRequests, offerRequests, artists } from "@/lib/db/schema";
import { users } from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/admin";
import { rateLimit } from "@/lib/rate-limit";
import { dispatchNotification, dispatchToAdmins } from "@/lib/notifications/dispatch";
import { sendEmail } from "@/lib/email/send";
import { bookingRequestNewEmail } from "@/lib/email/templates/booking-request-new";

const bookingSchema = z.object({
  artistId: z.number(),
  clientName: z.string().min(2),
  clientPhone: z.string().min(6),
  clientEmail: z.string().optional(),
  eventDate: z.string(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  eventType: z.string().optional(),
  guestCount: z.number().optional(),
  message: z.string().optional(),
});

// GET booking requests — requires auth; scoped to caller's own data.
// Admins can query any artist_id or client_email. Regular users can only
// query bookings for their own artist profile or their own email.
export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const artistId = req.nextUrl.searchParams.get("artist_id");
  const clientEmail = req.nextUrl.searchParams.get("client_email");

  if (!artistId && !clientEmail) {
    return NextResponse.json({ error: "artist_id or client_email required" }, { status: 400 });
  }

  // Check if the caller is admin — admins can query any data
  const admin = await requireAdmin();
  const isAdmin = admin.ok;

  if (!isAdmin) {
    // Regular user — verify ownership
    const [appUser] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);

    if (!appUser) {
      return NextResponse.json({ error: "User not found" }, { status: 403 });
    }

    // If querying by artist_id, verify the user owns that artist
    if (artistId) {
      const [artist] = await db
        .select({ userId: artists.userId })
        .from(artists)
        .where(eq(artists.id, Number(artistId)))
        .limit(1);

      if (!artist || artist.userId !== appUser.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // If querying by client_email, verify it matches the user's email
    if (clientEmail && clientEmail !== appUser.email) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const conditions = [];
  if (artistId) conditions.push(eq(bookingRequests.artistId, Number(artistId)));
  if (clientEmail) conditions.push(eq(bookingRequests.clientEmail, clientEmail));

  const result = await db
    .select()
    .from(bookingRequests)
    .where(and(...conditions))
    .orderBy(desc(bookingRequests.createdAt))
    .limit(50);

  return NextResponse.json(result);
}

// CREATE booking request
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const { success } = await rateLimit(`booking:${ip}`, 5, 60_000);
  if (!success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const body = await req.json();
  const parsed = bookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  }

  // Create booking request
  const [booking] = await db.insert(bookingRequests).values({
    ...parsed.data,
    status: "pending",
  }).returning();

  // Also create offer request for admin
  await db.insert(offerRequests).values({
    artistId: parsed.data.artistId,
    clientName: parsed.data.clientName,
    clientPhone: parsed.data.clientPhone,
    clientEmail: parsed.data.clientEmail,
    eventType: parsed.data.eventType,
    eventDate: parsed.data.eventDate,
    message: parsed.data.message,
    status: "new",
  });

  // M5 — fire-and-forget notifications. Looks up the artist owner so the
  // dashboard bell lights up immediately. Never blocks the response.
  void (async () => {
    try {
      const [artist] = await db
        .select({
          userId: artists.userId,
          nameRo: artists.nameRo,
          slug: artists.slug,
          email: artists.email,
          autoReplyEnabled: artists.autoReplyEnabled,
          autoReplyMessage: artists.autoReplyMessage,
        })
        .from(artists)
        .where(eq(artists.id, parsed.data.artistId))
        .limit(1);
      if (artist?.userId) {
        await dispatchNotification({
          userId: artist.userId,
          type: "booking_request_new",
          title: "Cerere nouă de rezervare",
          message: `${parsed.data.clientName} — ${parsed.data.eventType ?? "Eveniment"} · ${parsed.data.eventDate}`,
          actionUrl: "/dashboard/rezervari",
        });
      }
      await dispatchToAdmins({
        type: "admin_lead_new",
        title: "Cerere nouă în CRM",
        message: `${parsed.data.clientName} — ${artist?.nameRo ?? "artist"}`,
        actionUrl: "/admin/cereri-oferte",
      });

      // Email the artist about the new booking request
      if (artist?.email) {
        try {
          await sendEmail({
            to: artist.email,
            subject: `Cerere nouă de rezervare de la ${parsed.data.clientName}`,
            html: bookingRequestNewEmail({
              vendorName: artist.nameRo ?? "Artist",
              clientName: parsed.data.clientName,
              eventType: parsed.data.eventType ?? null,
              eventDate: parsed.data.eventDate ?? null,
              message: parsed.data.message ?? null,
            }),
          });
        } catch (mailErr) {
          console.error("[booking-email] artist notification failed", mailErr);
        }
      }

      // Feature 14 — auto-reply: dacă artistul a activat mesajul automat și
      // clientul a lăsat un email, îi trimitem instant confirmarea primirii.
      if (
        artist?.autoReplyEnabled &&
        artist.autoReplyMessage &&
        parsed.data.clientEmail
      ) {
        try {
          const artistName = artist.nameRo ?? "artist";
          const safeMessage = artist.autoReplyMessage
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\n/g, "<br/>");
          await sendEmail({
            to: parsed.data.clientEmail,
            subject: `Cererea ta către ${artistName} a fost primită`,
            html: `
              <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
                <h2 style="margin:0 0 16px;font-size:20px">Salut ${parsed.data.clientName},</h2>
                <p style="margin:0 0 16px;line-height:1.5">Îți mulțumim pentru cerere! Mesaj din partea <strong>${artistName}</strong>:</p>
                <div style="padding:16px;border-left:4px solid #d4a574;background:#fafafa;margin:0 0 16px;line-height:1.5">${safeMessage}</div>
                <p style="margin:0 0 8px;color:#666;font-size:13px">Data evenimentului: ${parsed.data.eventDate}</p>
                <p style="margin:0;color:#666;font-size:13px">Acest mesaj a fost generat automat de ePetrecere.md</p>
              </div>
            `,
          });
        } catch (mailErr) {
          console.error("[auto-reply] failed", mailErr);
        }
      }
    } catch (err) {
      console.error("[notifications] booking-request POST", err);
    }
  })();

  return NextResponse.json(booking, { status: 201 });
}
