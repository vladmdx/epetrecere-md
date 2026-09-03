// Venue bookings — spec section 3.
//
// Four tabs (Noi / Acceptate / Finalizate / Anulate) over the unified
// booking_requests table filtered by venueId.

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, venues } from "@/lib/db/schema";
import {
  getVenueBookings,
  getVenueBookingCounts,
  type VenueBookingTab,
} from "@/lib/db/queries/venue-bookings";
import { VenueBookingsClient } from "./client";

export const dynamic = "force-dynamic";

const VALID_TABS: VenueBookingTab[] = [
  "noi",
  "acceptate",
  "finalizate",
  "anulate",
];

export default async function VenueBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in?redirect_url=/dashboard/sala/rezervari");

  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) redirect("/");

  const [venue] = await db
    .select({
      id: venues.id,
      capacityMax: venues.capacityMax,
    })
    .from(venues)
    .where(eq(venues.userId, appUser.id))
    .limit(1);
  if (!venue) redirect("/dashboard");

  const sp = await searchParams;
  const rawTab = sp.tab?.toLowerCase();
  const currentTab: VenueBookingTab = (VALID_TABS as string[]).includes(
    rawTab ?? "",
  )
    ? (rawTab as VenueBookingTab)
    : "noi";

  const [bookings, counts] = await Promise.all([
    getVenueBookings(venue.id, currentTab),
    getVenueBookingCounts(venue.id),
  ]);

  return (
    <VenueBookingsClient
      venueId={venue.id}
      venueCapacityMax={venue.capacityMax}
      initialTab={currentTab}
      initialBookings={bookings.map((b) => ({
        ...b,
        clientConfirmedAt: b.clientConfirmedAt?.toISOString() ?? null,
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
      }))}
      counts={counts}
    />
  );
}
