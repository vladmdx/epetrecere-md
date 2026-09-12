import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, venues } from "@/lib/db/schema";
import { getVenueBookings, getVenueBookingCounts, type VenueBookingTab } from "@/lib/db/queries/venue-bookings";
import { VenueBookingsClient } from "../../../sala/rezervari/client";
import { DEFAULT_LOCALE, isLocale, localizePath } from "@/lib/i18n/routing";
import { requireLocatieVenue, venueDashboardBase } from "@/lib/venues/dashboard-scope";

export const dynamic = "force-dynamic";

const VALID_TABS: VenueBookingTab[] = ["noi", "acceptate", "finalizate", "anulate"];

export default async function LocatieBookingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; venueId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale: rawLocale, venueId: venueIdRaw } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const scoped = await requireLocatieVenue(venueIdRaw, locale);
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    redirect(`${localizePath("/sign-in", locale)}?redirect_url=${encodeURIComponent(localizePath(`${venueDashboardBase(scoped.id)}/rezervari`, locale))}`);
  }
  const [appUser] = await db.select({ id: users.id }).from(users).where(eq(users.clerkId, clerkId)).limit(1);
  if (!appUser) redirect(localizePath("/", locale));

  const [venue] = await db
    .select({ id: venues.id, capacityMax: venues.capacityMax })
    .from(venues)
    .where(eq(venues.id, scoped.id))
    .limit(1);
  if (!venue) redirect(localizePath("/dashboard/locatii", locale));

  const sp = await searchParams;
  const rawTab = sp.tab?.toLowerCase();
  const currentTab: VenueBookingTab = (VALID_TABS as string[]).includes(rawTab ?? "")
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
      basePath={`${venueDashboardBase(venue.id)}/rezervari`}
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
