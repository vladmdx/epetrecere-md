import { plainText } from "../content/plain-text";
import { containsContact, redactContact } from "./contact-redaction";
import { splitLocale } from "../i18n/routing";
import { resolveConversationPartyXor } from "../conversations/party";

export type NotificationText = { title: string; message: string | null; actionUrl: string | null };
export type NotificationContext = {
  kind: "conversation" | "booking";
  id: number;
  venueId?: number;
};

function positiveId(value: number): number | null {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** URL venueId must match the verified resource; mismatch fails closed. */
export function notificationContextMatchesResource(
  context: NotificationContext,
  resource: { venueId?: number | null },
): boolean {
  if (context.venueId == null) return true;
  return resource.venueId === context.venueId;
}

/** Only known same-site links can authorize revealing old notification text. */
export function notificationContext(actionUrl: string | null): NotificationContext | null {
  if (!actionUrl) return null;
  try {
    const url = new URL(actionUrl, "https://epetrecere.md");
    if (url.origin !== "https://epetrecere.md") return null;
    const { pathname } = splitLocale(url.pathname);
    const conversation = url.searchParams.get("conversation");
    if (["/cabinet/mesaje", "/dashboard/mesaje", "/dashboard/sala/mesaje"].includes(pathname) && conversation) {
      const id = positiveId(Number(conversation));
      return id ? { kind: "conversation", id } : null;
    }
    const locatiiMesaje = /^\/dashboard\/locatii\/([1-9]\d*)\/mesaje$/.exec(pathname);
    if (locatiiMesaje && conversation) {
      const venueId = positiveId(Number(locatiiMesaje[1]));
      const id = positiveId(Number(conversation));
      return venueId && id ? { kind: "conversation", id, venueId } : null;
    }
    if (["/cabinet/rezervari", "/dashboard/rezervari", "/dashboard/sala/rezervari"].includes(pathname)) {
      const id = positiveId(Number(url.searchParams.get("expand") || url.searchParams.get("booking_request_id")));
      return id ? { kind: "booking", id } : null;
    }
    const locatiiRezervari = /^\/dashboard\/locatii\/([1-9]\d*)\/rezervari$/.exec(pathname);
    if (locatiiRezervari) {
      const venueId = positiveId(Number(locatiiRezervari[1]));
      const id = positiveId(Number(url.searchParams.get("expand") || url.searchParams.get("booking_request_id")));
      return venueId && id ? { kind: "booking", id, venueId } : null;
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
  const party = resolveConversationPartyXor(artistId, venueId);
  if (!party.ok) return null;
  return party.artistId != null
    ? `${clientUserId}|artist:${party.artistId}`
    : `${clientUserId}|venue:${party.venueId}`;
}
