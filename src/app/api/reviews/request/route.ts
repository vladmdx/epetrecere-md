// Vendor (venue OR artist) owner triggers a "please leave a review" email
// to a past client.
//
// Auth: signed-in vendor. The booking must belong to their venue OR artist
// and be in a completed/confirmed-past state. The endpoint auto-detects
// whether the caller owns the booking's venue or artist and picks the
// correct email template.
//
// Rate-limited to prevent spam.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  users,
  venues,
  artists,
  bookingRequests,
  reviews,
} from "@/lib/db/schema";
import { rateLimit } from "@/lib/rate-limit";
import { reviewRequestEmail } from "@/lib/email/templates/review-request";
import { sendEmail } from "@/lib/email/send";

const schema = z.object({
  bookingRequestId: z.number().int().positive(),
});

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const { success } = await rateLimit(`review-request:${ip}`, 20, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Prea multe cereri" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const [appUser] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Load booking + ownership info for BOTH venue and artist (nullable joins).
  const [booking] = await db
    .select({
      id: bookingRequests.id,
      venueId: bookingRequests.venueId,
      artistId: bookingRequests.artistId,
      clientName: bookingRequests.clientName,
      clientEmail: bookingRequests.clientEmail,
      clientUserId: bookingRequests.clientUserId,
      eventDate: bookingRequests.eventDate,
      status: bookingRequests.status,
      venueOwner: venues.userId,
      venueName: venues.nameRo,
      venueSlug: venues.slug,
      artistOwner: artists.userId,
      artistName: artists.nameRo,
      artistSlug: artists.slug,
    })
    .from(bookingRequests)
    .leftJoin(venues, eq(venues.id, bookingRequests.venueId))
    .leftJoin(artists, eq(artists.id, bookingRequests.artistId))
    .where(eq(bookingRequests.id, parsed.data.bookingRequestId))
    .limit(1);

  if (!booking) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Determine which entity the caller owns on this booking
  let kind: "sala" | "artist" | null = null;
  if (booking.venueId && booking.venueOwner === appUser.id) kind = "sala";
  else if (booking.artistId && booking.artistOwner === appUser.id)
    kind = "artist";

  if (!kind) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Only ask after the event has happened
  const today = new Date().toISOString().slice(0, 10);
  if (booking.eventDate >= today) {
    return NextResponse.json(
      { error: "Poți cere recenzia doar după eveniment" },
      { status: 400 },
    );
  }
  if (!["confirmed_by_client", "completed"].includes(booking.status)) {
    return NextResponse.json(
      { error: "Recenzia poate fi cerută doar pentru o rezervare confirmată" },
      { status: 409 },
    );
  }

  // Don't spam: if a review already exists for this booking, bail out.
  const [existing] = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(eq(reviews.bookingRequestId, booking.id))
    .limit(1);
  if (existing) {
    return NextResponse.json(
      { error: "Clientul a lăsat deja o recenzie pentru această rezervare" },
      { status: 409 },
    );
  }

  // Resolve client email (booking's own or linked user's)
  let clientEmail = booking.clientEmail;
  if (!clientEmail && booking.clientUserId) {
    const [clientUser] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, booking.clientUserId))
      .limit(1);
    clientEmail = clientUser?.email ?? null;
  }
  if (!clientEmail) {
    return NextResponse.json(
      { error: "Clientul nu are email în rezervare" },
      { status: 400 },
    );
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://epetrecere.md";
  const entityName =
    kind === "sala" ? booking.venueName || "sala" : booking.artistName || "artistul";
  const reviewUrl = `${base}/cabinet/recenzii?booking=${booking.id}`;

  const html = reviewRequestEmail({
    clientName: booking.clientName,
    artistName: entityName,
    eventDate: new Date(booking.eventDate).toLocaleDateString("ro-RO", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    reviewUrl,
    subjectType: kind,
  });

  try {
    await sendEmail({
      to: clientEmail,
      subject: `Cum a fost evenimentul ${kind === "sala" ? "la" : "cu"} ${entityName}?`,
      html,
    });
  } catch (err) {
    console.error("[review-request] send failed", err);
    return NextResponse.json(
      { error: "Emailul nu a putut fi trimis" },
      { status: 503 },
    );
  }

  return NextResponse.json({ success: true });
}
