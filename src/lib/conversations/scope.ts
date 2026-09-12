/** Conversation belongs to the selected venue when a venueId query is present. */
export function conversationMatchesVenueScope(
  convVenueId: number | null,
  scopedVenueId?: number | null,
): boolean {
  if (scopedVenueId == null || scopedVenueId <= 0) return true;
  return convVenueId === scopedVenueId;
}
