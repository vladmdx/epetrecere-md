import { isMultiHallEnabled } from "../feature-flags";
import { localizePath, splitLocale } from "../i18n/routing";

type NotificationLink = { type?: string; actionUrl: string | null };

function positiveId(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

/** Only known legacy producer mistakes; never infer a destination from prose. */
export function legacyVenueNotificationUrl(item: NotificationLink): string | null {
  if (!item.actionUrl) return null;
  try {
    const url = new URL(item.actionUrl, "https://epetrecere.md");
    if (url.origin !== "https://epetrecere.md") return null;
    const { locale, pathname } = splitLocale(url.pathname);
    let target: string | undefined;
    if (item.type === "registration_approved" && pathname === "/dashboard") {
      target = "/dashboard/sala";
    } else if (item.type === "booking_request_new" && pathname === "/dashboard/rezervari") {
      target = "/dashboard/sala/rezervari";
    }
    return target ? `${localizePath(target, locale)}${url.search}${url.hash}` : null;
  } catch {
    return null;
  }
}

/** Caller must first verify unambiguous venue ownership from the database. */
export function notificationForVenue<T extends NotificationLink>(item: T): T {
  const actionUrl = legacyVenueNotificationUrl(item);
  return actionUrl ? { ...item, actionUrl } : item;
}

/** Canonical vendor booking destination. Never infers venueId from ownership. */
export function vendorBookingNotificationPath(input: {
  venueId: number | null;
  bookingId: number;
}): string {
  const venueId = positiveId(input.venueId);
  const bookingId = positiveId(input.bookingId);
  if (!venueId) return "/dashboard/rezervari";
  if (!isMultiHallEnabled()) return "/dashboard/sala/rezervari";
  if (!bookingId) return `/dashboard/locatii/${venueId}/rezervari`;
  return `/dashboard/locatii/${venueId}/rezervari?expand=${bookingId}`;
}

/** Review inbox for the booking's venue; never the first accessible venue. */
export function vendorReviewNotificationPath(venueId: number | null): string {
  const id = positiveId(venueId);
  if (!id) return "/dashboard/recenzii";
  if (!isMultiHallEnabled()) return "/dashboard/sala/recenzii";
  return `/dashboard/locatii/${id}/recenzii`;
}
