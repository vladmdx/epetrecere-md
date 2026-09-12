export const BOOKING_EFFECT_LEASE_MS = 5 * 60 * 1000;
export const BOOKING_EFFECT_MAX_BACKOFF_MS = 60 * 60 * 1000;
export const BOOKING_EFFECT_BASE_BACKOFF_MS = 30 * 1000;

function leafErrorMessages(error: unknown): string[] {
  if (error instanceof AggregateError) {
    return error.errors.flatMap((cause) => leafErrorMessages(cause));
  }
  const message = error instanceof Error ? error.message : String(error);
  return message ? [message] : [];
}

/** Exponential retry delay, capped so a transient provider outage recovers. */
export function bookingEffectRetryDelayMs(attempts: number): number {
  const exponent = Math.max(0, Math.min(16, attempts - 1));
  return Math.min(
    BOOKING_EFFECT_MAX_BACKOFF_MS,
    BOOKING_EFFECT_BASE_BACKOFF_MS * 2 ** exponent,
  );
}

export function bookingEffectError(error: unknown): string {
  const base = error instanceof Error ? error.message : String(error);
  const details = error instanceof AggregateError
    ? error.errors.flatMap((cause) => leafErrorMessages(cause)).join("; ")
    : "";
  const message = details ? `${base}: ${details}` : base;
  return message.slice(0, 2_000) || "unknown delivery error";
}
