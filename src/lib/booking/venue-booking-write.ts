import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookingRequests, venueHalls, venues } from "@/lib/db/schema";
import { acquireAvailabilityLocks } from "./advisory-locks";
import {
  availabilityHttpStatus,
  evaluateVenueAvailability,
  type VenueAvailabilityResult,
} from "./venue-availability";
import { isMultiHallEnabled } from "@/lib/feature-flags";

export type VenueBookingWrite = {
  venueId: number;
  hallId?: number | null;
  guestCount?: number | null;
  eventDate: string;
  startTime?: string | null;
  endTime?: string | null;
  timezone?: string | null;
  reservationScope?: "hall" | "venue";
  excludeBookingId?: number;
  mode?: "public" | "owner" | "admin";
};

export class VenueAvailabilityError extends Error {
  result: VenueAvailabilityResult;
  status: number;
  constructor(result: VenueAvailabilityResult) {
    super(result.message || result.code);
    this.result = result;
    this.status = availabilityHttpStatus(result);
  }
}

export type VenueWriteTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Lock + re-check + write in one transaction. Advisory locks are
 * transaction-scoped, so the insert/update must happen before COMMIT.
 */
export async function withVenueAvailabilityWrite<T>(
  input: VenueBookingWrite,
  write: (tx: VenueWriteTx, result: VenueAvailabilityResult) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const executor = tx as unknown as typeof db;
    const first = await evaluateVenueAvailability({ ...input, executor });
    if (!first.available || !first.lockKeys) {
      throw new VenueAvailabilityError(first);
    }
    await acquireAvailabilityLocks(tx, first.lockKeys);
    const second = await evaluateVenueAvailability({ ...input, executor });
    if (!second.available) throw new VenueAvailabilityError(second);
    return write(tx, second);
  });
}

export async function assertVenueAvailableForWrite(
  input: VenueBookingWrite,
): Promise<VenueAvailabilityResult> {
  return withVenueAvailabilityWrite(input, async (_tx, result) => result);
}

export async function commercialSnapshotFor(opts: {
  venueId: number;
  hallId: number | null;
  reservationScope: "hall" | "venue";
  agreedPrice?: number | null;
  currency?: string | null;
  guestCount?: number | null;
  eventType?: string | null;
}) {
  const [venue] = await db
    .select({
      id: venues.id,
      nameRo: venues.nameRo,
      organizationId: venues.organizationId,
    })
    .from(venues)
    .where(eq(venues.id, opts.venueId))
    .limit(1);
  const [hall] = opts.hallId
    ? await db.select().from(venueHalls).where(eq(venueHalls.id, opts.hallId)).limit(1)
    : [];
  return {
    organizationId: venue?.organizationId ?? null,
    venueId: opts.venueId,
    venueName: venue?.nameRo ?? null,
    hallId: hall?.id ?? null,
    hallName: hall?.nameRo ?? null,
    reservationScope: opts.reservationScope,
    pricingModel: hall?.pricingModel ?? null,
    basePrice: hall?.basePrice ?? null,
    minimumOrder: hall?.minimumOrder ?? null,
    depositType: hall?.depositType ?? null,
    depositValue: hall?.depositValue ?? null,
    currency: opts.currency ?? hall?.currency ?? "EUR",
    agreedPrice: opts.agreedPrice ?? null,
    guestCount: opts.guestCount ?? null,
    eventType: opts.eventType ?? null,
    bookingTermsRo: hall?.bookingTermsRo ?? null,
    capturedAt: new Date().toISOString(),
  };
}

export async function venueHallDisplayName(venueId: number, hallId: number | null): Promise<string> {
  const [venue] = await db
    .select({ nameRo: venues.nameRo })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  if (!hallId) return venue?.nameRo ?? "Local";
  const [hall] = await db
    .select({ nameRo: venueHalls.nameRo })
    .from(venueHalls)
    .where(eq(venueHalls.id, hallId))
    .limit(1);
  if (!hall) return venue?.nameRo ?? "Local";
  return `${venue?.nameRo ?? "Local"} · ${hall.nameRo}`;
}

export function multiHallBookingFieldsRequired(): boolean {
  return isMultiHallEnabled();
}

export async function loadBookingRow(id: number) {
  const [row] = await db.select().from(bookingRequests).where(eq(bookingRequests.id, id)).limit(1);
  return row ?? null;
}
