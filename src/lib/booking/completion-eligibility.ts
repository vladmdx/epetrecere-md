/** UI eligibility mirrors PUT /api/booking-requests/[id] exactly:
 * final bilateral confirmation and event date not after today in Moldova.
 * The server remains authoritative when the action is submitted.
 */
export function canCompleteBooking(
  booking: { status: string; eventDate: string | null },
  now = new Date(),
): boolean {
  if (booking.status !== "confirmed_by_client" || !booking.eventDate ||
      !/^\d{4}-\d{2}-\d{2}$/.test(booking.eventDate) || !Number.isFinite(now.getTime())) return false;
  const today = now.toLocaleDateString("en-CA", { timeZone: "Europe/Chisinau" });
  return booking.eventDate <= today;
}
