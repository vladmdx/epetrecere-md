export type ArtistBookingTab = "active" | "accepted" | "past";

export function parseBookingDeepLinkId(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function artistBookingTab(status: string): ArtistBookingTab | null {
  if (status === "pending") return "active";
  if (status === "accepted" || status === "confirmed_by_client") return "accepted";
  if (["completed", "cancelled", "rejected"].includes(status)) return "past";
  return null;
}

/** The URL is not authorization: only resolve rows in the owner's loaded list. */
export function artistBookingDeepLink(value: string | null, ownedBookings: readonly { id: number; status: string }[]) {
  const id = parseBookingDeepLinkId(value);
  const booking = id === null ? undefined : ownedBookings.find(row => row.id === id);
  const tab = booking ? artistBookingTab(booking.status) : null;
  return booking && tab ? { id: booking.id, tab } : null;
}

export function bookingChatErrorKey(payload: unknown) {
  return payload !== null && typeof payload === "object" && "code" in payload && payload.code === "CONTACT_LOCKED"
    ? "vendor.bookingsPage.toastContactLocked"
    : "vendor.bookingsPage.toastMessageError";
}
