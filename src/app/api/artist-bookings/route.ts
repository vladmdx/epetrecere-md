// Manual bookings created directly by an artist from their calendar.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { and, eq, exists } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  artists,
  artistPackages,
  bookingRequests,
  calendarEvents,
  users,
} from "@/lib/db/schema";
import {
  acquireArtistAvailabilityLocks,
  acquireBookingCreateIdempotencyLock,
} from "@/lib/booking/advisory-locks";
import {
  type BookingCreationActor,
  BookingCreationActorNotFoundError,
  BookingCreationIdempotencyConflictError,
  type BookingRequestWriteTx,
  lockBookingCreationActor,
} from "@/lib/booking/booking-request-write";
import {
  manualArtistBookingPayloadHash,
  manualArtistBookingScopeHash,
} from "@/lib/booking/manual-artist-booking-idempotency";
import {
  checkArtistAvailability,
  formatConflictMessage,
  type AvailabilityResult,
} from "@/lib/booking/availability";

const realDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Invalid event date");

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:mm");

const schema = z
  .object({
    artistId: z.number().int().positive(),
    eventDate: realDate,
    startTime: hhmm,
    /** Either durationMinutes (explicit) or packageId is required. */
    durationMinutes: z.number().int().min(5).max(24 * 60).optional(),
    packageId: z.number().int().positive().optional(),
    price: z.number().int().min(0).nullable().optional(),
    note: z.string().max(500).optional(),
    eventType: z.string().max(60).optional(),
  })
  .refine(
    (value) => value.durationMinutes != null || value.packageId != null,
    { message: "durationMinutes or packageId is required" },
  );

type ManualBookingInput = z.infer<typeof schema>;
type BookingRow = typeof bookingRequests.$inferSelect;

class ManualBookingWriteError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ManualBookingWriteError";
    this.status = status;
    this.code = code;
  }
}

class ManualArtistAvailabilityError extends Error {
  readonly result: AvailabilityResult;

  constructor(result: AvailabilityResult) {
    super("artist_unavailable");
    this.name = "ManualArtistAvailabilityError";
    this.result = result;
  }
}

function addMinutes(hhmmValue: string, totalMinutes: number): string {
  const [hours, minutes] = hhmmValue.split(":").map(Number);
  const end = hours * 60 + minutes + totalMinutes;
  const endHours = Math.floor(end / 60) % 24;
  const endMinutes = end % 60;
  return `${String(endHours).padStart(2, "0")}:${String(endMinutes).padStart(2, "0")}`;
}

