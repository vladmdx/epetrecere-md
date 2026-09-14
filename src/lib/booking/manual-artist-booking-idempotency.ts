import { createHash } from "node:crypto";

export type ManualArtistBookingPayload = Readonly<{
  artistId: number;
  eventDate: string;
  startTime: string;
  durationMinutes?: number | null;
  packageId?: number | null;
  price?: number | null;
  note?: string | null;
  eventType?: string | null;
}>;

/**
 * Manual calendar bookings have their own namespace. A key used by the same
 * account on the public booking endpoint can therefore never replay a private
 * artist-calendar booking (or vice versa).
 */
export function manualArtistBookingScopeHash(actorUserId: string): string {
  return createHash("sha256")
    .update(`artist-booking:create:${actorUserId}`, "utf8")
    .digest("hex");
}

/** Fixed-order representation of exactly the validated/stored user intent. */
export function canonicalManualArtistBookingPayloadV1(
  input: ManualArtistBookingPayload,
) {
  return {
    version: 1 as const,
    artistId: input.artistId,
    eventDate: input.eventDate,
    startTime: input.startTime,
    durationMinutes: input.durationMinutes ?? null,
    packageId: input.packageId ?? null,
    price: input.price ?? null,
    note: input.note?.trim() || null,
    eventType: input.eventType?.trim() || null,
  };
}

export function manualArtistBookingPayloadHash(
  input: ManualArtistBookingPayload,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify(canonicalManualArtistBookingPayloadV1(input)),
      "utf8",
    )
    .digest("hex");
}
