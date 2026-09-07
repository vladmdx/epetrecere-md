import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { bookingRequests, bookings } from "@/lib/db/schema";

/** Calendar-month reporting uses the platform's local date, not the server's
 * timezone or a booking's last edit time. Bounds are [start, next start). */
export function venueDashboardMonths(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Chisinau", year: "numeric", month: "numeric",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value) - 1;
  const iso = (offset: number) => new Date(Date.UTC(year, month + offset, 1)).toISOString().slice(0, 10);
  return {
    monthYear: year,
    monthIndex: month,
    monthStart: iso(0),
    nextMonthStart: iso(1),
    lastMonthStart: iso(-1),
    daysInMonth: new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
  };
}

/** Dashboard totals count finalized reservations, not unaccepted offers.
 * This intentionally sums the existing agreed-price field without applying
 * or recalculating commissions, service fees or taxes. */
export function finalizedVenueBookingsInMonth(venueId: number, start: string, end: string) {
  return and(
    eq(bookingRequests.venueId, venueId),
    inArray(bookingRequests.status, ["confirmed_by_client", "completed"]),
    gte(bookingRequests.eventDate, start),
    lt(bookingRequests.eventDate, end),
  );
}

/** Historical records have a different status vocabulary and independent IDs.
 * Keep them in their own archive totals, never merge by name/date heuristics. */
export function finalizedLegacyVenueBookingsInMonth(start: string, end: string) {
  return and(
    inArray(bookings.status, ["confirmed", "completed"]),
    gte(bookings.eventDate, start),
    lt(bookings.eventDate, end),
  );
}
