import { localizePath, splitLocale } from "../i18n/routing";

type NotificationLink = { type?: string; actionUrl: string | null };

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

export function vendorBookingNotificationPath(venueId: number | null): string {
  return venueId ? "/dashboard/sala/rezervari" : "/dashboard/rezervari";
}
