import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { bookingRequests, offerRequests, artists } from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { rateLimit } from "@/lib/rate-limit";
import { dispatchNotification, dispatchToAdmins } from "@/lib/notifications/dispatch";
import { sendEmail } from "@/lib/email/send";

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

// GET booking requests (for artist or client)
export async function GET(req: NextRequest) {
  const artistId = req.nextUrl.searchParams.get("artist_id");
  const clientEmail = req.nextUrl.searchParams.get("client_email");

  const conditions = [];
  if (artistId) conditions.push(eq(bookingRequests.artistId, Number(artistId)));
  if (clientEmail) conditions.push(eq(bookingRequests.clientEmail, clientEmail));

  const result = await db
    .select()
    .from(bookingRequests)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(bookingRequests.createdAt))
    .limit(50);

  return NextResponse.json(result);
}

// CREATE booking request
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const { success } = rateLimit(`booking:${ip}`, 5, 60_000);
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
