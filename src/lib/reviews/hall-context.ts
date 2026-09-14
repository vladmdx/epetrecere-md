/** Copy the booking's hall onto a venue review. Artist bookings have no hall. */
export function reviewHallIdFromBooking(booking: {
  venueId: number | null;
  hallId: number | null;
}): number | null {
  if (booking.venueId == null) return null;
  return booking.hallId;
}

/** Public reviewable payload: hall identity only, no private hall fields. */
export function reviewableVenueHallProjection(input: {
  venueId: number | null;
  hallId: number | null;
  hallName: string | null;
}): { hallId: number | null; hallName: string | null } {
  if (input.venueId == null || input.hallId == null) {
    return { hallId: null, hallName: null };
  }
  return {
    hallId: input.hallId,
    hallName: input.hallName,
  };
}
