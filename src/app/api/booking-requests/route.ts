import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod/v4";
import { BookingRequestCreateSchema } from "@epetrecere/shared";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { bookingRequests, artists, venues, venueHalls } from "@/lib/db/schema";
import { bookingHallNameSql } from "@/lib/booking/hall-display-sql";
import { users } from "@/lib/db/schema";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/admin";
import { rateLimit } from "@/lib/rate-limit";
import { redactContact } from "@/lib/privacy/contact-redaction";
import { bookingTextForViewer } from "@/lib/privacy/booking-text";
import { authorizeVenueAccess } from "@/lib/venue-access";
import { VenueAvailabilityError } from "@/lib/booking/venue-booking-write";
import { dispatchBookingCreationEffects } from "@/lib/booking/booking-create-effects";
import {
  BookingCreationActorNotFoundError,
  BookingCreationIdempotencyConflictError,
  EventPlanBookingWriteError,
} from "@/lib/booking/booking-request-write";
import {
  ArtistAvailabilityWriteError,
  BookingClientIdentityError,
  BookingEventDateWriteError,
  BookingPartnerAccountError,
  BookingTargetUnavailableError,
  createClientBookingRequest,
  PublicVenueScopeWriteError,
} from "@/lib/booking/client-booking-create";
import { PlanBookingConflictError } from "@/lib/booking/plan-booking-constraints";
import {
  InvalidJsonRequestError,
  readBoundedJson,
  RequestBodyTooLargeError,
} from "@/lib/http/read-bounded-json";
import { bookingContractClientMatches } from "@/lib/booking/contract-data";

type BookingCreateRow = typeof bookingRequests.$inferSelect;

/**
 * POST never returns internal idempotency material or later private workflow
 * fields (admin notes/signatures). Keep this allow-list explicit so a future
 * schema column cannot silently become public through `.returning()`.
 */
