"use client";

import { useEffect } from "react";
import { rememberVenueSelection } from "@/lib/venues/remember-selection";

/** Cookie writes must run as a client-invoked action, never during SSR. */
export function RememberVenueSelection({ venueId }: { venueId: number }) {
  useEffect(() => {
    // A failed convenience-cookie write must not block the authorized dashboard.
    void rememberVenueSelection(venueId).catch(() => undefined);
  }, [venueId]);
  return null;
}
