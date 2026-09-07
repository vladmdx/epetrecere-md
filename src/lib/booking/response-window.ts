/** Mirrors the pending expiry policy in the booking API and Inngest sweep.
 * A price proposal does not reset createdAt or grant a new response window. */
export function pendingBookingWindow(booking: {
  createdAt: string | null;
  venueId?: number | null;
  priceOffers?: ReadonlyArray<{ from: string }> | null;
}, now: number) {
  const windowHours = booking.venueId != null ? 72 : 24;
  const created = booking.createdAt ? new Date(booking.createdAt).getTime() : Number.NaN;
  const remaining = Number.isFinite(created) && Number.isFinite(now)
    ? Math.max(0, created + windowHours * 3_600_000 - now) : null;
  const totalMinutes = remaining == null ? null : Math.floor(remaining / 60_000);
  const lastOffer = booking.priceOffers?.at(-1);
  return {
    windowHours,
    hours: totalMinutes == null ? null : Math.floor(totalMinutes / 60),
    minutes: totalMinutes == null ? null : totalMinutes % 60,
    expiryDue: remaining === 0,
    awaitingClient: lastOffer?.from === "artist",
  };
}
