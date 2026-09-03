import { NextResponse, after } from "next/server";
import { redactContact } from "@/lib/privacy/contact-redaction";
import { plainText } from "@/lib/content/plain-text";
import { confirmationTransition } from "@/lib/booking/confirmation";
import { finalConfirmationEffects, notifyConfirmationStep } from "@/lib/booking/confirmation-effects";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { bookingRequests, calendarEvents, artists, users } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { sendEmail } from "@/lib/email/send";
import { sendPushToUser } from "@/lib/push/expo";

/**
 * Raise the platform fee for a booking that has just reached a fee-bearing
 * status. Idempotent (unique index on booking_request_id) and non-blocking:
 * a fee failure must never break the status change the user asked for.
 *
 * Every path into 'confirmed_by_client' or 'completed' must call this. It
 * used to be wired only to the vendor's accept action, so a booking the
 * client confirmed, or one taken straight from accepted to completed, never
 * produced a commission row and simply went missing from the ledger.
 */
function dropCommission(bookingId: number, note: string): void {
  after(async () => {
    try {
      const { cancelCommissionForBooking } = await import(
        "@/lib/commissions/service"
      );
      await cancelCommissionForBooking(bookingId, note);
    } catch (err) {
      console.error("[commissions] cancel failed for booking", bookingId, err);
    }
  });
}

function raiseCommission(bookingId: number): void {
  after(async () => {
    try {
      const { ensureCommissionForBooking } = await import(
        "@/lib/commissions/service"
      );
      await ensureCommissionForBooking(bookingId);
    } catch (err) {
      console.error("[commissions] ensure failed for booking", bookingId, err);
    }
  });
}


