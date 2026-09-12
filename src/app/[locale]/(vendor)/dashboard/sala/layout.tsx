import { headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";
import { redirectLegacySalaPath } from "@/lib/venues/dashboard-scope";

export default async function VenueDashboardLegacyLayout({
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const pathname = (await headers()).get("x-pathname") || "/dashboard/sala";
  const restPath = pathname.replace(/^\/dashboard\/sala/, "") || "";
  const requested = Number(new URLSearchParams(pathname.split("?")[1] ?? "").get("venueId"));
  await redirectLegacySalaPath({
    locale,
    restPath,
    requestedVenueId: Number.isFinite(requested) ? requested : null,
  });
}