function bookingCreateResponse(row: BookingCreateRow) {
  return {
    id: row.id,
    artistId: row.artistId,
    venueId: row.venueId,
    hallId: row.hallId,
    reservationScope: row.reservationScope,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    timezone: row.timezone,
    eventPlanId: row.eventPlanId,
    clientName: row.clientName,
    clientPhone: row.clientPhone,
    clientEmail: row.clientEmail,
    eventDate: row.eventDate,
    startTime: row.startTime,
    endTime: row.endTime,
    eventType: row.eventType,
    guestCount: row.guestCount,
    message: row.message,
    status: row.status,
    agreedPrice: row.agreedPrice,
    paidStatus: row.paidStatus,
    source: row.source,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const bookingSchema = BookingRequestCreateSchema;
const BOOKING_REQUEST_MAX_BODY_BYTES = 16 * 1024;

// GET booking requests — requires auth; scoped to caller's own data.
// Admins can query any artist_id or client_email. Regular users can only
// query bookings for their own artist profile or their own email.
export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Opportunistic expiry — every read flips any pending booking past
  // its response window (24h artists / 72h venues). The dedicated
  // cron also does this hourly, but doing it on read means a user
  // refreshing their dashboard never sees a stale blocker. No-op
  // when nothing matches.
  after(async () => {
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
  });

  const artistId = req.nextUrl.searchParams.get("artist_id");
  const clientEmail = req.nextUrl.searchParams.get("client_email");
  const eventPlanId = req.nextUrl.searchParams.get("event_plan_id");
  const bookingId = req.nextUrl.searchParams.get("id");

  if (!artistId && !clientEmail && !eventPlanId && !bookingId) {
    return NextResponse.json(
      { error: "artist_id, client_email, event_plan_id or id required" },
      { status: 400 },
    );
  }

  // Check if the caller is admin — admins can query any data
  const admin = await requireAdmin();
  const isAdmin = admin.ok;
  let vendorViewer = false;

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
      vendorViewer = true;
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

    // Single-booking fetch by id — the caller must own it: either the client
    // (clientUserId / clientEmail) or the vendor (artist/venue owner).
    // Without this gate, any signed-in user could read another user's booking
    // + contact details.
    if (bookingId) {
      const [b] = await db
        .select({
          clientUserId: bookingRequests.clientUserId,
          clientEmail: bookingRequests.clientEmail,
          artistId: bookingRequests.artistId,
          venueId: bookingRequests.venueId,
        })
        .from(bookingRequests)
        .where(eq(bookingRequests.id, Number(bookingId)))
        .limit(1);
      if (!b) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      // A durable clientUserId is authoritative. Legacy email ownership is
      // allowed only when the booking has no user FK and both normalized
      // addresses are non-empty; in particular, null === null is never proof
      // of ownership and an old matching email cannot override another user.
      let owns = bookingContractClientMatches(b, appUser);
      if (!owns && b.artistId) {
        const [a] = await db
          .select({ userId: artists.userId })
          .from(artists)
          .where(eq(artists.id, b.artistId))
          .limit(1);
        owns = a?.userId === appUser.id;
        if (owns) vendorViewer = true;
      }
      if (!owns && b.venueId) {
        const venueAccess = await authorizeVenueAccess(
          { id: appUser.id, role: "user", isGlobalAdmin: false },
          b.venueId,
          "staff",
        );
        owns = venueAccess.ok;
        if (venueAccess.ok) vendorViewer = true;
      }
      if (!owns) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }

  // Manual calendar deletions keep a cancelled idempotency tombstone. Hide
  // only that technical row at SQL level so it cannot consume the 50-row
  // window; ordinary client/vendor cancellations remain visible history.
  const visibleBooking = sql<boolean>`NOT (
    ${bookingRequests.source} = 'manual'
    AND ${bookingRequests.status} = 'cancelled'
  )`;
  const conditions: SQL[] = [visibleBooking];
  if (artistId) conditions.push(eq(bookingRequests.artistId, Number(artistId)));
  if (clientEmail)
    conditions.push(eq(bookingRequests.clientEmail, clientEmail));
  if (eventPlanId) {
    conditions.push(eq(bookingRequests.eventPlanId, Number(eventPlanId)));
  }
  if (bookingId) conditions.push(eq(bookingRequests.id, Number(bookingId)));

  const result = await db
    .select({
      id: bookingRequests.id,
      artistId: bookingRequests.artistId,
      venueId: bookingRequests.venueId,
      hallId: bookingRequests.hallId,
      hallName: bookingHallNameSql(bookingRequests.commercialSnapshot, venueHalls.nameRo),
      reservationScope: bookingRequests.reservationScope,
      eventPlanId: bookingRequests.eventPlanId,
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
      clientConfirmedAt: bookingRequests.clientConfirmedAt,
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
    .leftJoin(venueHalls, and(eq(venueHalls.id, bookingRequests.hallId), eq(venueHalls.venueId, bookingRequests.venueId)))
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
  const SHARED_CONTACT_STATUSES = new Set(["confirmed_by_client", "completed"]);
  const redactByDefault = !isAdmin && vendorViewer;

  // Phase 6 — enrich artist bookings with the venue on the same event plan
  // (if any). Lets the artist see "Eveniment la Sala X" on their rezervări.
  const planIds = Array.from(
    new Set(
      result.map((r) => r.eventPlanId).filter((x): x is number => x !== null),
    ),
  );
  const planToVenue = new Map<
    number,
    { id: number; nameRo: string; slug: string }
  >();
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
          visibleBooking,
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
    const textShared = isAdmin || SHARED_CONTACT_STATUSES.has(row.status);
    const linkedVenue = row.eventPlanId
      ? (planToVenue.get(row.eventPlanId) ?? null)
      : null;
    const cats = (row.artistCategoryIds ?? [])
      .map((id) => catNameById.get(id))
      .filter((n): n is string => Boolean(n));
    return {
      ...row,
      clientName: bookingTextForViewer(row.clientName, showContact),
      artistName: bookingTextForViewer(row.artistName, textShared),
      venueName: bookingTextForViewer(row.venueName, textShared),
      hallName: bookingTextForViewer(row.hallName, textShared),
      eventType: bookingTextForViewer(row.eventType, textShared),
      adminNotes: isAdmin ? row.adminNotes : null,
      message: bookingTextForViewer(row.message, textShared),
      artistReply: bookingTextForViewer(row.artistReply, textShared),
      priceOffers: !textShared
        ? row.priceOffers?.map((o) => ({
            ...o,
            message: bookingTextForViewer(o.message, false),
          }))
        : row.priceOffers,
      clientPhone: showContact ? row.clientPhone : null,
      clientEmail: showContact ? row.clientEmail : null,
      categoryNames: cats,
      linkedVenue: linkedVenue
        ? {
            ...linkedVenue,
            nameRo: bookingTextForViewer(linkedVenue.nameRo, textShared),
          }
        : null,
    };
  });

  return NextResponse.json(payload);
}

// CREATE booking request
export async function POST(req: NextRequest) {
  const rawIdempotencyKey = req.headers.get("idempotency-key");
  let idempotencyKey: string | null = null;
  if (rawIdempotencyKey !== null) {
    const parsedKey = z.string().uuid().safeParse(rawIdempotencyKey);
    if (!parsedKey.success) {
      return NextResponse.json(
        {
          error: "Invalid Idempotency-Key; expected a UUID.",
          code: "INVALID_IDEMPOTENCY_KEY",
        },
        { status: 400 },
      );
    }
    // PostgreSQL's uuid type is case-insensitive. Normalize before deriving
    // the advisory-lock identity so equivalent UUID spellings share a lock.
    idempotencyKey = parsedKey.data.toLowerCase();
  }

  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const { success } = await rateLimit(`booking:${ip}`, 5, 60_000);
  if (!success)
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: unknown;
  try {
    body = await readBoundedJson(req, BOOKING_REQUEST_MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json(
        { error: "Request body too large", code: "REQUEST_BODY_TOO_LARGE" },
        { status: 413 },
      );
    }
    if (error instanceof InvalidJsonRequestError) {
      return NextResponse.json(
        { error: "Invalid JSON body", code: "INVALID_JSON" },
        { status: 400 },
      );
    }
    throw error;
  }
  const parsed = bookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }
  if (!parsed.data.artistId && !parsed.data.venueId) {
    return NextResponse.json(
      { error: "artistId or venueId required" },
      { status: 400 },
    );
  }
  const submittedData = {
    ...parsed.data,
    message: parsed.data.message
      ? redactContact(parsed.data.message)
      : parsed.data.message,
  };

  // Resolve the authenticated user so we can link booking to their account.
  // Also check that they aren't a partner — a vendor account creating
  // booking requests is almost certainly an accidental cross-role use.
  const { userId: clerkId } = await auth();
  let actorUserId: string | null = null;
  if (clerkId) {
    const [appUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);
    if (!appUser) {
      return NextResponse.json({ error: "User not found" }, { status: 403 });
    }

    actorUserId = appUser.id;
  }

  // A plan-linked request must be authenticated. Ownership is deliberately
  // checked again under the plan row lock in the write transaction below.
  if (submittedData.eventPlanId && !actorUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let creation: Awaited<ReturnType<typeof createClientBookingRequest>>;
  try {
    creation = await createClientBookingRequest({
      booking: submittedData,
      actorUserId,
      clerkId,
      idempotencyKey,
    });
  } catch (error) {
    if (error instanceof BookingCreationActorNotFoundError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    if (error instanceof BookingCreationIdempotencyConflictError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    if (error instanceof BookingClientIdentityError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    if (error instanceof BookingEventDateWriteError) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: [
            {
              code: "custom",
              path: ["eventDate"],
              message: error.message,
            },
          ],
        },
        { status: error.status },
      );
    }
    if (error instanceof BookingPartnerAccountError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    if (error instanceof BookingTargetUnavailableError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    if (error instanceof PublicVenueScopeWriteError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    if (error instanceof EventPlanBookingWriteError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    if (error instanceof PlanBookingConflictError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    if (error instanceof ArtistAvailabilityWriteError) {
      const { formatConflictMessage } =
        await import("@/lib/booking/availability");
      return NextResponse.json(
        {
          error: formatConflictMessage(error.result),
          conflict: error.result.conflict,
          outsideWorkingHours: error.result.outsideWorkingHours,
          workingHours: error.result.workingHours,
        },
        { status: 409 },
      );
    }
    if (error instanceof VenueAvailabilityError) {
      const payload: Record<string, unknown> = {
        error: error.result.message || error.result.code,
        code: error.result.code,
      };
      if (error.result.code === "HALL_REQUIRED") payload.code = "HALL_REQUIRED";
      return NextResponse.json(payload, { status: error.status });
    }
    throw error;
  }

  const booking = creation.booking;

  // The durable coordinator was committed atomically by the shared writer.
  // Run the fast path for creates and replays alike: replay safely pulls a
  // failed/pending row forward while the outbox lease prevents duplication.
  after(() => dispatchBookingCreationEffects(creation));

  const response = NextResponse.json(bookingCreateResponse(booking), {
    status: creation.created ? 201 : 200,
  });
  if (!creation.created) response.headers.set("Idempotency-Replayed", "true");
  return response;
}
