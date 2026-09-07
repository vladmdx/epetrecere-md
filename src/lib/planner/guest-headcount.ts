/** One guest row may represent one adult, a couple, or a whole family. */
export interface GuestParty {
  guestType?: string | null;
  partySize?: number | null;
  kidsCount?: number | null;
  plusOnes?: number | null;
}

function nonNegativeInt(value: number | null | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value!)) : 0;
}

export function guestHeadcount(guest: GuestParty | null | undefined): number {
  if (!guest) return 0; // Deleted/missing guests must not occupy phantom seats.
  const adults = Math.max(1, nonNegativeInt(guest.partySize),
    guest.guestType === "couple" || guest.guestType === "family" ? 2 : 1);
  const children = nonNegativeInt(guest.kidsCount);
  // Migrated/imported legacy rows have the new defaults (single/1/0),
  // so presence of the new columns alone cannot identify the new model.
  const modernParty = adults > 1 || children > 0 || guest.guestType === "couple" || guest.guestType === "family";
  return modernParty ? adults + children : 1 + nonNegativeInt(guest.plusOnes);
}

export function assignedHeadcount(
  assignments: ReadonlyArray<{ guestId: number }>,
  guests: ReadonlyArray<GuestParty & { id: number }>,
): number {
  const byId = new Map(guests.map(guest => [guest.id, guest]));
  return [...new Set(assignments.map(seat => seat.guestId))]
    .reduce((sum, id) => sum + guestHeadcount(byId.get(id)), 0);
}

/** Exclude an existing placement of this same group before adding it back. */
export function fitsAtTable(
  capacity: number,
  occupants: ReadonlyArray<GuestParty & { id: number }>,
  incoming: GuestParty & { id: number },
): boolean {
  return occupants.filter(guest => guest.id !== incoming.id)
    .reduce((sum, guest) => sum + guestHeadcount(guest), guestHeadcount(incoming)) <= capacity;
}
