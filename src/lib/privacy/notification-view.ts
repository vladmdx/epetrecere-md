import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "../db";
import { artists, bookingRequests, conversations, users, venues } from "../db/schema";
import { contactsAreShared } from "./booking-contact";
import { conversationPartyKey, notificationContext, notificationForViewer, notificationHasContact, type NotificationText } from "./notification-context";

/** Read projection only: never rewrites notification/chat history or sends mail. */
export async function notificationsForUser<T extends NotificationText>(items: T[], userId: string): Promise<T[]> {
  if (!items.some(notificationHasContact)) return items;
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (user?.role === "admin" || user?.role === "super_admin") return items;

  const contexts = items.map(item => notificationContext(item.actionUrl));
  const conversationIds = [...new Set(contexts.filter(c => c?.kind === "conversation").map(c => c!.id))];
  const bookingIds = [...new Set(contexts.filter(c => c?.kind === "booking").map(c => c!.id))];
  const ownedConversations = conversationIds.length ? await db.select({
    id: conversations.id, clientUserId: conversations.clientUserId,
    artistId: conversations.artistId, venueId: conversations.venueId,
  }).from(conversations)
    .leftJoin(artists, eq(artists.id, conversations.artistId))
    .leftJoin(venues, eq(venues.id, conversations.venueId))
    .where(and(inArray(conversations.id, conversationIds), or(
      eq(conversations.clientUserId, userId), eq(artists.userId, userId), eq(venues.userId, userId),
    ))) : [];

  const targets = [
    ...(bookingIds.length ? [inArray(bookingRequests.id, bookingIds)] : []),
    ...ownedConversations.filter(conv => conversationPartyKey(conv.clientUserId, conv.artistId, conv.venueId)).map(conv => and(
      eq(bookingRequests.clientUserId, conv.clientUserId),
      conv.artistId ? eq(bookingRequests.artistId, conv.artistId) : eq(bookingRequests.venueId, conv.venueId!),
    )),
  ];
  const relatedBookings = targets.length ? await db.select({
    id: bookingRequests.id, clientUserId: bookingRequests.clientUserId,
    artistId: bookingRequests.artistId, venueId: bookingRequests.venueId, status: bookingRequests.status,
  }).from(bookingRequests)
    .leftJoin(artists, eq(artists.id, bookingRequests.artistId))
    .leftJoin(venues, eq(venues.id, bookingRequests.venueId))
    .where(and(or(...targets), or(
      eq(bookingRequests.clientUserId, userId), eq(artists.userId, userId), eq(venues.userId, userId),
    )))
    .orderBy(desc(bookingRequests.updatedAt), desc(bookingRequests.id)) : [];

  const bookingStatus = new Map(relatedBookings.map(booking => [booking.id, booking.status]));
  const latestPairStatus = new Map<string, string>();
  for (const booking of relatedBookings) {
    const key = conversationPartyKey(booking.clientUserId, booking.artistId, booking.venueId);
    if (key && !latestPairStatus.has(key)) latestPairStatus.set(key, booking.status);
  }
  const conversationStatus = new Map(ownedConversations.map(conv => [
    conv.id,
    latestPairStatus.get(conversationPartyKey(conv.clientUserId, conv.artistId, conv.venueId) ?? "") ?? "",
  ]));
  return items.map((item, index) => {
    const context = contexts[index];
    const status = context?.kind === "booking" ? bookingStatus.get(context.id)
      : context?.kind === "conversation" ? conversationStatus.get(context.id) : null;
    return notificationForViewer(item, !!status && contactsAreShared(status));
  });
}
