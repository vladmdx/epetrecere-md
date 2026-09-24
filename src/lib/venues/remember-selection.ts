"use server";

import { requireVenueAccess } from "@/lib/venue-access";
import { writeLastVenueCookie } from "./last-selected";

/** A navigation preference only: always re-authorize the client-supplied id. */
export async function rememberVenueSelection(venueId: number): Promise<boolean> {
  if (!Number.isSafeInteger(venueId) || venueId <= 0) return false;
  const access = await requireVenueAccess(venueId);
  if (!access.ok) return false;
  await writeLastVenueCookie(venueId);
  return true;
}
