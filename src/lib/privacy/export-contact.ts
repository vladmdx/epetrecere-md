import { contactsAreShared } from "./booking-contact";
import { chatMessageForViewer } from "./chat-message";
import { redactContact } from "./contact-redaction";
import { plainText } from "../content/plain-text";
import { conversationPartyKey } from "./notification-context";

type Party = { clientUserId: string | null; artistId: number | null; venueId: number | null };
type Booking = Party & { id: number; status: string; updatedAt: Date | string; clientName: string; clientPhone: string | null; clientEmail: string | null; message: string | null; artistReply: string | null; adminNotes: string | null; clientSignature: string | null; contractPdfUrl: string | null; priceOffers: Array<{ from: string; message?: string }> | null };
type Message = { bookingRequestId: number | null; conversationId: number | null; senderType: string; senderName: string; message: string; attachmentUrl: string | null; attachmentName: string | null; attachmentMime: string | null };
type Owner = { userId: string; artistIds: readonly number[]; venueIds: readonly number[] };
const text = (value: string | null) => value === null ? null : redactContact(plainText(value));

function vendorOwns(party: Party, owner: Owner) {
  return (!!party.artistId && owner.artistIds.includes(party.artistId))
    || (!!party.venueId && owner.venueIds.includes(party.venueId));
}

/** Preserve the account holder's own data; gate only the other party's contacts. */
export function bookingForDataExport<T extends Booking>(booking: T, owner: Owner): T {
  // Internal moderation notes never belong to a participant's export, even
  // when contacts are shared. Signed account-level agreements are separate.
  if (contactsAreShared(booking.status)) return { ...booking, adminNotes: null };
  const isClient = booking.clientUserId === owner.userId;
  const isVendor = vendorOwns(booking, owner);
  return {
    ...booking,
    adminNotes: null,
    clientSignature: isClient ? booking.clientSignature : null,
    // Booking PDFs contain both parties' details and follow the same access
    // rule as the booking contract endpoint, not the own-signature rule.
    contractPdfUrl: null,
    clientName: isClient ? booking.clientName : text(booking.clientName)!,
    clientPhone: isClient ? booking.clientPhone : null,
    clientEmail: isClient ? booking.clientEmail : null,
    message: isClient ? booking.message : text(booking.message),
    artistReply: isVendor ? booking.artistReply : text(booking.artistReply),
    priceOffers: booking.priceOffers?.map(offer => {
      const ownOffer = (offer.from === "client" && isClient) || (offer.from === "artist" && isVendor);
      return ownOffer || !offer.message ? offer : { ...offer, message: text(offer.message)! };
    }) ?? null,
  };
}

export function dataExportChatProjection<
  C extends Party & { id: number; lastMessagePreview: string | null },
  M extends Message,
>(conversations: C[], messages: M[], bookings: Booking[], owner: Owner): { conversations: C[]; messages: M[] } {
  const byId = new Map(bookings.map(booking => [booking.id, booking]));
  const latestByParty = new Map<string, Booking>();
  for (const booking of [...bookings].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() || b.id - a.id)) {
    const key = conversationPartyKey(booking.clientUserId, booking.artistId, booking.venueId);
    if (key && !latestByParty.has(key)) latestByParty.set(key, booking);
  }
  const byConversation = new Map(conversations.map(conversation => [conversation.id, conversation]));
  const linked = (party: Party) => latestByParty.get(conversationPartyKey(party.clientUserId, party.artistId, party.venueId) ?? "");
  return {
    conversations: conversations.map(conversation => contactsAreShared(linked(conversation)?.status ?? "") ? conversation : {
      ...conversation, lastMessagePreview: text(conversation.lastMessagePreview),
    }),
    messages: messages.map(message => {
      const booking = message.bookingRequestId ? byId.get(message.bookingRequestId) : undefined;
      const conversation = message.conversationId ? byConversation.get(message.conversationId) : undefined;
      const party = booking ?? conversation;
      const ownMessage = !!party && (
        (message.senderType === "client" && party.clientUserId === owner.userId)
        || (message.senderType === "artist" && !!party.artistId && owner.artistIds.includes(party.artistId))
        || (message.senderType === "venue" && !!party.venueId && owner.venueIds.includes(party.venueId))
      );
      const status = booking?.status ?? (conversation ? linked(conversation)?.status : undefined);
      return ownMessage ? message : chatMessageForViewer(message, contactsAreShared(status ?? ""));
    }),
  };
}
