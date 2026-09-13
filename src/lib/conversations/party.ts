export const CONVERSATION_PARTY_XOR = "CONVERSATION_PARTY_XOR" as const;

export type ConversationPartyXor =
  | { ok: true; artistId: number; venueId: null }
  | { ok: true; artistId: null; venueId: number }
  | { ok: false; code: typeof CONVERSATION_PARTY_XOR };

function exclusiveId(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

/** Exactly one of artistId / venueId must be a positive integer. Neither and both are rejected. */
export function resolveConversationPartyXor(
  artistId?: number | null,
  venueId?: number | null,
): ConversationPartyXor {
  const artist = exclusiveId(artistId);
  const venue = exclusiveId(venueId);
  if (artist != null && venue == null) {
    return { ok: true, artistId: artist, venueId: null };
  }
  if (venue != null && artist == null) {
    return { ok: true, artistId: null, venueId: venue };
  }
  return { ok: false, code: CONVERSATION_PARTY_XOR };
}

export function conversationHasExclusiveParty(
  row: { artistId?: number | null; venueId?: number | null },
): boolean {
  return resolveConversationPartyXor(row.artistId, row.venueId).ok;
}

export function vendorConversationPath(input: {
  artistId?: number | null;
  venueId?: number | null;
  conversationId: number;
  multiHallEnabled: boolean;
}): string | null {
  const party = resolveConversationPartyXor(input.artistId, input.venueId);
  if (!party.ok || !Number.isSafeInteger(input.conversationId) || input.conversationId <= 0) {
    return null;
  }
  if (party.artistId != null) {
    return `/dashboard/mesaje?conversation=${input.conversationId}`;
  }
  if (!input.multiHallEnabled) {
    return `/dashboard/sala/mesaje?conversation=${input.conversationId}`;
  }
  return `/dashboard/locatii/${party.venueId}/mesaje?conversation=${input.conversationId}`;
}

export function clientConversationPath(conversationId: number): string {
  return `/cabinet/mesaje?conversation=${conversationId}`;
}
