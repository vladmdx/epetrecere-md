import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  artists,
  bookingRequests,
  calendarEvents,
  venueHalls,
  venues,
} from "@/lib/db/schema";
import { ensureCommissionForBooking } from "@/lib/commissions/service";
import type { CommissionRules } from "@/lib/commissions/rules";
import {
  CONFIRMATION_NOTIFICATION_EFFECT,
  enqueueBookingEffect,
} from "./effect-outbox";

type Booking = typeof bookingRequests.$inferSelect;
type Executor = typeof db;

export class CommissionRequiredError extends Error {
  constructor() {
    super("commission_required");
    this.name = "CommissionRequiredError";
  }
}

/**
 * Freeze every live vendor parent before a confirmation path takes the
 * booking-row lock. Commission inserts need FK KEY SHARE locks on these same
 * parents, while vendor deletion takes parent UPDATE locks before its FK action
 * touches bookings. Keeping `artist -> venue -> hall -> booking` prevents the
 * two transactions from waiting on each other in reverse order.
 */
export async function lockConfirmationVendorParents(
  executor: Executor,
  b: Pick<Booking, "artistId" | "venueId" | "hallId">,
): Promise<boolean> {
  if (b.artistId != null) {
    const [artist] = await executor
      .select({ id: artists.id })
      .from(artists)
      .where(eq(artists.id, b.artistId))
      .for("share")
      .limit(1);
    if (!artist) return false;
  }

  if (b.venueId != null) {
    const [venue] = await executor
      .select({ id: venues.id })
      .from(venues)
      .where(eq(venues.id, b.venueId))
      .for("share")
      .limit(1);
    if (!venue) return false;
  }

  if (b.hallId != null) {
    if (b.venueId == null) return false;
    const [hall] = await executor
      .select({ id: venueHalls.id })
      .from(venueHalls)
      .where(and(
        eq(venueHalls.id, b.hallId),
        eq(venueHalls.venueId, b.venueId),
      ))
      .for("share")
      .limit(1);
    if (!hall) return false;
  }

  return true;
}

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
export async function persistConfirmationEffects(
  executor: Executor,
  b: Booking,
  options: {
    commissionRules?: CommissionRules;
    requireCommission?: boolean;
  } = {},
): Promise<Booking> {
  if (b.status !== "confirmed_by_client" && b.status !== "completed") {
    return b;
  }
  const commissionId = await ensureCommissionForBooking(
    b.id,
    executor,
    options.commissionRules,
  );
  if (options.requireCommission && commissionId == null) {
    throw new CommissionRequiredError();
  }
  let row = b;
  if (b.artistId && !b.artistNameSnapshot) {
    const [artist] = await executor
      .select({ name: artists.nameRo })
      .from(artists)
      .where(eq(artists.id, b.artistId))
      .limit(1);
    if (artist?.name) {
      const [updated] = await executor
        .update(bookingRequests)
        .set({ artistNameSnapshot: artist.name, updatedAt: new Date() })
        .where(eq(bookingRequests.id, b.id))
        .returning();
      if (updated) row = updated;
    }
  }
  if (row.venueId && !row.commercialSnapshot) {
    const { commercialSnapshotFor } = await import("@/lib/booking/venue-booking-write");
    const snapshot = await commercialSnapshotFor({
      venueId: row.venueId,
      hallId: row.hallId ?? null,
      reservationScope: row.reservationScope === "venue" ? "venue" : "hall",
      agreedPrice: row.agreedPrice,
      currency: row.agreedCurrency,
      guestCount: row.guestCount,
      eventType: row.eventType,
      executor,
    });
    const [updated] = await executor
      .update(bookingRequests)
      .set({ commercialSnapshot: snapshot, updatedAt: new Date() })
      .where(eq(bookingRequests.id, row.id))
      .returning();
    if (updated) row = updated;
  }
  await projectBookingOntoCalendar(executor, row);
  // This insert commits atomically with confirmation, the commission and the
  // calendar projection. `after()` is only an immediate delivery accelerator;
  // cron workers can always recover this durable row after a process crash.
  await enqueueBookingEffect(executor, row.id, CONFIRMATION_NOTIFICATION_EFFECT);
  return row;
}
