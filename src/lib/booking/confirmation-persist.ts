import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookingRequests, calendarEvents } from "@/lib/db/schema";
import { ensureCommissionForBooking } from "@/lib/commissions/service";

type Booking = typeof bookingRequests.$inferSelect;
type Executor = typeof db;

export async function projectBookingOntoCalendar(executor: Executor, b: Booking): Promise<void> {
  const entityId = b.venueId ?? b.artistId;
  if (!entityId) return;
  await executor
    .insert(calendarEvents)
    .values({
      entityType: b.venueId ? "venue" : "artist",
      entityId,
      date: b.eventDate,
      status: "booked",
      source: "booking",
      bookingId: b.id,
      hallId: b.hallId,
      eventType: b.eventType,
      startTime: b.startTime,
      endTime: b.endTime,
      note: `Rezervare #${b.id}`,
    })
    .onConflictDoNothing({ target: calendarEvents.bookingId });
}

/** Financial + calendar effects that must commit with confirmation. */
export async function persistConfirmationEffects(executor: Executor, b: Booking): Promise<Booking> {
  await ensureCommissionForBooking(b.id, executor);
  let row = b;
  if (b.venueId && !b.commercialSnapshot) {
    const { commercialSnapshotFor } = await import("@/lib/booking/venue-booking-write");
    const snapshot = await commercialSnapshotFor({
      venueId: b.venueId,
      hallId: b.hallId ?? null,
      reservationScope: b.reservationScope === "venue" ? "venue" : "hall",
      agreedPrice: b.agreedPrice,
      currency: b.agreedCurrency,
      guestCount: b.guestCount,
      eventType: b.eventType,
      executor,
    });
    const [updated] = await executor
      .update(bookingRequests)
      .set({ commercialSnapshot: snapshot, updatedAt: new Date() })
      .where(eq(bookingRequests.id, b.id))
      .returning();
    if (updated) row = updated;
  }
  await projectBookingOntoCalendar(executor, row);
  return row;
}
