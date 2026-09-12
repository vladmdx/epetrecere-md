/**
 * CAS status transitions for bookings. Never trust a stale snapshot and then
 * UPDATE ... WHERE id only — concurrent accept/confirm/cancel must collide
 * on the allowed statuses.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookingRequests, calendarEvents } from "@/lib/db/schema";
import { persistConfirmationEffects } from "./confirmation-persist";
import { withVenueAvailabilityWrite } from "./venue-booking-write";

export type BookingRow = typeof bookingRequests.$inferSelect;
type Executor = typeof db;

export class BookingChangedError extends Error {
  constructor() {
    super("booking_changed");
    this.name = "BookingChangedError";
  }
}

export async function casUpdateBookingStatus(
  executor: Executor,
  bookingId: number,
  allowed: BookingRow["status"][],
  values: Partial<typeof bookingRequests.$inferInsert>,
): Promise<BookingRow | null> {
  const [row] = await executor
    .update(bookingRequests)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(bookingRequests.id, bookingId), inArray(bookingRequests.status, allowed)))
    .returning();
  return row ?? null;
}

export async function acceptVenueBooking(
  booking: BookingRow,
  extras: { reply?: string; agreedPrice?: number },
): Promise<BookingRow> {
  if (!booking.venueId) throw new Error("venue_required");
  return withVenueAvailabilityWrite(
    {
      venueId: booking.venueId,
      hallId: booking.hallId,
      guestCount: booking.guestCount,
      eventDate: booking.eventDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      timezone: booking.timezone,
      reservationScope: booking.reservationScope === "venue" ? "venue" : "hall",
      excludeBookingId: booking.id,
      mode: "owner",
    },
    async (tx) => {
      const offered = await casUpdateBookingStatus(tx as unknown as Executor, booking.id, ["pending"], {
        status: "accepted",
        artistReply: extras.reply || "Oferta este pregătită pentru acceptarea clientului.",
        ...(extras.agreedPrice !== undefined ? { agreedPrice: extras.agreedPrice } : {}),
      });
      if (!offered) throw new BookingChangedError();
      return offered;
    },
  );
}

export async function rejectBooking(bookingId: number, reply?: string): Promise<BookingRow> {
  const row = await casUpdateBookingStatus(db, bookingId, ["pending"], {
    status: "rejected",
    artistReply: reply || "Ne pare rău, nu suntem disponibili.",
  });
  if (!row) throw new BookingChangedError();
  return row;
}

export async function clientCancelBooking(bookingId: number): Promise<BookingRow> {
  const row = await casUpdateBookingStatus(db, bookingId, ["pending", "accepted"], {
    status: "cancelled",
  });
  if (!row) throw new BookingChangedError();
  return row;
}

export async function vendorCancelBooking(bookingId: number, reply?: string): Promise<BookingRow> {
  return db.transaction(async (tx) => {
    const row = await casUpdateBookingStatus(tx as unknown as Executor, bookingId, ["accepted", "confirmed_by_client"], {
      status: "cancelled",
      artistReply: reply || "Rezervarea a fost anulată de organizator.",
    });
    if (!row) throw new BookingChangedError();
    await tx.delete(calendarEvents).where(eq(calendarEvents.bookingId, bookingId));
    return row;
  });
}

export async function confirmBookingWithEffects(
  booking: BookingRow,
  write: (tx: Executor) => Promise<BookingRow | null>,
): Promise<BookingRow> {
  if (!booking.venueId) {
    return db.transaction(async (tx) => {
      const executor = tx as unknown as Executor;
      const row = await write(executor);
      if (!row) throw new BookingChangedError();
      if (row.status === "confirmed_by_client") {
        await persistConfirmationEffects(executor, row);
      }
      return row;
    });
  }
  return withVenueAvailabilityWrite(
    {
      venueId: booking.venueId,
      hallId: booking.hallId,
      guestCount: booking.guestCount,
      eventDate: booking.eventDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      timezone: booking.timezone,
      reservationScope: booking.reservationScope === "venue" ? "venue" : "hall",
      excludeBookingId: booking.id,
      mode: "owner",
    },
    async (tx) => {
      const executor = tx as unknown as Executor;
      const row = await write(executor);
      if (!row) throw new BookingChangedError();
      if (row.status === "confirmed_by_client") {
        await persistConfirmationEffects(executor, row);
      }
      return row;
    },
  );
}

export async function replayConfirmationEffects(booking: BookingRow): Promise<BookingRow> {
  return db.transaction(async (tx) => persistConfirmationEffects(tx as unknown as Executor, booking));
}