// UPDATE booking request — drives the bilateral confirmation flow (M0b #9):
//   action=accept          → artist accepts, status becomes "accepted"
//   action=reject          → artist rejects, status becomes "rejected"
//   action=client_confirm  → client confirms, status becomes "confirmed_by_client"
//   action=cancel          → client cancels while still pending, status "cancelled"
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: authenticatedId } = await auth();
  if (!authenticatedId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || !["accept","reject","client_confirm","venue_confirm","cancel","vendor_cancel","complete","set_paid","propose_price"].includes(body.action)) return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  if (body.agreedPrice !== undefined && (!Number.isSafeInteger(body.agreedPrice) || body.agreedPrice < 0 || body.agreedPrice > 10_000_000)) return NextResponse.json({ error: "invalid_price" }, { status: 400 });
  const { action, reply: rawReply, agreedPrice, paidStatus } = body as {
    action:
      | "accept"
      | "reject"
      | "client_confirm"
      | "venue_confirm"
      | "cancel"
      | "vendor_cancel"
      | "complete"
      | "set_paid"
      | "propose_price";
    reply?: string;
    /** Artist-supplied final price on accept, or counter-offer amount. */
    agreedPrice?: number;
    /** Client-flipped paid flag (budget tab, overview). */
    paidStatus?: "unpaid" | "partial" | "paid";
  };

  const reply = typeof rawReply === "string" ? redactContact(plainText(rawReply)).slice(0, 5000) : undefined;
  const [booking] = await db
    .select()
    .from(bookingRequests)
    .where(eq(bookingRequests.id, Number(id)))
    .limit(1);

  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Past-booking immutability guard (spec). Bookings whose event date is in
  // the past are read-only — no new status transitions allowed. Exceptions:
  //   - "complete" is explicitly the post-event action, so we allow it
  //     regardless of date (a vendor may mark completed a day or week later).
  //   - "set_paid" is also a post-event accounting action.
  //   - Cancellation of a past event is not allowed (would strand the data).
  if (booking.eventDate) {
    const today = new Date().toISOString().slice(0, 10);
    const isPast = booking.eventDate < today;
    const postEventActions = new Set(["complete", "set_paid"]);
    if (isPast && !postEventActions.has(action)) {
      return NextResponse.json(
        {
          error:
            "Rezervările din trecut nu mai pot fi modificate. Doar marcarea ca 'completat' sau actualizarea plății sunt permise.",
        },
        { status: 400 },
      );
    }
  }

  // Ownership helper — resolves whether the signed-in user owns the target
  // booking's vendor entity (artist OR venue).
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
    // Venue booking — check venue ownership
    if (booking.venueId) {
      const { venues } = await import("@/lib/db/schema");
      const [venue] = await db
        .select({ id: venues.id, userId: venues.userId })
        .from(venues)
        .where(eq(venues.id, booking.venueId))
        .limit(1);
      if (!venue || venue.userId !== appUser.id) {
        return { ok: false as const, status: 403, error: "Forbidden" };
      }
      return { ok: true as const };
    }
    // Artist booking
    if (booking.artistId) {
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
    return { ok: false as const, status: 404, error: "Booking has no vendor" };
  }

  if (action === "accept") {
    const owner = await requireBookingArtistOwner();
    if (!owner.ok) {
      return NextResponse.json({ error: owner.error }, { status: owner.status });
    }
    if (booking.status !== "pending") {
      return NextResponse.json(
        { error: "Doar cererile în așteptare pot fi acceptate" },
        { status: 409 },
      );
    }
    // Re-validate availability on accept — working hours + conflicts.
    // Same checks as on POST so an artist can't accept a booking that
    // violates their own schedule.
    if (booking.artistId) {
      const { checkArtistAvailability, formatConflictMessage } = await import(
        "@/lib/booking/availability"
      );
      const result = await checkArtistAvailability({
        artistId: booking.artistId,
        eventDate: booking.eventDate,
        startTime: booking.startTime,
        endTime: booking.endTime,
        excludeBookingId: booking.id,
      });
      if (!result.available) {
        return NextResponse.json(
          {
            error:
              "Nu poți accepta această rezervare — " +
              formatConflictMessage(result).toLowerCase(),
            conflict: result.conflict,
            outsideWorkingHours: result.outsideWorkingHours,
            workingHours: result.workingHours,
          },
          { status: 409 },
        );
      }
    }
    if (booking.venueId) {
      const { checkVenueAvailability, formatConflictMessage } = await import(
        "@/lib/booking/availability"
      );
      const result = await checkVenueAvailability({
        venueId: booking.venueId,
        eventDate: booking.eventDate,
        startTime: booking.startTime,
        endTime: booking.endTime,
        excludeBookingId: booking.id,
      });
      if (!result.available) {
        return NextResponse.json(
          {
            error:
              "Nu poți accepta această rezervare — " +
              formatConflictMessage(result).toLowerCase(),
            conflict: result.conflict,
            outsideWorkingHours: result.outsideWorkingHours,
            workingHours: result.workingHours,
          },
          { status: 409 },
        );
      }
    }
    // When the artist accepts, they may also declare the final agreed price.
    // That price flows straight into the event plan's budget.
    // If they don't specify, but there have been counter-offers, use the
    // LATEST counter-offer's amount (whichever side proposed it) as the
    // sealed price — accepting a negotiated booking should honor the
    // last number on the table, not the original request.
    let finalAgreedPrice: number | undefined =
      typeof agreedPrice === "number" && agreedPrice >= 0
        ? agreedPrice
        : undefined;
    if (finalAgreedPrice === undefined && Array.isArray(booking.priceOffers) && booking.priceOffers.length > 0) {
      const lastOffer = booking.priceOffers[booking.priceOffers.length - 1] as { amount?: number };
      if (typeof lastOffer?.amount === "number") {
        finalAgreedPrice = lastOffer.amount;
      }
    }
    const priceUpdate =
      finalAgreedPrice !== undefined ? { agreedPrice: finalAgreedPrice } : {};
    if (finalAgreedPrice === undefined) finalAgreedPrice = booking.agreedPrice ?? undefined;
    if (booking.artistId && (!finalAgreedPrice || !Number.isSafeInteger(finalAgreedPrice))) {
      return NextResponse.json({ error: "final_offer_price_required" }, { status: 400 });
    }
    const [offered] = await db.update(bookingRequests).set({
      status: "accepted", artistReply: reply || "Oferta este pregătită pentru acceptarea clientului.",
      ...priceUpdate, ...(finalAgreedPrice !== undefined ? { agreedPrice: finalAgreedPrice } : {}),
      updatedAt: new Date(),
    }).where(and(eq(bookingRequests.id, booking.id), eq(bookingRequests.status, "pending"))).returning();
    if (!offered) return NextResponse.json({ error: "booking_changed" }, { status: 409 });
    after(() => notifyConfirmationStep(offered, "Ofertă primită. Se așteaptă acceptarea clientului"));
    return NextResponse.json({ success: true, status: offered.status });
  } else if (action === "reject") {
    const owner = await requireBookingArtistOwner();
    if (!owner.ok) {
      return NextResponse.json({ error: owner.error }, { status: owner.status });
    }
    if (booking.status !== "pending") {
      return NextResponse.json(
        { error: "Doar cererile în așteptare pot fi refuzate" },
        { status: 409 },
      );
    }
    await db.update(bookingRequests).set({
      status: "rejected",
      artistReply: reply || "Ne pare rău, nu suntem disponibili.",
      updatedAt: new Date(),
    }).where(eq(bookingRequests.id, Number(id)));

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
    if (booking.status === "confirmed_by_client") {
      await finalConfirmationEffects(booking);
      return NextResponse.json({ success: true, status: booking.status });
    }
    if (booking.status !== "accepted") {
      return NextResponse.json(
        { error: "Booking must be accepted by artist first" },
        { status: 409 },
      );
    }
    if (booking.artistId) {
      const { checkArtistAvailability } = await import("@/lib/booking/availability");
      const available = await checkArtistAvailability({ artistId: booking.artistId, eventDate: booking.eventDate, startTime: booking.startTime, endTime: booking.endTime, excludeBookingId: booking.id });
      if (!available.available) return NextResponse.json({ error: "artist_unavailable" }, { status: 409 });
    }
    const next = confirmationTransition({ status: booking.status, venue: Boolean(booking.venueId), clientConfirmed: Boolean(booking.clientConfirmedAt), action });
    if (!next) return NextResponse.json({ error: "invalid_confirmation_step" }, { status: 409 });
    const now = new Date();
    const [updated] = await db.update(bookingRequests).set({
      status: next === "awaiting_venue" ? "accepted" : "confirmed_by_client",
      clientConfirmedAt: booking.clientConfirmedAt ?? now,
      confirmedAt: next === "awaiting_venue" ? null : now, updatedAt: now,
    }).where(and(eq(bookingRequests.id, booking.id), eq(bookingRequests.status, "accepted"))).returning();
    if (!updated) return NextResponse.json({ error: "booking_changed" }, { status: 409 });
    if (next === "awaiting_venue") after(() => notifyConfirmationStep(updated, "Clientul a acceptat oferta. Sala trebuie să confirme rezervarea"));
    else await finalConfirmationEffects(updated);
    return NextResponse.json({ success: true, status: updated.status, awaitingVenue: next === "awaiting_venue" });
  } else if (action === "venue_confirm") {
    const owner = await requireBookingArtistOwner();
    if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status });
    if (booking.venueId && booking.status === "confirmed_by_client") {
      await finalConfirmationEffects(booking);
      return NextResponse.json({ success: true, status: booking.status });
    }
    const next = confirmationTransition({ status: booking.status, venue: Boolean(booking.venueId), clientConfirmed: Boolean(booking.clientConfirmedAt), action });
    if (!next) return NextResponse.json({ error: "client_acceptance_required" }, { status: 409 });
    const { getCommissionRules } = await import("@/lib/commissions/service");
    const { computeCommission } = await import("@/lib/commissions/rules");
    if (!computeCommission({ vendorType: "venue", baseAmount: booking.agreedPrice ?? 0, guestCount: booking.guestCount, eventType: booking.eventType }, await getCommissionRules())) {
      return NextResponse.json({ error: "Tariful acestui eveniment necesită clarificare cu administrația înainte de confirmare." }, { status: 409 });
    }
    const { checkVenueAvailability } = await import("@/lib/booking/availability");
    const available = await checkVenueAvailability({ venueId: booking.venueId!, eventDate: booking.eventDate, startTime: booking.startTime, endTime: booking.endTime, excludeBookingId: booking.id });
    if (!available.available) return NextResponse.json({ error: "venue_unavailable" }, { status: 409 });
    const now = new Date();
    const [updated] = await db.update(bookingRequests).set({ status: "confirmed_by_client", confirmedAt: now, updatedAt: now })
      .where(and(eq(bookingRequests.id, booking.id), eq(bookingRequests.status, "accepted"))).returning();
    if (!updated) return NextResponse.json({ error: "booking_changed" }, { status: 409 });
    await finalConfirmationEffects(updated);
    return NextResponse.json({ success: true, status: updated.status });
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
    if (!["pending", "accepted"].includes(booking.status)) {
      return NextResponse.json(
        { error: "Doar cererile neconfirmate pot fi retrase de client" },
        { status: 409 },
      );
    }
    await db.update(bookingRequests).set({
      status: "cancelled",
      updatedAt: new Date(),
    }).where(eq(bookingRequests.id, Number(id)));

  } else if (action === "complete") {
    const owner = await requireBookingArtistOwner();
    if (!owner.ok) {
      return NextResponse.json({ error: owner.error }, { status: owner.status });
    }
    if (booking.status !== "confirmed_by_client") {
      return NextResponse.json(
        { error: "Both parties must confirm before completion" },
        { status: 409 },
      );
    }
    await db.update(bookingRequests).set({
      status: "completed",
      updatedAt: new Date(),
    }).where(eq(bookingRequests.id, Number(id)));
    raiseCommission(Number(id));
  } else if (action === "vendor_cancel") {
    // Vendor-initiated cancellation of an accepted/confirmed booking. Frees
    // the calendar slot (like reject-after-accept) and notifies the client by
    // email + in-app so they know to find an alternative.
    const owner = await requireBookingArtistOwner();
    if (!owner.ok) {
      return NextResponse.json({ error: owner.error }, { status: owner.status });
    }
    if (booking.status !== "accepted" && booking.status !== "confirmed_by_client") {
      return NextResponse.json(
        { error: "Only accepted/confirmed bookings can be cancelled by the vendor" },
        { status: 409 },
      );
    }
    await db.update(bookingRequests).set({
      status: "cancelled",
      artistReply: reply || "Rezervarea a fost anulată de organizator.",
      updatedAt: new Date(),
    }).where(eq(bookingRequests.id, Number(id)));
    // Tariffs §10 — the fee dies with the event.
    dropCommission(Number(id), "Anulată de furnizor");

    // Release the auto-blocked calendar slot.
    if (booking.eventDate) {
      const entityType = booking.venueId ? "venue" : "artist";
      const entityId = booking.venueId ?? booking.artistId;
      if (entityId) {
        await db
          .delete(calendarEvents)
          .where(
            and(
              eq(calendarEvents.entityType, entityType),
              eq(calendarEvents.entityId, entityId),
              eq(calendarEvents.date, booking.eventDate),
              eq(calendarEvents.source, "booking"),
            ),
          );
      }
    }

    // Notify the client (in-app + email) — outside the main request flow so
    // a transient email failure doesn't break the status transition.
    after(async () => {
      try {
        let vendorName = "Organizatorul";
        if (booking.venueId) {
          const { venues } = await import("@/lib/db/schema");
          const [v] = await db
            .select({ nameRo: venues.nameRo })
            .from(venues)
            .where(eq(venues.id, booking.venueId))
            .limit(1);
          if (v) vendorName = `Sala ${v.nameRo}`;
        } else if (booking.artistId) {
          const [a] = await db
            .select({ nameRo: artists.nameRo })
            .from(artists)
            .where(eq(artists.id, booking.artistId))
            .limit(1);
          if (a) vendorName = `Artistul ${a.nameRo}`;
        }

        const { notificationEmail } = await import(
          "@/lib/email/templates/notification-email"
        );
        const emailBody = `<strong>${vendorName}</strong> a anulat rezervarea confirmată pentru ${booking.eventDate}.${
          reply ? `<br><br>Motiv: <em>${reply}</em>` : ""
        }<br><br>Poți alege un alt furnizor disponibil la această dată pe ePetrecere.md.`;

        if (booking.clientUserId) {
          const [clientUser] = await db
            .select({ email: users.email })
            .from(users)
            .where(eq(users.id, booking.clientUserId))
            .limit(1);
          await dispatchNotification({
            userId: booking.clientUserId,
            type: "booking_status_changed",
            title: `${vendorName} a anulat rezervarea ta`,
            message: reply ?? `Pe ${booking.eventDate}`,
            actionUrl: "/cabinet/rezervari",
            email: clientUser?.email ?? undefined,
            emailSubject: `❌ ${vendorName} a anulat rezervarea ta`,
            emailHtml: notificationEmail({
              title: "Rezervare anulată",
              message: emailBody,
              ctaUrl: "https://epetrecere.md/cabinet/rezervari",
              ctaText: "Vezi detalii →",
              emoji: "❌",
            }),
          });
        } else if (booking.clientEmail) {
          await sendEmail({
            to: booking.clientEmail,
            subject: `❌ ${vendorName} a anulat rezervarea ta`,
            html: notificationEmail({
              title: "Rezervare anulată",
              message: emailBody,
              ctaUrl: "https://epetrecere.md",
              ctaText: "Vizitează ePetrecere.md →",
              emoji: "❌",
            }),
          });
        }
      } catch (err) {
        console.error("[vendor_cancel] notify failed", err);
      }
    });
  } else if (action === "set_paid") {
    // Either the client (from the budget tab) or the artist (from their
    // dashboard) can toggle paid status. Both sides have legitimate reasons
    // to mark money moved.
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const [appUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);
    if (!appUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Client must own the booking OR be the artist/venue owner.
    const isClient = appUser.id === booking.clientUserId;
    let isVendorOwner = false;
    if (!isClient && booking.artistId) {
      const [artist] = await db
        .select({ userId: artists.userId })
        .from(artists)
        .where(eq(artists.id, booking.artistId))
        .limit(1);
      isVendorOwner = artist?.userId === appUser.id;
    }
    if (!isClient && !isVendorOwner && booking.venueId) {
      const { venues } = await import("@/lib/db/schema");
      const [venue] = await db
        .select({ userId: venues.userId })
        .from(venues)
        .where(eq(venues.id, booking.venueId))
        .limit(1);
      isVendorOwner = venue?.userId === appUser.id;
    }
    if (!isClient && !isVendorOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!paidStatus || !["unpaid", "partial", "paid"].includes(paidStatus)) {
      return NextResponse.json({ error: "paidStatus required" }, { status: 400 });
    }
    if (
      booking.status !== "confirmed_by_client" &&
      booking.status !== "completed"
    ) {
      return NextResponse.json(
        { error: "Plata poate fi actualizată doar pentru rezervări confirmate" },
        { status: 409 },
      );
    }
    await db.update(bookingRequests).set({
      paidStatus,
      updatedAt: new Date(),
    }).where(eq(bookingRequests.id, Number(id)));
  } else if (action === "propose_price") {
    // Either party can push a counter-offer onto the priceOffers jsonb log.
    // The offer does NOT change status — it's a negotiation signal only.
    // An accept (with agreedPrice) from the artist seals the number.
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (typeof agreedPrice !== "number" || agreedPrice < 0) {
      return NextResponse.json({ error: "agreedPrice required" }, { status: 400 });
    }
    const [appUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);
    if (!appUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const isClient = appUser.id === booking.clientUserId;
    let isArtistOwner = false;
    if (!isClient && booking.artistId) {
      const [artist] = await db
        .select({ userId: artists.userId })
        .from(artists)
        .where(eq(artists.id, booking.artistId))
        .limit(1);
      isArtistOwner = artist?.userId === appUser.id;
    }
    if (!isClient && !isArtistOwner && booking.venueId) {
      const { venues } = await import("@/lib/db/schema");
      const [venue] = await db
        .select({ userId: venues.userId })
        .from(venues)
        .where(eq(venues.id, booking.venueId))
        .limit(1);
      isArtistOwner = venue?.userId === appUser.id;
    }
    if (!isClient && !isArtistOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (booking.status !== "pending") {
      return NextResponse.json(
        { error: "Negocierea este disponibilă doar cât cererea este în așteptare" },
        { status: 409 },
      );
    }
    const existingOffers = (booking.priceOffers ?? []) as Array<{
      from: "artist" | "client";
      amount: number;
      message?: string;
      at: string;
    }>;
    existingOffers.push({
      from: isClient ? "client" : "artist",
      amount: agreedPrice,
      message: reply,
      at: new Date().toISOString(),
    });
    await db.update(bookingRequests).set({
      priceOffers: existingOffers,
      updatedAt: new Date(),
    }).where(eq(bookingRequests.id, Number(id)));
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  // M5 — in-app notifications for both sides of the flow.
  after(async () => {
    try {
      if (action === "reject") {
        await notifyConfirmationStep({ ...booking, status: "rejected" }, "Furnizorul a refuzat solicitarea");
      } else if (action === "propose_price") {
        // Determine who proposed and notify the OTHER party
        const { userId: clerkId } = await auth();
        if (clerkId) {
          const [appUser] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.clerkId, clerkId))
            .limit(1);
          const isClient = appUser && appUser.id === booking.clientUserId;

          // Resolve vendor info
          let vendorInfo: { userId: string | null; nameRo: string; email: string | null } | null = null;
          if (booking.artistId) {
            const [a] = await db
              .select({ userId: artists.userId, nameRo: artists.nameRo, email: artists.email })
              .from(artists)
              .where(eq(artists.id, booking.artistId))
              .limit(1);
            vendorInfo = a ?? null;
          } else if (booking.venueId) {
            const { venues } = await import("@/lib/db/schema");
            const [v] = await db
              .select({ userId: venues.userId, nameRo: venues.nameRo, email: venues.email })
              .from(venues)
              .where(eq(venues.id, booking.venueId))
              .limit(1);
            vendorInfo = v ?? null;
          }

          const { notificationEmail } = await import("@/lib/email/templates/notification-email");
          const priceText = `${agreedPrice}€`;

          if (isClient && vendorInfo?.userId) {
            // Client proposed — notify vendor
            await dispatchNotification({
              userId: vendorInfo.userId,
              type: "booking_request_new",
              title: `${booking.clientName} a propus un preț`,
              message: `${priceText}${reply ? ` — ${reply}` : ""}`,
              actionUrl: "/dashboard/rezervari",
              email: vendorInfo.email ?? undefined,
              emailSubject: `💰 Contraofertă: ${priceText} de la ${booking.clientName}`,
              emailHtml: notificationEmail({
                title: "Contraofertă Nouă",
                message: `<strong>${booking.clientName}</strong> a propus prețul <strong>${priceText}</strong> pentru evenimentul din ${booking.eventDate}.${reply ? `<br><br>"${reply}"` : ""}`,
                ctaUrl: "https://epetrecere.md/dashboard/rezervari",
                ctaText: "Vezi oferta →",
                emoji: "💰",
              }),
            });
          } else if (!isClient && booking.clientUserId) {
            // Vendor proposed — notify client
            const [client] = await db
              .select({ email: users.email })
              .from(users)
              .where(eq(users.id, booking.clientUserId))
              .limit(1);
            await dispatchNotification({
              userId: booking.clientUserId,
              type: "booking_request_status_changed",
              title: `${vendorInfo?.nameRo ?? "Partenerul"} a propus un preț`,
              message: `${priceText}${reply ? ` — ${reply}` : ""}`,
              actionUrl: "/cabinet/rezervari",
              email: client?.email ?? booking.clientEmail ?? undefined,
              emailSubject: `💰 Ofertă nouă: ${priceText} de la ${vendorInfo?.nameRo ?? "Partener"}`,
              emailHtml: notificationEmail({
                title: "Ofertă Nouă de Preț",
                message: `<strong>${vendorInfo?.nameRo ?? "Partenerul"}</strong> a propus prețul <strong>${priceText}</strong> pentru evenimentul din ${booking.eventDate}.${reply ? `<br><br>"${reply}"` : ""}`,
                ctaUrl: "https://epetrecere.md/cabinet/rezervari",
                ctaText: "Vezi oferta →",
                emoji: "💰",
              }),
            });
          }
        }
      }
    } catch (err) {
      console.error("[notifications] booking PUT", err);
    }
  });

  // Email is already sent via dispatchNotification above (emailHtml param).
  // No separate sendEmail needed — avoids duplicate emails.

  return NextResponse.json({ success: true });
}
