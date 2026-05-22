import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { bookingRequests, offerRequests, artists, venues } from "@/lib/db/schema";
import { users } from "@/lib/db/schema";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/admin";
import { rateLimit } from "@/lib/rate-limit";
import { dispatchNotification, dispatchToAdmins } from "@/lib/notifications/dispatch";
import { sendPushToUser } from "@/lib/push/expo";
import { sendEmail } from "@/lib/email/send";
import { bookingRequestNewEmail } from "@/lib/email/templates/booking-request-new";

const bookingSchema = z.object({
  /** Either artistId or venueId must be set. */
  artistId: z.number().optional(),
  venueId: z.number().optional(),
  clientName: z.string().min(2),
  clientPhone: z.string().min(6),
  clientEmail: z.string().optional(),
  eventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "eventDate must be YYYY-MM-DD")
    .refine((d) => {
      // Reject dates strictly before today (event can still be booked for "today").
      // Compared against UTC date so a client in +3 doesn't accidentally reject
      // today-in-their-zone.
      const today = new Date();
      const todayStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;
      return d >= todayStr;
    }, "Event date cannot be in the past"),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  eventType: z.string().optional(),
  guestCount: z.number().optional(),
  message: z.string().optional(),
  /** Optional — when the client sends the request from inside an event
   *  plan we link the booking so its agreed price flows into the budget. */
  eventPlanId: z.number().int().positive().optional(),
  /** Optional — price in EUR the client picked (via artist package). */
  agreedPrice: z.number().int().min(0).optional(),
  /** Optional — artist package id selected by the client. */
  packageId: z.number().int().positive().optional(),
  /** Optional — duration in hours (from the selected package). */
  durationHours: z.number().positive().optional(),
});

