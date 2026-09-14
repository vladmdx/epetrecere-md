import { NextResponse, after } from "next/server";
import { redactContact } from "@/lib/privacy/contact-redaction";
import { plainText } from "@/lib/content/plain-text";
import { confirmationTransition } from "@/lib/booking/confirmation";
import {
  formatConflictMessage,
  type AvailabilityResult,
} from "@/lib/booking/availability";
import { notifyConfirmationStep, scheduleConfirmationNotifications } from "@/lib/booking/confirmation-effects";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { bookingRequests, artists, users } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import {
  getVenueOwnerRecipients,
} from "@/lib/venue-access";
import {
  BookingMutationBoundaryError,
  withBookingMutationBoundary,
  type BookingMutationPrincipal,
} from "@/lib/booking/booking-mutation-boundary";
import {
  CommissionRequiredError,
  persistConfirmationEffects,
} from "@/lib/booking/confirmation-persist";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { sendEmail } from "@/lib/email/send";
import { vendorBookingNotificationPath } from "@/lib/notifications/venue-routing";
import { VenueAvailabilityError } from "@/lib/booking/venue-booking-write";
import {
  DEFAULT_VENUE_TZ,
  localDateInZone,
} from "@/lib/booking/zoned-interval";
import {
  BookingChangedError,
  casUpdateBookingStatus,
  casClientConfirm,
  casSetPaid,
  clientCancelBooking,
  vendorCancelBooking,
} from "@/lib/booking/booking-transitions";

function bookingMutationBoundaryResponse(error: unknown) {
  if (!(error instanceof BookingMutationBoundaryError)) return null;
  const message = error.code === "unauthorized"
    ? "Unauthorized"
    : error.code === "forbidden"
      ? "Forbidden"
      : "booking_changed";
  return NextResponse.json({ error: message }, { status: error.status });
}

function artistAvailabilityResponse(
  error: unknown,
  verb: "accepta" | "confirma",
) {
  if (!(error instanceof Error) || error.message !== "artist_unavailable") {
    return null;
  }
  const availability = (error as Error & {
    availability?: AvailabilityResult;
  }).availability;
  return NextResponse.json(
    {
      error: `Nu poți ${verb} această rezervare — ` + (
        availability
          ? formatConflictMessage(availability).toLowerCase()
          : "artist_unavailable"
      ),
    },
    { status: 409 },
  );
}

