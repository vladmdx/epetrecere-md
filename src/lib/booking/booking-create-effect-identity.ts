import { createHash } from "node:crypto";

export type BookingCreationEffectAudience = "vendor" | "admin" | "client";

/**
 * Stable logical event identity for one booking-create recipient.
 *
 * Recipient ids, e-mail addresses and phone numbers are deliberately not
 * accepted by this helper, so neither the database dedupe key nor the
 * provider idempotency key can accidentally contain PII.
 */
export function bookingCreationEffectDedupeBase(input: {
  bookingId: number;
  audience: BookingCreationEffectAudience;
  ordinal: number;
}): string {
  if (!Number.isSafeInteger(input.bookingId) || input.bookingId <= 0) {
    throw new TypeError("bookingId must be a positive safe integer");
  }
  if (!Number.isSafeInteger(input.ordinal) || input.ordinal < 0) {
    throw new TypeError("ordinal must be a non-negative safe integer");
  }
  return `booking:${input.bookingId}:create:${input.audience}:${input.ordinal}`;
}

/**
 * Deterministic UUID used only when a direct e-mail has no application user.
 * The source tuple contains no contact data and the deliveries table has no
 * FK, so anonymous/client-less recipients remain retryable without storing an
 * e-mail address in an identity or dedupe column.
 */
export function bookingCreationSyntheticRecipientId(input: {
  bookingId: number;
  audience: BookingCreationEffectAudience;
  ordinal?: number;
}): string {
  const ordinal = input.ordinal ?? 0;
  const name = bookingCreationEffectDedupeBase({
    bookingId: input.bookingId,
    audience: input.audience,
    ordinal,
  });
  const bytes = createHash("sha256")
    .update("epetrecere-booking-create-recipient:v1:", "utf8")
    .update(name, "utf8")
    .digest()
    .subarray(0, 16);
  // RFC 9562 UUID variant + name-based version marker.
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}
