import { HallEditor } from "@/components/vendor/hall-editor";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";
import { requireLocatieVenue } from "@/lib/venues/dashboard-scope";

export const dynamic = "force-dynamic";

export default async function LocatieHallPage({
  params,
}: {
  params: Promise<{ locale: string; venueId: string; hallId: string }>;
}) {
  const { locale: raw, venueId, hallId } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const venue = await requireLocatieVenue(venueId, locale);
  return <HallEditor venueId={venue.id} hallId={Number(hallId)} />;
}
