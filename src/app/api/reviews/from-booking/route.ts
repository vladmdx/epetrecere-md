import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { reviews, bookingRequests, users, artists } from "@/lib/db/schema";
import { and, eq, or } from "drizzle-orm";
import { dispatchNotification, dispatchToAdmins } from "@/lib/notifications/dispatch";

// M4 — POST /api/reviews/from-booking
//
// Verified-booking review flow. The user submits a review tied to a
// specific booking_request. We verify:
//   1. They are signed in.
//   2. The booking belongs to them (via client_user_id or client_email).
//   3. The booking is confirmed_by_client and the event date is in the
//      past (you can't review a party that hasn't happened).
//   4. They haven't already reviewed this booking — enforced by the
//      UNIQUE constraint on reviews.booking_request_id.
//
// Reviews land with isApproved=false, so admin moderation still kicks
// in before they show up on the artist profile.

const schema = z.object({
  bookingRequestId: z.number().int().positive(),
  rating: z.number().int().min(1).max(5),
  text: z.string().min(10).max(1000),
});

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Load the booking and verify ownership
  const [booking] = await db
    .select()
    .from(bookingRequests)
    .where(
      and(
        eq(bookingRequests.id, parsed.data.bookingRequestId),
        or(
          eq(bookingRequests.clientUserId, appUser.id),
          appUser.email ? eq(bookingRequests.clientEmail, appUser.email) : undefined,
        )!,
      ),
    )
    .limit(1);
  if (!booking) {
    return NextResponse.json(
      { error: "Booking not found or not yours" },
      { status: 404 },
    );
  }

  // Must be confirmed and past event date
  if (booking.status !== "confirmed_by_client") {
    return NextResponse.json(
      { error: "Doar rezervările confirmate pot fi recenzate" },
      { status: 400 },
    );
  }
  // eventDate is a date column ("YYYY-MM-DD"); compare against today
  const today = new Date().toISOString().slice(0, 10);
  if (booking.eventDate > today) {
    return NextResponse.json(
      { error: "Poți lăsa o recenzie doar după eveniment" },
      { status: 400 },
    );
  }

  // Duplicate check — hand off to the DB unique constraint for the
  // race-safe path, but pre-check for a nicer error message.
  const [existing] = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(eq(reviews.bookingRequestId, parsed.data.bookingRequestId))
    .limit(1);
  if (existing) {
    return NextResponse.json(
      { error: "Ai trimis deja o recenzie pentru această rezervare" },
      { status: 409 },
    );
  }

  try {
    const [review] = await db
      .insert(reviews)
      .values({
        artistId: booking.artistId,
        bookingRequestId: booking.id,
        authorUserId: appUser.id,
        authorName: appUser.name || booking.clientName,
        eventType: booking.eventType,
        eventDate: booking.eventDate,
        rating: parsed.data.rating,
        text: parsed.data.text,
        isApproved: false,
      })
      .returning();

    // M5 — fire-and-forget notifications to admin + artist
    void (async () => {
      try {
        await dispatchToAdmins({
          type: "admin_review_pending",
          title: "Recenzie verificată de aprobat",
          message: `${parsed.data.rating}★ — rezervare #${booking.id}`,
          actionUrl: "/admin/recenzii",
        });
        const [artist] = await db
          .select({ userId: artists.userId })
          .from(artists)
          .where(eq(artists.id, booking.artistId))
          .limit(1);
        if (artist?.userId) {
          await dispatchNotification({
            userId: artist.userId,
            type: "review_new",
            title: "Ai o recenzie verificată nouă",
            message: `${parsed.data.rating}★ de la un client real`,
            actionUrl: "/dashboard/recenzii",
          });
        }
      } catch (err) {
        console.error("[notifications] verified review", err);
      }
    })();

    return NextResponse.json({ review }, { status: 201 });
  } catch (e: unknown) {
    // Race safety: catch the unique constraint violation
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return NextResponse.json(
        { error: "Deja ai trimis o recenzie pentru această rezervare" },
        { status: 409 },
      );
    }
    throw e;
  }
}