function isPastBookingMutation(
  booking: typeof bookingRequests.$inferSelect,
  action: string,
): boolean {
  if (!booking.eventDate) return false;
  const today = localDateInZone(
    new Date(),
    booking.timezone || DEFAULT_VENUE_TZ,
  );
  return booking.eventDate < today && !["complete", "set_paid"].includes(action);
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
  let bookingForDeferredEffects = booking;
  let priceProposalPrincipal: BookingMutationPrincipal | null = null;

  if (action === "accept") {
    let result;
    try {
      result = await withBookingMutationBoundary({
        clerkId: authenticatedId,
        expected: booking,
        access: { mode: "vendor", venueCapability: "manage_bookings" },
        confirmationAvailability: true,
        mutate: async ({ executor, booking: current }) => {
          if (isPastBookingMutation(current, action)) {
            return { kind: "past" as const };
          }
          if (current.status !== "pending") {
            return { kind: "not_pending" as const };
          }

          // Resolve the sealed price from the locked row. A counteroffer which
          // committed while this request waited must be observed here.
          let finalAgreedPrice: number | undefined =
            typeof agreedPrice === "number" ? agreedPrice : undefined;
          if (
            finalAgreedPrice === undefined
            && Array.isArray(current.priceOffers)
            && current.priceOffers.length > 0
          ) {
            const lastOffer = current.priceOffers.at(-1) as {
              amount?: number;
            } | undefined;
            if (typeof lastOffer?.amount === "number") {
              finalAgreedPrice = lastOffer.amount;
            }
          }
          if (finalAgreedPrice === undefined) {
            finalAgreedPrice = current.agreedPrice ?? undefined;
          }
          if (
            current.artistId
            && (!finalAgreedPrice || !Number.isSafeInteger(finalAgreedPrice))
          ) {
            return { kind: "price_required" as const };
          }

          const offered = await casUpdateBookingStatus(
            executor,
            current.id,
            ["pending"],
            {
              status: "accepted",
              artistReply:
                reply || "Oferta este pregătită pentru acceptarea clientului.",
              ...(finalAgreedPrice !== undefined
                ? { agreedPrice: finalAgreedPrice }
                : {}),
            },
          );
          if (!offered) throw new BookingChangedError();
          return { kind: "accepted" as const, row: offered };
        },
      });
    } catch (error) {
      const boundary = bookingMutationBoundaryResponse(error);
      if (boundary) return boundary;
      const artistAvailability = artistAvailabilityResponse(error, "accepta");
      if (artistAvailability) return artistAvailability;
      if (error instanceof VenueAvailabilityError) {
        return NextResponse.json(
          {
            error: "Nu poți accepta această rezervare — "
              + (error.result.message || error.result.code).toLowerCase(),
            code: error.result.code,
          },
          { status: error.status },
        );
      }
      if (error instanceof BookingChangedError) {
        return NextResponse.json({ error: "booking_changed" }, { status: 409 });
      }
      throw error;
    }
    if (result.kind === "past") {
      return NextResponse.json(
        { error: "Rezervările din trecut nu mai pot fi modificate." },
        { status: 400 },
      );
    }
    if (result.kind === "not_pending") {
      return NextResponse.json(
        { error: "Doar cererile în așteptare pot fi acceptate" },
        { status: 409 },
      );
    }
    if (result.kind === "price_required") {
      return NextResponse.json(
        { error: "final_offer_price_required" },
        { status: 400 },
      );
    }
    after(() => notifyConfirmationStep(
      result.row,
      "Ofertă primită. Se așteaptă acceptarea clientului",
    ));
    return NextResponse.json({ success: true, status: result.row.status });
  } else if (action === "reject") {
    let result;
    try {
      result = await withBookingMutationBoundary({
        clerkId: authenticatedId,
        expected: booking,
        access: { mode: "vendor", venueCapability: "manage_bookings" },
        mutate: async ({ executor, booking: current }) => {
          if (isPastBookingMutation(current, action)) {
            return { kind: "past" as const };
          }
          const row = await casUpdateBookingStatus(
            executor,
            current.id,
            ["pending"],
            {
              status: "rejected",
              artistReply: reply || "Ne pare rău, nu suntem disponibili.",
            },
          );
          if (!row) throw new BookingChangedError();
          return { kind: "rejected" as const, row };
        },
      });
    } catch (error) {
      const boundary = bookingMutationBoundaryResponse(error);
      if (boundary) return boundary;
      if (error instanceof BookingChangedError) {
        return NextResponse.json({ error: "Doar cererile în așteptare pot fi refuzate" }, { status: 409 });
      }
      throw error;
    }
    if (result.kind === "past") {
      return NextResponse.json(
        { error: "Rezervările din trecut nu mai pot fi modificate." },
        { status: 400 },
      );
    }
    bookingForDeferredEffects = result.row;

  } else if (action === "client_confirm") {
    // The optimistic row is only a lock plan. Client ownership, vendor tuple,
    // status and effects are all decided again inside one locked transaction.
    let result;
    try {
      result = await withBookingMutationBoundary({
        clerkId: authenticatedId,
        expected: booking,
        access: { mode: "client" },
        confirmationAvailability:
          booking.artistId != null && booking.status !== "confirmed_by_client",
        requireLiveVendor: true,
        mutate: async ({ executor, booking: current }) => {
          if (isPastBookingMutation(current, action)) {
            return { kind: "past" as const };
          }
          if (current.status === "confirmed_by_client") {
            const row = await persistConfirmationEffects(executor, current);
            return { kind: "confirmed" as const, row, awaitingVenue: false };
          }
          if (
            current.status === "accepted"
            && current.venueId
            && current.clientConfirmedAt
          ) {
            return {
              kind: "confirmed" as const,
              row: current,
              awaitingVenue: true,
            };
          }
          if (current.status !== "accepted") {
            return { kind: "not_accepted" as const };
          }
          const next = confirmationTransition({
            status: current.status,
            venue: Boolean(current.venueId),
            clientConfirmed: Boolean(current.clientConfirmedAt),
            action,
          });
          if (!next) return { kind: "invalid_step" as const };
          const now = new Date();
          const updated = await casClientConfirm(executor, current.id, {
            status:
              next === "awaiting_venue" ? "accepted" : "confirmed_by_client",
            clientConfirmedAt: now,
            confirmedAt: next === "awaiting_venue" ? null : now,
          });
          if (!updated) throw new BookingChangedError();
          const row = next === "awaiting_venue"
            ? updated
            : await persistConfirmationEffects(executor, updated);
          return {
            kind: "confirmed" as const,
            row,
            awaitingVenue: next === "awaiting_venue",
          };
        },
      });
    } catch (error) {
      const boundary = bookingMutationBoundaryResponse(error);
      if (boundary) return boundary;
      const artistAvailability = artistAvailabilityResponse(error, "confirma");
      if (artistAvailability) return artistAvailability;
      if (error instanceof VenueAvailabilityError) {
        return NextResponse.json({ error: "venue_unavailable", code: error.result.code }, { status: error.status });
      }
      if (error instanceof BookingChangedError) {
        return NextResponse.json({ error: "booking_changed" }, { status: 409 });
      }
      throw error;
    }
    if (result.kind === "past") {
      return NextResponse.json(
        {
          error:
            "Rezervările din trecut nu mai pot fi modificate. Doar marcarea ca 'completat' sau actualizarea plății sunt permise.",
        },
        { status: 400 },
      );
    }
    if (result.kind === "not_accepted") {
      return NextResponse.json(
        { error: "Booking must be accepted by artist first" },
        { status: 409 },
      );
    }
    if (result.kind === "invalid_step") {
      return NextResponse.json(
        { error: "invalid_confirmation_step" },
        { status: 409 },
      );
    }
    if (result.awaitingVenue) {
      after(() => notifyConfirmationStep(
        result.row,
        "Clientul a acceptat oferta. Sala trebuie să confirme rezervarea",
      ));
    } else {
      scheduleConfirmationNotifications(result.row);
    }
    return NextResponse.json({
      success: true,
      status: result.row.status,
      awaitingVenue: result.awaitingVenue,
    });
  } else if (action === "venue_confirm") {
    const { getCommissionRules } = await import("@/lib/commissions/service");
    const { computeCommission } = await import("@/lib/commissions/rules");
    let result;
    try {
      result = await withBookingMutationBoundary({
        clerkId: authenticatedId,
        expected: booking,
        access: { mode: "vendor", venueCapability: "manage_bookings" },
        confirmationAvailability:
          booking.status !== "confirmed_by_client"
          && booking.status !== "completed",
        confirmationBarrier: true,
        mutate: async ({ executor, booking: current }) => {
          if (isPastBookingMutation(current, action)) {
            return { kind: "past" as const };
          }
          if (!current.venueId) {
            return { kind: "client_required" as const };
          }
          if (current.status === "confirmed_by_client") {
            const row = await persistConfirmationEffects(executor, current);
            return { kind: "confirmed" as const, row };
          }
          const next = confirmationTransition({
            status: current.status,
            venue: true,
            clientConfirmed: Boolean(current.clientConfirmedAt),
            action,
          });
          if (!next) return { kind: "client_required" as const };
          // Validate and persist from one transaction-bound rules snapshot.
          // A concurrent admin edit may apply to the next booking, but cannot
          // make this confirmation commit without the fee just validated.
          const commissionRules = await getCommissionRules(executor);
          if (!computeCommission({
            vendorType: "venue",
            baseAmount: current.agreedPrice ?? 0,
            guestCount: current.guestCount,
            eventType: current.eventType,
          }, commissionRules)) {
            return { kind: "tariff_required" as const };
          }
          const now = new Date();
          const row = await casUpdateBookingStatus(
            executor,
            current.id,
            ["accepted"],
            {
              status: "confirmed_by_client",
              confirmedAt: now,
            },
          );
          if (!row) throw new BookingChangedError();
          return {
            kind: "confirmed" as const,
            row: await persistConfirmationEffects(executor, row, {
              commissionRules,
              requireCommission: true,
            }),
          };
        },
      });
    } catch (error) {
      const boundary = bookingMutationBoundaryResponse(error);
      if (boundary) return boundary;
      if (error instanceof CommissionRequiredError) {
        return NextResponse.json(
          { error: "commission_required" },
          { status: 409 },
        );
      }
      if (error instanceof VenueAvailabilityError) {
        return NextResponse.json({ error: "venue_unavailable", code: error.result.code }, { status: error.status });
      }
      if (error instanceof BookingChangedError) {
        return NextResponse.json({ error: "booking_changed" }, { status: 409 });
      }
      throw error;
    }
    if (result.kind === "past") {
      return NextResponse.json(
        { error: "Rezervările din trecut nu mai pot fi modificate." },
        { status: 400 },
      );
    }
    if (result.kind === "client_required") {
      return NextResponse.json(
        { error: "client_acceptance_required" },
        { status: 409 },
      );
    }
    if (result.kind === "tariff_required") {
      return NextResponse.json(
        {
          error:
            "Tariful acestui eveniment necesită clarificare cu administrația înainte de confirmare.",
        },
        { status: 409 },
      );
    }
    scheduleConfirmationNotifications(result.row);
    return NextResponse.json({ success: true, status: result.row.status });
  } else if (action === "cancel") {
    // The barrier is acquired after the live actor row but before vendor and
    // booking rows, matching delivery and deletion lock order.
    let result;
    try {
      result = await withBookingMutationBoundary({
        clerkId: authenticatedId,
        expected: booking,
        access: { mode: "client" },
        confirmationBarrier: true,
        mutate: async ({ executor, booking: current }) => {
          if (isPastBookingMutation(current, action)) {
            return { kind: "past" as const };
          }
          const row = await clientCancelBooking(current.id, executor);
          return { kind: "cancelled" as const, row };
        },
      });
    } catch (error) {
      const boundary = bookingMutationBoundaryResponse(error);
      if (boundary) return boundary;
      if (error instanceof BookingChangedError) {
        return NextResponse.json({ error: "Doar cererile neconfirmate pot fi retrase de client" }, { status: 409 });
      }
      throw error;
    }
    if (result.kind === "past") {
      return NextResponse.json(
        {
          error:
            "Rezervările din trecut nu mai pot fi modificate. Doar marcarea ca 'completat' sau actualizarea plății sunt permise.",
        },
        { status: 400 },
      );
    }
    bookingForDeferredEffects = result.row;

  } else if (action === "complete") {
    let result;
    try {
      result = await withBookingMutationBoundary({
        clerkId: authenticatedId,
        expected: booking,
        access: { mode: "vendor", venueCapability: "manage_bookings" },
        mutate: async ({ executor, booking: current }) => {
          if (current.status !== "confirmed_by_client") {
            return { kind: "not_confirmed" as const };
          }
          const today = localDateInZone(
            new Date(),
            current.timezone || DEFAULT_VENUE_TZ,
          );
          if (current.eventDate > today) {
            return { kind: "future" as const };
          }
          const row = await casUpdateBookingStatus(
            executor,
            current.id,
            ["confirmed_by_client"],
            { status: "completed" },
          );
          if (!row) throw new BookingChangedError();
          return {
            kind: "completed" as const,
            row: await persistConfirmationEffects(executor, row),
          };
        },
      });
    } catch (error) {
      const boundary = bookingMutationBoundaryResponse(error);
      if (boundary) return boundary;
      if (error instanceof BookingChangedError) {
        return NextResponse.json({ error: "booking_changed" }, { status: 409 });
      }
      throw error;
    }
    if (result.kind === "not_confirmed") {
      return NextResponse.json(
        { error: "Both parties must confirm before completion" },
        { status: 409 },
      );
    }
    if (result.kind === "future") {
      return NextResponse.json({ error: "Evenimentul nu poate fi finalizat înainte de data rezervată." }, { status: 409 });
    }
    bookingForDeferredEffects = result.row;
  } else if (action === "vendor_cancel") {
    // Vendor-initiated cancellation of an accepted/confirmed booking. Frees
    // the calendar slot (like reject-after-accept) and notifies the client by
    // email + in-app so they know to find an alternative.
    let result;
    try {
      result = await withBookingMutationBoundary({
        clerkId: authenticatedId,
        expected: booking,
        access: { mode: "vendor", venueCapability: "manage_bookings" },
        confirmationBarrier: true,
        mutate: async ({ executor, booking: current }) => {
          if (isPastBookingMutation(current, action)) {
            return { kind: "past" as const };
          }
          const row = await vendorCancelBooking(current.id, reply, executor);
          return { kind: "cancelled" as const, row };
        },
      });
    } catch (error) {
      const boundary = bookingMutationBoundaryResponse(error);
      if (boundary) return boundary;
      if (error instanceof BookingChangedError) {
        return NextResponse.json(
          { error: "Only accepted/confirmed bookings can be cancelled by the vendor" },
          { status: 409 },
        );
      }
      throw error;
    }
    if (result.kind === "past") {
      return NextResponse.json(
        { error: "Rezervările din trecut nu mai pot fi modificate." },
        { status: 400 },
      );
    }
    bookingForDeferredEffects = result.row;
    const cancelledBooking = result.row;

    // Notify the client (in-app + email) — outside the main request flow so
    // a transient email failure doesn't break the status transition.
    after(async () => {
      try {
        const booking = cancelledBooking;
        let vendorName = "Organizatorul";
        if (booking.venueId) {
          const { venues } = await import("@/lib/db/schema");
          const [v] = await db
            .select({ nameRo: venues.nameRo })
            .from(venues)
            .where(eq(venues.id, booking.venueId))
            .limit(1);
          if (v) {
            const { venueHallDisplayName } = await import("@/lib/booking/venue-booking-write");
            vendorName = await venueHallDisplayName(booking.venueId, booking.hallId ?? null);
          }
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
    if (!paidStatus || !["unpaid", "partial", "paid"].includes(paidStatus)) {
      return NextResponse.json({ error: "paidStatus required" }, { status: 400 });
    }
    let result;
    try {
      result = await withBookingMutationBoundary({
        clerkId: authenticatedId,
        expected: booking,
        access: {
          mode: "client_or_vendor",
          venueCapability: "manage_financials",
        },
        mutate: async ({ executor, booking: current }) => {
          if (
            current.status !== "confirmed_by_client" &&
            current.status !== "completed"
          ) {
            return { kind: "not_confirmed" as const };
          }
          const row = await casSetPaid(
            executor,
            current.id,
            paidStatus as "unpaid" | "partial" | "paid",
          );
          if (!row) throw new BookingChangedError();
          return { kind: "paid" as const, row };
        },
      });
    } catch (error) {
      const boundary = bookingMutationBoundaryResponse(error);
      if (boundary) return boundary;
      if (error instanceof BookingChangedError) {
        return NextResponse.json({ error: "booking_changed" }, { status: 409 });
      }
      throw error;
    }
    if (result.kind === "not_confirmed") {
      return NextResponse.json(
        { error: "Plata poate fi actualizată doar pentru rezervări confirmate" },
        { status: 409 },
      );
    }
    bookingForDeferredEffects = result.row;
  } else if (action === "propose_price") {
    // Either party can push a counter-offer onto the priceOffers jsonb log.
    // The offer does NOT change status — it's a negotiation signal only.
    // An accept (with agreedPrice) from the artist seals the number.
    if (typeof agreedPrice !== "number" || agreedPrice < 0) {
      return NextResponse.json({ error: "agreedPrice required" }, { status: 400 });
    }
    let result;
    try {
      result = await withBookingMutationBoundary({
        clerkId: authenticatedId,
        expected: booking,
        access: {
          mode: "client_or_vendor",
          venueCapability: "manage_bookings",
        },
        requireLiveVendor: true,
        mutate: async ({ executor, booking: current, principal }) => {
          if (isPastBookingMutation(current, action)) {
            return { kind: "past" as const };
          }
          if (current.status !== "pending") {
            return { kind: "not_pending" as const };
          }
          const offer = {
            from: principal === "client" ? "client" : "artist",
            amount: agreedPrice,
            message: reply,
            at: new Date().toISOString(),
          };
          // Append in PostgreSQL so simultaneous counteroffers do not erase
          // one another, and never append after vendor acceptance.
          const [changed] = await executor
            .update(bookingRequests)
            .set({
              priceOffers: sql`COALESCE(${bookingRequests.priceOffers}, '[]'::jsonb) || ${JSON.stringify([offer])}::jsonb`,
              updatedAt: new Date(),
            })
            .where(and(
              eq(bookingRequests.id, current.id),
              eq(bookingRequests.status, "pending"),
            ))
            .returning();
          if (!changed) throw new BookingChangedError();
          return { kind: "proposed" as const, row: changed, principal };
        },
      });
    } catch (error) {
      const boundary = bookingMutationBoundaryResponse(error);
      if (boundary) return boundary;
      if (error instanceof BookingChangedError) {
        return NextResponse.json({ error: "booking_changed" }, { status: 409 });
      }
      throw error;
    }
    if (result.kind === "past") {
      return NextResponse.json(
        {
          error:
            "Rezervările din trecut nu mai pot fi modificate. Doar marcarea ca 'completat' sau actualizarea plății sunt permise.",
        },
        { status: 400 },
      );
    }
    if (result.kind === "not_pending") {
      return NextResponse.json(
        { error: "Negocierea este disponibilă doar cât cererea este în așteptare" },
        { status: 409 },
      );
    }
    bookingForDeferredEffects = result.row;
    priceProposalPrincipal = result.principal;
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  // M5 — in-app notifications for both sides of the flow.
  after(async () => {
    try {
      if (action === "reject") {
        await notifyConfirmationStep(
          bookingForDeferredEffects,
          "Furnizorul a refuzat solicitarea",
        );
      } else if (action === "propose_price") {
        // Use the principal and tuple authorized by the committed boundary;
        // never reclassify the proposer from a later account snapshot.
        const booking = bookingForDeferredEffects;
        const isClient = priceProposalPrincipal === "client";

        // Resolve vendor info
        let vendorInfo: { userId: string | null; nameRo: string; email: string | null } | null = null;
        let venueRecipients: Awaited<ReturnType<typeof getVenueOwnerRecipients>> = [];
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
          venueRecipients = await getVenueOwnerRecipients(booking.venueId);
        }

        const { notificationEmail } = await import("@/lib/email/templates/notification-email");
        const priceText = `${agreedPrice}€`;

        if (isClient && (vendorInfo?.userId || venueRecipients.length > 0)) {
            // Client proposed — notify vendor
            const vendorDashboardPath = vendorBookingNotificationPath({
              venueId: booking.venueId,
              bookingId: booking.id,
            });
            const recipients = booking.venueId
              ? venueRecipients
              : vendorInfo?.userId
                ? [{ userId: vendorInfo.userId, email: vendorInfo.email }]
                : [];
            await Promise.all(recipients.map((recipient) => dispatchNotification({
              userId: recipient.userId,
              type: "booking_request_new",
              title: `${booking.clientName} a propus un preț`,
              message: `${priceText}${reply ? ` — ${reply}` : ""}`,
              actionUrl: vendorDashboardPath,
              email: recipient.email ?? undefined,
              emailSubject: `💰 Contraofertă: ${priceText} de la ${booking.clientName}`,
              emailHtml: notificationEmail({
                title: "Contraofertă Nouă",
                message: `<strong>${booking.clientName}</strong> a propus prețul <strong>${priceText}</strong> pentru evenimentul din ${booking.eventDate}.${reply ? `<br><br>"${reply}"` : ""}`,
                ctaUrl: `https://epetrecere.md${vendorDashboardPath}`,
                ctaText: "Vezi oferta →",
                emoji: "💰",
              }),
            })));
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
    } catch (err) {
      console.error("[notifications] booking PUT", err);
    }
  });

  // Email is already sent via dispatchNotification above (emailHtml param).
  // No separate sendEmail needed — avoids duplicate emails.

  return NextResponse.json({ success: true });
}