// GET booking requests — requires auth; scoped to caller's own data.
// Admins can query any artist_id or client_email. Regular users can only
// query bookings for their own artist profile or their own email.
export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Opportunistic expiry — every read flips any pending booking past
  // its response window (24h artists / 72h venues). The dedicated
  // cron also does this hourly, but doing it on read means a user
  // refreshing their dashboard never sees a stale blocker. No-op
  // when nothing matches.
  void (async () => {
    try {
      await db
        .update(bookingRequests)
        .set({ status: "expired", updatedAt: new Date() })
        .where(
          and(
            eq(bookingRequests.status, "pending"),
            sql`(
              (${bookingRequests.artistId} IS NOT NULL
                AND ${bookingRequests.createdAt} < NOW() - INTERVAL '24 hours')
              OR
              (${bookingRequests.venueId} IS NOT NULL
                AND ${bookingRequests.createdAt} < NOW() - INTERVAL '72 hours')
            )`,
          ),
        );
    } catch (err) {
      console.error("[bookings.GET] expire sweep failed:", err);
    }
  })();

  const artistId = req.nextUrl.searchParams.get("artist_id");
  const clientEmail = req.nextUrl.searchParams.get("client_email");
  const eventPlanId = req.nextUrl.searchParams.get("event_plan_id");

  if (!artistId && !clientEmail && !eventPlanId) {
    return NextResponse.json(
      { error: "artist_id, client_email or event_plan_id required" },
      { status: 400 },
    );
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

    // If querying by event_plan_id only, verify ownership
    if (eventPlanId && !artistId && !clientEmail) {
      const { eventPlans } = await import("@/lib/db/schema");
      const [plan] = await db
        .select({ userId: eventPlans.userId })
        .from(eventPlans)
        .where(eq(eventPlans.id, Number(eventPlanId)))
        .limit(1);
      if (!plan || plan.userId !== appUser.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }

  const conditions = [];
  if (artistId) conditions.push(eq(bookingRequests.artistId, Number(artistId)));
  if (clientEmail) conditions.push(eq(bookingRequests.clientEmail, clientEmail));
  if (eventPlanId) {
    conditions.push(eq(bookingRequests.eventPlanId, Number(eventPlanId)));
  }

  const result = await db
    .select({
      id: bookingRequests.id,
      artistId: bookingRequests.artistId,
      venueId: bookingRequests.venueId,
      eventPlanId: bookingRequests.eventPlanId,
      clientUserId: bookingRequests.clientUserId,
      clientName: bookingRequests.clientName,
      clientPhone: bookingRequests.clientPhone,
      clientEmail: bookingRequests.clientEmail,
      eventDate: bookingRequests.eventDate,
      startTime: bookingRequests.startTime,
      endTime: bookingRequests.endTime,
      eventType: bookingRequests.eventType,
      guestCount: bookingRequests.guestCount,
      message: bookingRequests.message,
      status: bookingRequests.status,
      agreedPrice: bookingRequests.agreedPrice,
      paidStatus: bookingRequests.paidStatus,
      priceOffers: bookingRequests.priceOffers,
      artistReply: bookingRequests.artistReply,
      adminNotes: bookingRequests.adminNotes,
      adminSeen: bookingRequests.adminSeen,
      source: bookingRequests.source,
      createdAt: bookingRequests.createdAt,
      updatedAt: bookingRequests.updatedAt,
      artistName: artists.nameRo,
      artistSlug: artists.slug,
      artistCategoryIds: artists.categoryIds,
      venueName: venues.nameRo,
      venueSlug: venues.slug,
    })
    .from(bookingRequests)
    .leftJoin(artists, eq(artists.id, bookingRequests.artistId))
    .leftJoin(venues, eq(venues.id, bookingRequests.venueId))
    .where(and(...conditions))
    .orderBy(desc(bookingRequests.createdAt))
    .limit(50);

  // Resolve artist category name(s) — clients want to see "Cantăreți"
  // next to the artist so they remember which slot the booking fills.
  // Fetched in one query to keep the read cheap.
  const allCatIds = Array.from(
    new Set(
      result
        .flatMap((r) => r.artistCategoryIds ?? [])
        .filter((n): n is number => typeof n === "number"),
    ),
  );
  const catNameById = new Map<number, string>();
  if (allCatIds.length > 0) {
    const { categories: categoriesTable } = await import("@/lib/db/schema");
    const cats = await db
      .select({ id: categoriesTable.id, nameRo: categoriesTable.nameRo })
      .from(categoriesTable)
      .where(inArray(categoriesTable.id, allCatIds));
    for (const c of cats) catNameById.set(c.id, c.nameRo);
  }

  // Privacy: hide client contact from the artist while the booking is
  // still tentative. Once the partner accepts (status = "accepted" or
  // "confirmed_by_client"), both sides need direct contact to coordinate
  // the actual gig — chat alone isn't enough for last-minute logistics.
  // Per-row check below; this flag only gates the *default* behavior.
  const SHARED_CONTACT_STATUSES = new Set([
    "accepted",
    "confirmed_by_client",
    "completed",
  ]);
  const redactByDefault = !isAdmin && !!artistId;

  // Phase 6 — enrich artist bookings with the venue on the same event plan
  // (if any). Lets the artist see "Eveniment la Sala X" on their rezervări.
  const planIds = Array.from(
    new Set(result.map((r) => r.eventPlanId).filter((x): x is number => x !== null)),
  );
  const planToVenue = new Map<number, { id: number; nameRo: string; slug: string }>();
  if (planIds.length > 0 && artistId) {
    const venueBookings = await db
      .select({
        eventPlanId: bookingRequests.eventPlanId,
        venueId: venues.id,
        venueName: venues.nameRo,
        venueSlug: venues.slug,
      })
      .from(bookingRequests)
      .innerJoin(venues, eq(venues.id, bookingRequests.venueId))
      .where(
        and(
          inArray(
            bookingRequests.eventPlanId,
            planIds as [number, ...number[]],
          ),
        ),
      );
    for (const vb of venueBookings) {
      if (vb.eventPlanId && vb.venueId) {
        planToVenue.set(vb.eventPlanId, {
          id: vb.venueId,
          nameRo: vb.venueName,
          slug: vb.venueSlug,
        });
      }
    }
  }

  const payload = result.map((row) => {
    const showContact =
      !redactByDefault || SHARED_CONTACT_STATUSES.has(row.status);
    const cats =
      (row.artistCategoryIds ?? [])
        .map((id) => catNameById.get(id))
        .filter((n): n is string => Boolean(n));
    return {
      ...row,
      clientPhone: showContact ? row.clientPhone : null,
      clientEmail: showContact ? row.clientEmail : null,
      categoryNames: cats,
      linkedVenue: row.eventPlanId
        ? planToVenue.get(row.eventPlanId) ?? null
        : null,
    };
  });

  return NextResponse.json(payload);
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
  if (!parsed.data.artistId && !parsed.data.venueId) {
    return NextResponse.json(
      { error: "artistId or venueId required" },
      { status: 400 },
    );
  }

  // Resolve the authenticated user so we can link booking to their account.
  // Also check that they aren't a partner — a vendor account creating
  // booking requests is almost certainly an accidental cross-role use.
  const { userId: clerkId } = await auth();
  let clientUserId: string | undefined;
  if (clerkId) {
    const [appUser] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);
    if (appUser) {
      // Admins always pass through. For everyone else, reject if they
      // own an artist or venue row, or hold the artist role.
      const isAdmin = appUser.role === "admin" || appUser.role === "super_admin";
      if (!isAdmin) {
        const [artistOwn] = await db
          .select({ id: artists.id })
          .from(artists)
          .where(eq(artists.userId, appUser.id))
          .limit(1);
        const [venueOwn] = artistOwn
          ? [null]
          : await db
              .select({ id: venues.id })
              .from(venues)
              .where(eq(venues.userId, appUser.id))
              .limit(1);
        if (artistOwn || venueOwn || appUser.role === "artist") {
          return NextResponse.json(
            {
              error:
                "Conturile de partener nu pot trimite cereri de rezervare. Folosește un cont de client.",
            },
            { status: 403 },
          );
        }
      }
      clientUserId = appUser.id;
    }
  }

  // Create booking request — keep the eventPlanId through so in-plan
  // requests surface in the dashboard "Rezervări Artiști" tab.
  // Extract fields that aren't columns of `booking_requests` so we can
  // pass them separately to the insert.
  const {
    eventPlanId,
    agreedPrice,
    packageId: _packageId,
    durationHours: _durationHours,
    ...bookingBase
  } = parsed.data;

  // One active request at a time per category per plan. The artist gets
  // 24h to accept/reject; while their request is pending, the client
  // can't shop the same category to another artist. After accept the
  // booking takes the slot indefinitely; after reject/cancel/expire
  // the category slot frees up so the client can try someone else.
  if (eventPlanId && parsed.data.artistId) {
    const [targetArtist] = await db
      .select({ categoryIds: artists.categoryIds })
      .from(artists)
      .where(eq(artists.id, parsed.data.artistId))
      .limit(1);
    const targetCategoryIds = targetArtist?.categoryIds ?? [];

    if (targetCategoryIds.length > 0) {
      const existingBookings = await db
        .select({
          artistId: bookingRequests.artistId,
          status: bookingRequests.status,
          categoryIds: artists.categoryIds,
          artistName: artists.nameRo,
        })
        .from(bookingRequests)
        .leftJoin(artists, eq(artists.id, bookingRequests.artistId))
        .where(eq(bookingRequests.eventPlanId, eventPlanId));

      // Prevent duplicate booking for the same artist on same plan.
      // If the previous one was declined/cancelled/expired, surface a
      // clearer message so the client knows to pick another artist.
      const priorBooking = existingBookings.find(
        (b) => b.artistId === parsed.data.artistId,
      );
      if (priorBooking) {
        const declined =
          priorBooking.status === "rejected" ||
          priorBooking.status === "cancelled" ||
          priorBooking.status === "expired";
        return NextResponse.json(
          {
            error: declined
              ? "Acest artist a refuzat deja cererea ta pentru acest eveniment. Te rugăm să alegi un alt artist."
              : "Ai trimis deja o cerere către acest artist pentru acest eveniment.",
          },
          { status: 409 },
        );
      }

      // Block if any artist in any of the target categories already
      // has an ACTIVE (pending/accepted/confirmed/completed) booking on
      // this plan. Pending blocks because we want a single open ask
      // per category — no spamming five artists at once.
      const ACTIVE_STATUSES = new Set([
        "pending",
        "accepted",
        "confirmed_by_client",
        "completed",
      ]);
      for (const catId of targetCategoryIds) {
        const blocker = existingBookings.find(
          (b) =>
            ACTIVE_STATUSES.has(b.status) &&
            (b.categoryIds ?? []).includes(catId),
        );
        if (blocker) {
          return NextResponse.json(
            {
              error:
                blocker.status === "pending"
                  ? `Așteaptă răspunsul lui ${blocker.artistName ?? "artist"} (până la 24h) înainte de a trimite altă cerere în această categorie.`
                  : `Ai deja un artist confirmat (${blocker.artistName ?? "artist"}) în această categorie pentru evenimentul tău.`,
            },
            { status: 409 },
          );
        }
      }
    }
  }

  // Venue side of the same constraint — only ONE active venue
  // request per plan. Until the venue accepts/rejects/expires, the
  // client can't shop another venue. Same status semantics as artists
  // (pending/accepted/confirmed/completed = active; rejected /
  // cancelled / expired free up the slot).
  if (eventPlanId && parsed.data.venueId) {
    const existingVenueBookings = await db
      .select({
        venueId: bookingRequests.venueId,
        status: bookingRequests.status,
        venueName: venues.nameRo,
      })
      .from(bookingRequests)
      .leftJoin(venues, eq(venues.id, bookingRequests.venueId))
      .where(eq(bookingRequests.eventPlanId, eventPlanId));

    // Reject duplicate venue request.
    const priorVenue = existingVenueBookings.find(
      (b) => b.venueId === parsed.data.venueId,
    );
    if (priorVenue) {
      const declined =
        priorVenue.status === "rejected" ||
        priorVenue.status === "cancelled" ||
        priorVenue.status === "expired";
      return NextResponse.json(
        {
          error: declined
            ? "Această sală a refuzat deja cererea ta pentru acest eveniment. Te rugăm să alegi o altă sală."
            : "Ai trimis deja o cerere la această sală pentru acest eveniment.",
        },
        { status: 409 },
      );
    }

    // Block while another venue request is still active.
    const ACTIVE_STATUSES = new Set([
      "pending",
      "accepted",
      "confirmed_by_client",
      "completed",
    ]);
    const venueBlocker = existingVenueBookings.find(
      (b) => b.venueId != null && ACTIVE_STATUSES.has(b.status),
    );
    if (venueBlocker) {
      return NextResponse.json(
        {
          error:
            venueBlocker.status === "pending"
              ? `Așteaptă răspunsul de la ${venueBlocker.venueName ?? "sală"} (până la 72h) înainte de a trimite altă cerere la o sală.`
              : `Ai deja o sală confirmată (${venueBlocker.venueName ?? "sală"}) pentru evenimentul tău.`,
        },
        { status: 409 },
      );
    }
  }

  // Artist availability check — working hours + conflicts.
  if (parsed.data.artistId) {
    const { checkArtistAvailability, formatConflictMessage } = await import(
      "@/lib/booking/availability"
    );
    const result = await checkArtistAvailability({
      artistId: parsed.data.artistId,
      eventDate: parsed.data.eventDate,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
    });
    if (!result.available) {
      return NextResponse.json(
        {
          error: formatConflictMessage(result),
          conflict: result.conflict,
          outsideWorkingHours: result.outsideWorkingHours,
          workingHours: result.workingHours,
        },
        { status: 409 },
      );
    }
  }

  // Venue availability check — working hours + conflicts.
  if (parsed.data.venueId) {
    const { checkVenueAvailability, formatConflictMessage } = await import(
      "@/lib/booking/availability"
    );
    const result = await checkVenueAvailability({
      venueId: parsed.data.venueId,
      eventDate: parsed.data.eventDate,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
    });
    if (!result.available) {
      return NextResponse.json(
        {
          error: formatConflictMessage(result),
          conflict: result.conflict,
          outsideWorkingHours: result.outsideWorkingHours,
          workingHours: result.workingHours,
        },
        { status: 409 },
      );
    }
  }

  const [booking] = await db.insert(bookingRequests).values({
    ...bookingBase,
    eventPlanId: eventPlanId ?? null,
    clientUserId: clientUserId ?? null,
    agreedPrice: agreedPrice ?? null,
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

  // M5 — fire-and-forget notifications. Looks up the vendor owner (artist
  // or venue) so the dashboard bell lights up immediately.
  void (async () => {
    try {
      let artist: {
        userId: string | null;
        nameRo: string;
        slug: string;
        email: string | null;
        autoReplyEnabled: boolean;
        autoReplyMessage: string | null;
      } | null = null;
      let dashboardUrl = "/dashboard/rezervari";

      if (parsed.data.artistId) {
        const [a] = await db
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
        artist = a ?? null;
      } else if (parsed.data.venueId) {
        const { venues } = await import("@/lib/db/schema");
        const [v] = await db
          .select({
            userId: venues.userId,
            nameRo: venues.nameRo,
            slug: venues.slug,
            email: venues.email,
            autoReplyEnabled: venues.autoReplyEnabled,
            autoReplyMessage: venues.autoReplyMessage,
          })
          .from(venues)
          .where(eq(venues.id, parsed.data.venueId))
          .limit(1);
        if (v) {
          artist = {
            userId: v.userId,
            nameRo: v.nameRo,
            slug: v.slug,
            email: v.email,
            autoReplyEnabled: v.autoReplyEnabled,
            autoReplyMessage: v.autoReplyMessage,
          };
          dashboardUrl = "/dashboard/sala/rezervari";
        }
      }

      if (artist?.userId) {
        const timePart = parsed.data.startTime
          ? ` · ${parsed.data.startTime}${parsed.data.endTime ? `–${parsed.data.endTime}` : ""}`
          : "";
        await dispatchNotification({
          userId: artist.userId,
          type: "booking_request_new",
          title: "Cerere nouă de rezervare",
          message: `${parsed.data.clientName} — ${parsed.data.eventType ?? "Eveniment"} · ${parsed.data.eventDate}${timePart}`,
          actionUrl: dashboardUrl,
        });
        // Mobile push (fire-and-forget). The mobile app's push tap
        // handler reads `data.kind` and routes to the inbox with the
        // booking expanded.
        void sendPushToUser({
          userId: artist.userId,
          title: "Cerere nouă de rezervare",
          body: `${parsed.data.clientName} — ${parsed.data.eventType ?? "Eveniment"} pe ${parsed.data.eventDate}`,
          data: { kind: "booking_new", id: booking.id },
        });

        // Spec 2.8 — pending-conflict alert: if 2+ pending requests now
        // exist on the same (venue/artist, date), flag it so the vendor
        // knows to triage quickly. We only fire this extra notification
        // when the new request itself is the second (or later) competitor.
        try {
          const pendingCond = [
            eq(bookingRequests.status, "pending"),
            eq(bookingRequests.eventDate, parsed.data.eventDate),
          ];
          if (parsed.data.venueId) {
            pendingCond.push(eq(bookingRequests.venueId, parsed.data.venueId));
          } else if (parsed.data.artistId) {
            pendingCond.push(
              eq(bookingRequests.artistId, parsed.data.artistId),
            );
          }
          const siblings = await db
            .select({
              id: bookingRequests.id,
              clientName: bookingRequests.clientName,
            })
            .from(bookingRequests)
            .where(and(...pendingCond));
          // Ignore the just-inserted request — compare other pending ones.
          const others = siblings.filter((s) => s.id !== booking.id);
          if (others.length > 0) {
            // Also check if the date is already blocked by an accepted/confirmed
            // booking — that's a harder conflict.
            const confirmedCond = [
              inArray(bookingRequests.status, [
                "accepted",
                "confirmed_by_client",
              ]),
              eq(bookingRequests.eventDate, parsed.data.eventDate),
            ];
            if (parsed.data.venueId) {
              confirmedCond.push(
                eq(bookingRequests.venueId, parsed.data.venueId),
              );
            } else if (parsed.data.artistId) {
              confirmedCond.push(
                eq(bookingRequests.artistId, parsed.data.artistId),
              );
            }
            const confirmed = await db
              .select({ id: bookingRequests.id })
              .from(bookingRequests)
              .where(and(...confirmedCond));

            const totalCompeting = others.length + confirmed.length;
            await dispatchNotification({
              userId: artist.userId,
              type: "booking_conflict",
              title: `⚠️ Conflict potențial pe ${parsed.data.eventDate}`,
              message:
                confirmed.length > 0
                  ? `Ai deja o rezervare confirmată pe această dată + ${others.length + 1} cereri tentative.`
                  : `${totalCompeting + 1} cereri tentative pe aceeași dată. Acceptă pe cea mai potrivită.`,
              actionUrl: `${dashboardUrl}?date=${parsed.data.eventDate}`,
            });

            // Loop in admins too — they mediate conflicts between vendor and clients.
            void dispatchToAdmins({
              type: "admin_lead_conflict",
              title: "Conflict potențial la rezervare",
              message: `${artist.nameRo ?? "Vendor"} — data ${parsed.data.eventDate} are ${totalCompeting + 1} cereri.`,
              actionUrl: "/admin/cereri-oferte",
            }).catch(() => {
              /* non-blocking */
            });
          }
        } catch (err) {
          console.error("[booking conflict] check failed", err);
        }
      }
      const { notificationEmail } = await import("@/lib/email/templates/notification-email");
      await dispatchToAdmins({
        type: "admin_lead_new",
        title: "Cerere nouă în CRM",
        message: `${parsed.data.clientName} — ${artist?.nameRo ?? "artist"}`,
        actionUrl: "/admin/cereri-oferte",
        emailSubject: `🔔 Cerere nouă: ${parsed.data.clientName} → ${artist?.nameRo ?? "artist"}`,
        emailHtml: notificationEmail({
          title: "Cerere Nouă de Rezervare",
          message: `<strong>${parsed.data.clientName}</strong> a trimis o cerere pentru <strong>${artist?.nameRo ?? "artist"}</strong>.<br>Eveniment: ${parsed.data.eventType ?? "Nespecificat"} · Data: ${parsed.data.eventDate}${parsed.data.startTime ? ` · Ora: ${parsed.data.startTime}${parsed.data.endTime ? `–${parsed.data.endTime}` : ""}` : ""}`,
          ctaUrl: "https://epetrecere.md/admin/cereri-oferte",
          ctaText: "Deschide în CRM →",
          emoji: "🔔",
        }),
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
              startTime: parsed.data.startTime ?? null,
              endTime: parsed.data.endTime ?? null,
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
