import { VenueSidebar } from "@/components/vendor/venue-sidebar";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, isLocale, localizePath } from "@/lib/i18n/routing";
import { requireLocatieVenue, venueDashboardBase } from "@/lib/venues/dashboard-scope";
import { salaUsesLegacyLayout } from "@/lib/partner/multi-hall-gate";
import { requireVenueCapability } from "@/lib/venue-access";

export default async function LocatieDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; venueId: string }>;
}) {
  const { locale: rawLocale, venueId } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  if (salaUsesLegacyLayout()) {
    redirect(localizePath("/dashboard/sala", locale));
  }
  const venue = await requireLocatieVenue(venueId, locale);
  const financialAccess = await requireVenueCapability(
    venue.id,
    "manage_financials",
  );

  return (
    <div className="flex h-dvh overflow-hidden">
      <VenueSidebar
        venueName={venue.nameRo}
        venueSlug={venue.slug}
        isActive={venue.isActive}
        basePath={venueDashboardBase(venue.id)}
        canManageFinancials={financialAccess.ok}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <AdminTopbar />
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