/** Keep creation-only server fields out of the public response. */
function bookingResponse(row: BookingRow) {
  return {
    id: row.id,
    artistId: row.artistId,
    venueId: row.venueId,
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

async function appUserIdForClerk(clerkId: string): Promise<string | null> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  return user?.id ?? null;
}

async function lockAuthorizedArtist(
  tx: BookingRequestWriteTx,
  artistId: number,
  actor: BookingCreationActor,
): Promise<void> {
  const [artist] = await tx
    .select({ id: artists.id, userId: artists.userId })
    .from(artists)
    .where(eq(artists.id, artistId))
    .for("share")
    .limit(1);
  const isAdmin = actor.role === "admin" || actor.role === "super_admin";
  if (!artist || (!isAdmin && artist.userId !== actor.id)) {
    throw new ManualBookingWriteError("Forbidden", 403);
  }
}

function writeErrorResponse(error: unknown): NextResponse | null {
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
  if (error instanceof ManualBookingWriteError) {
    return NextResponse.json(
      {
        error: error.message,
        ...(error.code ? { code: error.code } : {}),
      },
      { status: error.status },
    );
  }
  if (error instanceof ManualArtistAvailabilityError) {
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
  return null;
}

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
    idempotencyKey = parsedKey.data.toLowerCase();
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const actorUserId = await appUserIdForClerk(clerkId);
  if (!actorUserId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const input: ManualBookingInput = {
    ...parsed.data,
    note: parsed.data.note?.trim() || undefined,
    eventType: parsed.data.eventType?.trim() || undefined,
  };

  let result: { booking: BookingRow; created: boolean };
  try {
    result = await db.transaction(async (tx) => {
      // Global booking-create order: actor -> idempotency -> target ->
      // availability. Keeping it identical prevents lock inversions with the
      // public booking endpoint and account deletion.
      const actor = await lockBookingCreationActor(tx, actorUserId);
      const scopeHash = manualArtistBookingScopeHash(actor.id);
      const payloadHash = manualArtistBookingPayloadHash(input);

      if (idempotencyKey) {
        await acquireBookingCreateIdempotencyLock(
          tx,
          scopeHash,
          idempotencyKey,
        );
        const [existing] = await tx
          .select()
          .from(bookingRequests)
          .where(
            and(
              eq(bookingRequests.creationScopeHash, scopeHash),
              eq(bookingRequests.creationRequestId, idempotencyKey),
            ),
          )
          .limit(1);
        if (existing) {
          if (
            existing.creationPayloadHash !== payloadHash ||
            existing.source !== "manual"
          ) {
            throw new BookingCreationIdempotencyConflictError();
          }
          // A replay proves which write happened, not that the caller still
          // owns its target. Freeze and re-authorize the current artist owner
          // before returning any booking data after a profile transfer.
          await lockAuthorizedArtist(tx, input.artistId, actor);
          if (existing.status === "cancelled") {
            throw new ManualBookingWriteError(
              "Rezervarea anterioară a fost anulată. Trimite din nou pentru a crea o rezervare nouă.",
              410,
              "MANUAL_BOOKING_CANCELLED",
            );
          }
          return { booking: existing, created: false };
        }
      }

      // Freeze the target owner while the authorization decision and both
      // inserts commit. Admins still require a real artist target.
      await lockAuthorizedArtist(tx, input.artistId, actor);

      let durationMinutes = input.durationMinutes;
      let price = input.price ?? null;
      if (input.packageId) {
        const [pkg] = await tx
          .select({
            durationHours: artistPackages.durationHours,
            durationMinutes: artistPackages.durationMinutes,
            price: artistPackages.price,
          })
          .from(artistPackages)
          .where(
            and(
              eq(artistPackages.id, input.packageId),
              eq(artistPackages.artistId, input.artistId),
            ),
          )
          .for("share")
          .limit(1);
        if (!pkg) {
          throw new ManualBookingWriteError("Invalid package", 400);
        }
        if (durationMinutes == null) {
          durationMinutes =
            Math.round((pkg.durationHours ?? 0) * 60) +
            (pkg.durationMinutes ?? 0);
        }
        if (price == null) price = pkg.price;
      }

      if (
        durationMinutes == null ||
        !Number.isSafeInteger(durationMinutes) ||
        durationMinutes < 5 ||
        durationMinutes > 24 * 60
      ) {
        throw new ManualBookingWriteError(
          "Durata trebuie să fie între 5 minute și 24 de ore",
          400,
        );
      }
      const endTime = addMinutes(input.startTime, durationMinutes);

      await acquireArtistAvailabilityLocks(
        tx,
        input.artistId,
        input.eventDate,
      );
      const executor = tx as unknown as typeof db;
      const availability = await checkArtistAvailability({
        artistId: input.artistId,
        eventDate: input.eventDate,
        startTime: input.startTime,
        endTime,
        executor,
      });
      if (!availability.available) {
        throw new ManualArtistAvailabilityError(availability);
      }

      const [booking] = await tx
        .insert(bookingRequests)
        .values({
          artistId: input.artistId,
          clientName: (input.note || "Rezervare manuală").slice(0, 200),
          clientPhone: "—",
          clientEmail: null,
          eventDate: input.eventDate,
          startTime: input.startTime,
          endTime,
          eventType: input.eventType ?? null,
          guestCount: null,
          message: input.note ?? null,
          status: "accepted",
          source: "manual",
          agreedPrice: price,
          creationScopeHash: idempotencyKey ? scopeHash : null,
          creationRequestId: idempotencyKey,
          creationPayloadHash: idempotencyKey ? payloadHash : null,
        })
        .returning();
      if (!booking) throw new Error("manual_booking_insert_failed");

      await tx.insert(calendarEvents).values({
        entityType: "artist",
        entityId: input.artistId,
        date: input.eventDate,
        status: "booked",
        source: "booking",
        bookingId: booking.id,
        note: input.note ?? null,
        eventType: input.eventType ?? null,
        startTime: input.startTime,
        endTime,
      });

      return { booking, created: true };
    });
  } catch (error) {
    const response = writeErrorResponse(error);
    if (response) return response;
    throw error;
  }

  const response = NextResponse.json(bookingResponse(result.booking), {
    status: result.created ? 201 : 200,
  });
  if (!result.created) response.headers.set("Idempotency-Replayed", "true");
  return response;
}

export async function DELETE(req: NextRequest) {
  // Authenticate before probing a booking id so anonymous callers cannot use
  // response differences as an existence oracle.
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const actorUserId = await appUserIdForClerk(clerkId);
  if (!actorUserId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rawId = new URL(req.url).searchParams.get("id");
  const id = rawId && /^\d+$/.test(rawId) ? Number(rawId) : Number.NaN;
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    await db.transaction(async (tx) => {
      const actor = await lockBookingCreationActor(tx, actorUserId);
      // Read the target id first, then freeze ownership before taking the
      // booking row lock. This actor -> artist -> booking order matches artist
      // deletion (artist -> booking) and avoids a booking -> artist cycle.
      const [candidate] = await tx
        .select({
          id: bookingRequests.id,
          artistId: bookingRequests.artistId,
          source: bookingRequests.source,
        })
        .from(bookingRequests)
        .where(eq(bookingRequests.id, id))
        .limit(1);
      if (!candidate) {
        throw new ManualBookingWriteError("Not found", 404);
      }
      // Keep target kind/source indistinguishable from a missing row. A signed
      // in user must not be able to enumerate another workflow's bookings by
      // observing 400 vs 404.
      if (candidate.artistId == null || candidate.source !== "manual") {
        throw new ManualBookingWriteError("Not found", 404);
      }

      const isAdmin = actor.role === "admin" || actor.role === "super_admin";
      const [artist] = await tx
        .select({ id: artists.id, userId: artists.userId })
        .from(artists)
        .where(eq(artists.id, candidate.artistId))
        .for("share")
        .limit(1);
      if (!artist || (!isAdmin && artist.userId !== actor.id)) {
        throw new ManualBookingWriteError("Not found", 404);
      }

      const [booking] = await tx
        .select({
          id: bookingRequests.id,
          artistId: bookingRequests.artistId,
          source: bookingRequests.source,
        })
        .from(bookingRequests)
        .where(eq(bookingRequests.id, candidate.id))
        .for("update")
        .limit(1);
      if (!booking) {
        throw new ManualBookingWriteError("Not found", 404);
      }
      if (booking.artistId !== artist.id) {
        throw new ManualBookingWriteError("Not found", 404);
      }
      if (booking.source !== "manual") {
        throw new ManualBookingWriteError("Not found", 404);
      }

      const ownedArtist = tx
        .select({ id: artists.id })
        .from(artists)
        .where(
          and(eq(artists.id, artist.id), eq(artists.userId, actor.id)),
        );

      // Remove only the projection created by this endpoint. A corrupt or
      // unrelated row carrying the same booking id is deliberately preserved.
      await tx
        .delete(calendarEvents)
        .where(
          and(
            eq(calendarEvents.bookingId, booking.id),
            eq(calendarEvents.entityType, "artist"),
            eq(calendarEvents.entityId, booking.artistId),
            eq(calendarEvents.source, "booking"),
          ),
        );

      // Keep the idempotency tuple as a durable tombstone. If the browser lost
      // the original POST response and retries after this cancellation, POST
      // finds this row and replays the cancelled result instead of creating a
      // fresh calendar block. Free-form/private fields are minimized; target,
      // interval, source and creation hashes remain for authorization and
      // deterministic replay.
      const [cancelled] = await tx
        .update(bookingRequests)
        .set({
          status: "cancelled",
          clientName: "Rezervare manuală anulată",
          clientPhone: "",
          clientEmail: null,
          eventType: null,
          guestCount: null,
          message: null,
          agreedPrice: null,
          priceOffers: [],
          artistReply: null,
          adminNotes: null,
          clientSignature: null,
          clientSignedAt: null,
          clientConfirmedAt: null,
          confirmedAt: null,
          contractPdfUrl: null,
          commercialSnapshot: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(bookingRequests.id, booking.id),
            eq(bookingRequests.artistId, booking.artistId),
            eq(bookingRequests.source, "manual"),
            isAdmin ? undefined : exists(ownedArtist),
          ),
        )
        .returning({ id: bookingRequests.id });
      if (!cancelled) {
        throw new ManualBookingWriteError("Not found", 404);
      }
    });
  } catch (error) {
    const response = writeErrorResponse(error);
    if (response) return response;
    throw error;
  }

  return NextResponse.json({ success: true });
}
