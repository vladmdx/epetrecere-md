import { createHash } from "node:crypto";

/**
 * The idempotency namespace is deliberately derived only from server-known
 * identity.  We never persist a raw Clerk id, IP address, e-mail, or phone as
 * part of the idempotency identity.
 */
export function bookingCreationScopeHash(clerkId: string | null): string {
  const scope = clerkId
    ? `booking:create:clerk:${clerkId}`
    : "booking:create:anonymous";
  return createHash("sha256").update(scope, "utf8").digest("hex");
}

export type CanonicalBookingCreatePayloadV1 = {
  version: 1;
  artistId: number | null;
  venueId: number | null;
  eventPlanId: number | null;
  hallId: number | null;
  reservationScope: "hall" | "venue" | null;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  eventType: string | null;
  guestCount: number | null;
  message: string | null;
  agreedPrice: number | null;
  packageId: number | null;
};

export type BookingCreatePayloadInput = Omit<
  CanonicalBookingCreatePayloadV1,
  "version"
>;

export type BookingCreatePayloadHashOptions = Readonly<{
  /**
   * Authenticated name/e-mail are copied from the locked account row and are
   * not caller intent. The submitted phone remains explicit per-booking
   * intent, so it is deliberately never neutralized. This keeps a frozen
   * lost-response retry valid while rejecting reuse for a different callback
   * number.
   */
  serverManagedClientIdentity?: boolean;
}>;

const SERVER_MANAGED_IDENTITY = "\u0000server-managed-client-identity";

/**
 * Keep these keys explicit and in a fixed order. JSON.stringify preserves
 * insertion order for this plain object, making web/mobile retries agree on
 * one v1 representation while mapping omitted optional values to null.
 */
export function canonicalBookingCreatePayloadV1(
  input: BookingCreatePayloadInput,
): CanonicalBookingCreatePayloadV1 {
  return {
    version: 1,
    artistId: input.artistId ?? null,
    venueId: input.venueId ?? null,
    eventPlanId: input.eventPlanId ?? null,
    hallId: input.hallId ?? null,
    reservationScope: input.reservationScope ?? null,
    clientName: input.clientName,
    clientPhone: input.clientPhone,
    clientEmail: input.clientEmail ?? null,
    eventDate: input.eventDate,
    startTime: input.startTime ?? null,
    endTime: input.endTime ?? null,
    eventType: input.eventType ?? null,
    guestCount: input.guestCount ?? null,
    message: input.message ?? null,
    agreedPrice: input.agreedPrice ?? null,
    packageId: input.packageId ?? null,
  };
}

export function bookingCreationPayloadHash(
  input: BookingCreatePayloadInput,
  options: BookingCreatePayloadHashOptions = {},
): string {
  const canonical = canonicalBookingCreatePayloadV1(
    options.serverManagedClientIdentity
      ? {
          ...input,
          clientName: SERVER_MANAGED_IDENTITY,
          clientEmail: null,
        }
      : input,
  );
  return createHash("sha256")
    .update(JSON.stringify(canonical), "utf8")
    .digest("hex");
}
