import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { bookingRequests, calendarEvents, artists, users } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { sendEmail } from "@/lib/email/send";
import { reviewRequestEmail } from "@/lib/email/templates/review-request";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { sendPushToUser, type PushKind } from "@/lib/push/expo";

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
  const { action, reply, agreedPrice, paidStatus } = body as {
    action:
      | "accept"
      | "reject"
      | "client_confirm"
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
    // The partner's accept finalizes the booking — no separate client
    // confirmation step. Both parties get contact details below.
    await db.update(bookingRequests).set({
      status: "confirmed_by_client",
      artistReply: reply || "Cererea a fost acceptată!",
      ...priceUpdate,
      updatedAt: new Date(),
    }).where(eq(bookingRequests.id, Number(id)));

    // Referral milestone — if the accepted booking is for a referred
    // client and it's their first, credit the referrer. Non-blocking.
    if (booking.clientUserId) {
      void (async () => {
        try {
          const { triggerReferral, isFirstBookingForUser } = await import(
            "@/lib/referrals/trigger"
          );
          if (await isFirstBookingForUser(booking.clientUserId!)) {
            await triggerReferral(booking.clientUserId!, "first_booking", {
              bookingId: booking.id,
              eventDate: booking.eventDate,
            });
          }
        } catch (err) {
          console.error("[referral] first_booking trigger failed", err);
        }
      })();
    }

    // Block the vendor's calendar — works for either artist OR venue.
    if (booking.eventDate) {
      const entityType = booking.venueId ? "venue" : "artist";
      const entityId = booking.venueId ?? booking.artistId;
      if (entityId) {
        await db.insert(calendarEvents).values({
          entityType,
          entityId,
          date: booking.eventDate,
          status: "booked",
          source: "booking",
          eventType: booking.eventType ?? null,
          note: `Rezervare: ${booking.clientName} - ${booking.eventType || "Eveniment"}`,
        });
      }
    }

    // Phase 6 — Cross-notify other confirmed vendors on the same event plan.
    // If this accepted booking is part of a multi-vendor event, let the other
    // already-confirmed vendors know ("the venue / artist X just joined your
    // event"). Non-blocking.
    void (async () => {
      if (!booking.eventPlanId) return;
      try {
        const { venues } = await import("@/lib/db/schema");
        const siblings = await db
          .select({
            id: bookingRequests.id,
            artistId: bookingRequests.artistId,
            venueId: bookingRequests.venueId,
            status: bookingRequests.status,
          })
          .from(bookingRequests)
          .where(
            and(
              eq(bookingRequests.eventPlanId, booking.eventPlanId),
              inArray(bookingRequests.status, [
                "accepted",
                "confirmed_by_client",
              ]),
            ),
          );

        // Determine the accepting vendor's display name
        let actorName = "Un partener";
        if (booking.venueId) {
          const [v] = await db
            .select({ nameRo: venues.nameRo })
            .from(venues)
            .where(eq(venues.id, booking.venueId))
            .limit(1);
          if (v) actorName = `Sala ${v.nameRo}`;
        } else if (booking.artistId) {
          const [a] = await db
            .select({ nameRo: artists.nameRo })
            .from(artists)
            .where(eq(artists.id, booking.artistId))
            .limit(1);
          if (a) actorName = `Artistul ${a.nameRo}`;
        }

        for (const s of siblings) {
          if (s.id === booking.id) continue; // skip self
          // Find the owner userId of the sibling vendor
          let targetUserId: string | null = null;
          let targetDashboardUrl = "/dashboard/rezervari";
          if (s.artistId) {
            const [a] = await db
              .select({ userId: artists.userId })
              .from(artists)
              .where(eq(artists.id, s.artistId))
              .limit(1);
            targetUserId = a?.userId ?? null;
          } else if (s.venueId) {
            const [v] = await db
              .select({ userId: venues.userId })
              .from(venues)
              .where(eq(venues.id, s.venueId))
              .limit(1);
            targetUserId = v?.userId ?? null;
            targetDashboardUrl = "/dashboard/sala/rezervari";
          }
          if (!targetUserId) continue;
          await dispatchNotification({
            userId: targetUserId,
            type: "booking_status_changed",
            title: `${actorName} s-a confirmat pentru evenimentul tău`,
            message: `Pe ${booking.eventDate}${booking.eventType ? ` · ${booking.eventType}` : ""}`,
            actionUrl: targetDashboardUrl,
          });
        }
      } catch (err) {
        console.error("[cross-notify] failed:", err);
      }
    })();
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

    // If the booking had already been accepted, remove the source="booking"
    // block from whichever calendar it targeted.
    if (booking.status === "accepted" && booking.eventDate) {
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

    // Same cleanup as reject: release the calendar block.
    if (
      (booking.status === "accepted" || booking.status === "confirmed_by_client") &&
      booking.eventDate
    ) {
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
    void (async () => {
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
    })();
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
  void (async () => {
    try {
      if (action === "accept" || action === "reject") {
        // Look up the vendor — name + contact info + owner userId
        let vendorName = "Partenerul";
        let vendorPhone: string | null = null;
        let vendorEmail: string | null = null;
        let vendorUserId: string | null = null;
        if (booking.artistId) {
          const [artist] = await db
            .select({
              userId: artists.userId,
              nameRo: artists.nameRo,
              phone: artists.phone,
              email: artists.email,
            })
            .from(artists)
            .where(eq(artists.id, booking.artistId))
            .limit(1);
          if (artist) {
            vendorName = artist.nameRo;
            vendorPhone = artist.phone;
            vendorEmail = artist.email;
            vendorUserId = artist.userId;
          }
        } else if (booking.venueId) {
          const { venues } = await import("@/lib/db/schema");
          const [venue] = await db
            .select({
              userId: venues.userId,
              nameRo: venues.nameRo,
              phone: venues.phone,
              email: venues.email,
            })
            .from(venues)
            .where(eq(venues.id, booking.venueId))
            .limit(1);
          if (venue) {
            vendorName = venue.nameRo;
            vendorPhone = venue.phone;
            vendorEmail = venue.email;
            vendorUserId = venue.userId;
          }
        }
        const { notificationEmail } = await import("@/lib/email/templates/notification-email");

        const timePart = booking.startTime
          ? `<br>Ora: ${booking.startTime}${booking.endTime ? ` – ${booking.endTime}` : ""}`
          : "";

        // On accept the booking is auto-finalized — include partner
        // contact info so the client can reach out directly.
        const contactBlock = action === "accept"
          ? `<br><br><strong>Date de contact ${vendorName}:</strong>${
              vendorPhone ? `<br>📞 ${vendorPhone}` : ""
            }${vendorEmail ? `<br>📧 ${vendorEmail}` : ""}`
          : "";

        const emailBody = action === "accept"
          ? `<strong>${vendorName}</strong> a confirmat rezervarea ta pentru ${booking.eventDate}.${timePart}${reply ? `<br><br>Mesaj: <em>${reply}</em>` : ""}${contactBlock}`
          : `<strong>${vendorName}</strong> a răspuns la cererea ta pentru ${booking.eventDate}.${timePart}${reply ? `<br><br>Motivul: <em>${reply}</em>` : ""}`;

        // Notify the CLIENT
        if (booking.clientUserId) {
          const clientUser = await db
            .select({ email: users.email })
            .from(users)
            .where(eq(users.id, booking.clientUserId))
            .limit(1);
          await dispatchNotification({
            userId: booking.clientUserId,
            type: "booking_status_changed",
            title:
              action === "accept"
                ? `Rezervarea ta la ${vendorName} este confirmată!`
                : `Răspuns la cererea ta către ${vendorName}`,
            message:
              action === "accept"
                ? vendorPhone
                  ? `Date contact: ${vendorPhone}${vendorEmail ? ` · ${vendorEmail}` : ""}`
                  : reply ?? undefined
                : reply ?? undefined,
            actionUrl: "/cabinet/rezervari",
            email: clientUser[0]?.email ?? undefined,
            emailSubject: action === "accept"
              ? `🎉 Rezervarea cu ${vendorName} este confirmată!`
              : `Răspuns la cererea ta — ${vendorName}`,
            emailHtml: notificationEmail({
              title: action === "accept" ? "Rezervare Confirmată!" : "Răspuns la Cererea Ta",
              message: emailBody,
              ctaUrl: "https://epetrecere.md/cabinet/rezervari",
              ctaText: "Vezi detalii →",
              emoji: action === "accept" ? "🎉" : "📩",
            }),
          });
          // Mobile push for the client — deep-links to the booking
          // detail on the client side so they can confirm + chat.
          const pushKind: PushKind =
            action === "accept"
              ? "booking_accepted"
              : action === "reject"
                ? "booking_rejected"
                : "booking_price_proposed";
          void sendPushToUser({
            userId: booking.clientUserId,
            title:
              action === "accept"
                ? `${vendorName} a confirmat`
                : action === "reject"
                  ? `${vendorName} a refuzat`
                  : `${vendorName} a propus un preț`,
            body:
              action === "accept"
                ? `Rezervarea ta pe ${booking.eventDate} este acceptată. Confirmă din aplicație.`
                : action === "reject"
                  ? reply || "Vezi detaliile în aplicație."
                  : `Vezi noua propunere și acceptă sau contraoferă.`,
            data: { kind: pushKind, id: Number(id) },
          });
        } else if (booking.clientEmail) {
          const { sendEmail } = await import("@/lib/email/send");
          await sendEmail({
            to: booking.clientEmail,
            subject: action === "accept"
              ? `🎉 Rezervarea cu ${vendorName} este confirmată!`
              : `Răspuns la cererea ta — ${vendorName}`,
            html: notificationEmail({
              title: action === "accept" ? "Rezervare Confirmată!" : "Răspuns la Cererea Ta",
              message: emailBody,
              ctaUrl: "https://epetrecere.md",
              ctaText: "Vizitează ePetrecere.md →",
              emoji: action === "accept" ? "🎉" : "📩",
            }),
          });
        }

        // On accept also notify the PARTNER with the client's contact info.
        if (action === "accept" && vendorUserId) {
          const clientContactBlock = `<br><br><strong>Date de contact client:</strong><br>👤 ${booking.clientName}${
            booking.clientPhone ? `<br>📞 ${booking.clientPhone}` : ""
          }${booking.clientEmail ? `<br>📧 ${booking.clientEmail}` : ""}`;
          await dispatchNotification({
            userId: vendorUserId,
            type: "booking_status_changed",
            title: `Rezervare confirmată cu ${booking.clientName}`,
            message: booking.clientPhone
              ? `Date contact: ${booking.clientPhone}${booking.clientEmail ? ` · ${booking.clientEmail}` : ""}`
              : undefined,
            actionUrl: "/dashboard/rezervari",
            email: vendorEmail ?? undefined,
            emailSubject: `🎉 Rezervare confirmată cu ${booking.clientName}`,
            emailHtml: notificationEmail({
              title: "Rezervare confirmată!",
              message: `Ai confirmat rezervarea cu <strong>${booking.clientName}</strong> pentru ${booking.eventDate}.${timePart}${clientContactBlock}`,
              ctaUrl: "https://epetrecere.md/dashboard/rezervari",
              ctaText: "Vezi rezervarea →",
              emoji: "🎉",
            }),
          });
        }
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
      } else if (action === "client_confirm") {
        // Resolve the vendor — artist or venue
        let artist: { userId: string | null; nameRo: string; slug: string; email: string | null } | null = null;
        if (booking.artistId) {
          const [a] = await db
            .select({ userId: artists.userId, nameRo: artists.nameRo, slug: artists.slug, email: artists.email })
            .from(artists)
            .where(eq(artists.id, booking.artistId))
            .limit(1);
          artist = a ?? null;
        } else if (booking.venueId) {
          const { venues } = await import("@/lib/db/schema");
          const [v] = await db
            .select({ userId: venues.userId, nameRo: venues.nameRo, slug: venues.slug, email: venues.email })
            .from(venues)
            .where(eq(venues.id, booking.venueId))
            .limit(1);
          artist = v ?? null;
        }
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

  // Email is already sent via dispatchNotification above (emailHtml param).
  // No separate sendEmail needed — avoids duplicate emails.

  return NextResponse.json({ success: true });
}
