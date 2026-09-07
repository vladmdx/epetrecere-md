import { plainText } from "../content/plain-text";
import { containsContact, redactContact } from "./contact-redaction";
import { splitLocale } from "../i18n/routing";

export type NotificationText = { title: string; message: string | null; actionUrl: string | null };
export type NotificationContext = { kind: "conversation" | "booking"; id: number };

/** Only known same-site links can authorize revealing old notification text. */
export function notificationContext(actionUrl: string | null): NotificationContext | null {
  if (!actionUrl) return null;
  try {
    const url = new URL(actionUrl, "https://epetrecere.md");
    if (url.origin !== "https://epetrecere.md") return null;
    const { pathname } = splitLocale(url.pathname);
    const conversation = url.searchParams.get("conversation");
    if (["/cabinet/mesaje", "/dashboard/mesaje", "/dashboard/sala/mesaje"].includes(pathname) && conversation) {
      const id = Number(conversation);
      return Number.isSafeInteger(id) && id > 0 ? { kind: "conversation", id } : null;
    }
    if (["/cabinet/rezervari", "/dashboard/rezervari", "/dashboard/sala/rezervari"].includes(pathname)) {
      const id = Number(url.searchParams.get("expand") || url.searchParams.get("booking_request_id"));
      return Number.isSafeInteger(id) && id > 0 ? { kind: "booking", id } : null;
    }
  } catch { /* Unknown or malformed legacy links stay locked. */ }
  return null;
}

export function notificationHasContact(item: NotificationText): boolean {
  return containsContact(item.title) || containsContact(item.message ?? "")
    || containsContact(plainText(item.title)) || containsContact(plainText(item.message));
}

export function notificationForViewer<T extends NotificationText>(item: T, contactUnlocked: boolean): T {
  if (contactUnlocked) return item;
  return {
    ...item,
    title: redactContact(plainText(item.title)),
    message: item.message === null ? null : redactContact(plainText(item.message)),
  };
}

export function conversationPartyKey(clientUserId: string | null, artistId: number | null, venueId: number | null): string | null {
  if (!clientUserId) return null;
  if (artistId && !venueId) return `${clientUserId}|artist:${artistId}`;
  if (venueId && !artistId) return `${clientUserId}|venue:${venueId}`;
  return null;
}
