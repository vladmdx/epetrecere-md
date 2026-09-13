import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookingRequests, conversations } from "@/lib/db/schema";
import {
  CONVERSATION_PARTY_XOR,
  resolveConversationPartyXor,
} from "./party";

export async function findOrCreateConversation(input: {
  clientUserId: string;
  artistId?: number | null;
  venueId?: number | null;
}): Promise<
  | { ok: true; id: number; created: boolean }
  | { ok: false; code: typeof CONVERSATION_PARTY_XOR }
> {
  const party = resolveConversationPartyXor(input.artistId, input.venueId);
  if (!party.ok) return { ok: false, code: CONVERSATION_PARTY_XOR };

  const [existing] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.clientUserId, input.clientUserId),
        party.artistId != null
          ? eq(conversations.artistId, party.artistId)
          : eq(conversations.venueId, party.venueId),
        party.artistId != null
          ? isNull(conversations.venueId)
          : isNull(conversations.artistId),
      ),
    )
    .limit(1);
  if (existing) return { ok: true, id: existing.id, created: false };

  const [created] = await db
    .insert(conversations)
    .values({
      clientUserId: input.clientUserId,
      artistId: party.artistId,
      venueId: party.venueId,
    })
    .returning({ id: conversations.id });
  return { ok: true, id: created.id, created: true };
}

export async function findOrCreateConversationForBooking(
  bookingRequestId: number,
): Promise<number | null> {
  const [booking] = await db
    .select({
      clientUserId: bookingRequests.clientUserId,
      artistId: bookingRequests.artistId,
      venueId: bookingRequests.venueId,
    })
    .from(bookingRequests)
    .where(eq(bookingRequests.id, bookingRequestId))
    .limit(1);
  if (!booking?.clientUserId) return null;
  const result = await findOrCreateConversation({
    clientUserId: booking.clientUserId,
    artistId: booking.artistId,
    venueId: booking.venueId,
  });
  return result.ok ? result.id : null;
}
