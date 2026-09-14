type CommercialSnapshot = Record<string, unknown> | null | undefined;

export type BookingContractVendorIdentity = {
  vendorKind: "artist" | "sala";
  vendorName: string;
  venueName: string | null;
  hallName: string | null;
};

export type BookingContractBasis = {
  bookingId: number;
  /** Internal FK identity used only for race revalidation, never rendered. */
  vendorArtistId: number | null;
  /** Internal FK identity used only for race revalidation, never rendered. */
  vendorVenueId: number | null;
  clientUserId: string | null;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  vendorName: string;
  vendorKind: "artist" | "sala";
  venueName: string | null;
  hallName: string | null;
  vendorEmail: string | null;
  vendorPhone: string | null;
  eventDate: string;
  eventType: string | null;
  startTime: string | null;
  endTime: string | null;
  guestCount: number | null;
  agreedPrice: number | null;
  message: string | null;
};

type BookingContractSource = {
  id: number;
  artistId: number | null;
  artistNameSnapshot: string | null;
  venueId: number | null;
  commercialSnapshot: CommercialSnapshot;
  clientUserId: string | null;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  eventDate: string;
  eventType: string | null;
  startTime: string | null;
  endTime: string | null;
  guestCount: number | null;
  agreedPrice: number | null;
  message: string | null;
};

function snapshotText(snapshot: CommercialSnapshot, key: string): string | null {
  const value = snapshot?.[key];
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

/**
 * Contract display identity is historical evidence, so it must never follow a
 * later profile rename. Venue and hall names come only from the commercial
 * snapshot frozen at confirmation; artist names use the equivalent dedicated
 * snapshot column.
 */
export function bookingContractVendorIdentity(input: {
  artistId: number | null;
  artistNameSnapshot: string | null;
  venueId: number | null;
  commercialSnapshot: CommercialSnapshot;
}): BookingContractVendorIdentity {
  const artistNameSnapshot = input.artistNameSnapshot?.trim() || null;
  // ON DELETE SET NULL intentionally removes artist_id while retaining the
  // historical name snapshot. That snapshot is therefore also the durable
  // discriminator between a deleted artist and a venue booking.
  if (
    input.artistId != null
    || (input.venueId == null && artistNameSnapshot != null)
  ) {
    const artistName = artistNameSnapshot || "Artist";
    return {
      vendorKind: "artist",
      vendorName: artistName,
      venueName: null,
      hallName: null,
    };
  }

  const venueName = snapshotText(input.commercialSnapshot, "venueName") ?? "Local";
  const hallName = snapshotText(input.commercialSnapshot, "hallName") ?? "Sală";
  return {
    vendorKind: "sala",
    vendorName: `${venueName} · ${hallName}`,
    venueName,
    hallName,
  };
}

export function bookingContractBasis(
  booking: BookingContractSource,
  contacts: { vendorEmail: string | null; vendorPhone: string | null },
): BookingContractBasis {
  const vendor = bookingContractVendorIdentity(booking);
  return {
    bookingId: booking.id,
    vendorArtistId: booking.artistId,
    vendorVenueId: booking.venueId,
    clientUserId: booking.clientUserId,
    clientName: booking.clientName,
    clientPhone: booking.clientPhone,
    clientEmail: booking.clientEmail,
    ...vendor,
    vendorEmail: contacts.vendorEmail,
    vendorPhone: contacts.vendorPhone,
    eventDate: booking.eventDate,
    eventType: booking.eventType,
    startTime: booking.startTime,
    endTime: booking.endTime,
    guestCount: booking.guestCount,
    agreedPrice: booking.agreedPrice,
    message: booking.message,
  };
}

export function bookingContractClientMatches(
  booking: Pick<BookingContractSource, "clientUserId" | "clientEmail">,
  user: { id: string; email: string | null },
): boolean {
  if (booking.clientUserId) return booking.clientUserId === user.id;
  return Boolean(
    user.email
      && booking.clientEmail
      && user.email.trim().toLowerCase() === booking.clientEmail.trim().toLowerCase(),
  );
}

export function sameBookingContractBasis(
  prepared: BookingContractBasis,
  current: BookingContractBasis,
): boolean {
  // Every field rendered into the signed bytes is part of the basis. Contact
  // edits racing the render must invalidate it instead of committing a PDF
  // whose vendor party differs from the final revalidated row.
  const keys = Object.keys(prepared) as Array<keyof BookingContractBasis>;
  return keys.every((key) => prepared[key] === current[key]);
}

export type BookingContractCommitDecision =
  | "sign"
  | "unauthorized"
  | "booking_changed"
  | "already_signed";

/** Pure decision used by the locked commit and race regression tests. */
export function bookingContractCommitDecision(input: {
  prepared: BookingContractBasis;
  current: BookingContractBasis;
  authenticatedClient: boolean;
  currentStatus: string;
  currentSignedAt: Date | null;
}): BookingContractCommitDecision {
  if (!input.authenticatedClient) return "unauthorized";
  if (!['confirmed_by_client', 'completed'].includes(input.currentStatus)) {
    return "booking_changed";
  }
  if (input.currentSignedAt) return "already_signed";
  return sameBookingContractBasis(input.prepared, input.current)
    ? "sign"
    : "booking_changed";
}
