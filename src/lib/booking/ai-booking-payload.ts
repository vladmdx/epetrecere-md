import { bookingCreationPayloadHash } from "./booking-create-idempotency";
import { redactContact } from "@/lib/privacy/contact-redaction";

export type AiBookingPlanSnapshot = Readonly<{
  id: number;
  title: string;
  eventType: string | null;
  eventDate: string | null;
  guestCountTarget: number | null;
}>;

export type AiBookingActorSnapshot = Readonly<{
  name: string | null;
  email: string | null;
  phone: string | null;
}>;

export type AiBookingPayload = Readonly<{
  artistId: number;
  eventPlanId: number;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  eventDate: string;
  eventType?: string;
  guestCount?: number;
  message: string;
}>;

export type PersistedAiBookingSnapshot = Readonly<{
  artistId: number | null;
  venueId: number | null;
  eventPlanId: number | null;
  hallId: number | null;
  reservationScope: "hall" | "venue" | null;
  clientUserId: string | null;
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
}>;

/**
 * Build the exact user-visible booking intent from server-owned rows.
 *
 * The same function is called while preparing the confirmation card and
 * again after the actor/plan rows are locked during confirmation. Any change
 * to the plan or account therefore invalidates the old proposal instead of
 * silently changing what the user is about to send.
 */
export function buildAiBookingPayload(input: {
  plan: AiBookingPlanSnapshot;
  actor: AiBookingActorSnapshot;
  artistId: number;
}): AiBookingPayload | null {
  const eventDate = input.plan.eventDate?.trim();
  if (!eventDate) return null;
  const eventType = input.plan.eventType?.trim() || undefined;
  const canonicalMessage = redactContact(
    `Salut! Cerere din planul "${input.plan.title}" pentru ${eventType || "eveniment"}, în data de ${eventDate}.`,
  );
  return Object.freeze({
    artistId: input.artistId,
    eventPlanId: input.plan.id,
    clientName: input.actor.name?.trim() || "Client ePetrecere",
    clientPhone: input.actor.phone?.trim() || "—",
    clientEmail: input.actor.email?.trim() || undefined,
    eventDate,
    eventType,
    guestCount: input.plan.guestCountTarget ?? undefined,
    message: canonicalMessage,
  });
}

/**
 * Full proposal fingerprint, including the locked account identity. Unlike
 * generic request idempotency, changing name/e-mail/phone deliberately makes
 * an outstanding confirmation stale. The digest is HMACed with the raw
 * proposal token before it is persisted, so these low-entropy fields cannot
 * be guessed from a database snapshot.
 */
export function aiBookingPayloadFingerprint(payload: AiBookingPayload): string {
  return bookingCreationPayloadHash({
    artistId: payload.artistId,
    venueId: null,
    eventPlanId: payload.eventPlanId,
    hallId: null,
    reservationScope: null,
    clientName: payload.clientName,
    clientPhone: payload.clientPhone,
    clientEmail: payload.clientEmail ?? null,
    eventDate: payload.eventDate,
    startTime: null,
    endTime: null,
    eventType: payload.eventType ?? null,
    guestCount: payload.guestCount ?? null,
    message: payload.message,
    agreedPrice: null,
    packageId: null,
  });
}

/**
 * Rebuild the proposal fingerprint from the immutable booking that was
 * actually committed. This is used only for a lost-response replay: the
 * current profile or plan may have changed meanwhile, but the consumed nonce
 * must still prove that it authorized this exact persisted request.
 */
export function aiBookingPayloadFingerprintFromPersistedBooking(
  booking: PersistedAiBookingSnapshot,
): string {
  return bookingCreationPayloadHash({
    artistId: booking.artistId,
    venueId: booking.venueId,
    eventPlanId: booking.eventPlanId,
    hallId: booking.hallId,
    reservationScope: booking.reservationScope,
    clientName: booking.clientName,
    clientPhone: booking.clientPhone,
    clientEmail: booking.clientEmail,
    eventDate: booking.eventDate,
    startTime: booking.startTime,
    endTime: booking.endTime,
    eventType: booking.eventType,
    guestCount: booking.guestCount,
    message: booking.message,
    agreedPrice: booking.agreedPrice,
    packageId: null,
  });
}
