import { t } from "@/i18n";
import type { Locale } from "@/types";

export type BookingHallDisplay = {
  hallId?: number | null;
  hallName?: string | null;
  reservationScope?: string | null;
};

export function bookingHallLabel(booking: BookingHallDisplay, locale: Locale): string {
  if (booking.reservationScope === "venue") return t("booking.hallWholeVenue", locale);
  if (booking.hallName?.trim()) return t("booking.hallLabel", locale, { name: booking.hallName.trim() });
  if (booking.hallId != null) return t("booking.hallById", locale, { id: booking.hallId });
  // A deleted/legacy hall must not be relabelled as a whole-venue reservation.
  return t("booking.hallUnspecified", locale);
}
