import { HallsManager } from "@/components/vendor/halls-manager";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";
import { requireLocatieVenue } from "@/lib/venues/dashboard-scope";

export const dynamic = "force-dynamic";

export default async function LocatieHallsPage({
  params,
}: {
  params: Promise<{ locale: string; venueId: string }>;
}) {
  const { locale: raw, venueId } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const venue = await requireLocatieVenue(venueId, locale);
  return <HallsManager venueId={venue.id} venueName={venue.nameRo} />;
}
