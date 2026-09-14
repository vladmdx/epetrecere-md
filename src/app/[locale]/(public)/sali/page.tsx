import { auth } from "@clerk/nextjs/server";
import { getVenues } from "@/lib/db/queries/venues";
import { metaForPath } from "@/lib/seo/page-meta";
import { breadcrumbJsonLd, itemListJsonLd, safeJsonLd } from "@/lib/seo/jsonld";
import { VenuesListClient } from "./client";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";
import { t } from "@/i18n";
import { catalogSortForPrices, parseCatalogFilters } from "@/lib/venues/catalog-filters";

// Filters and authenticated price visibility make the response request-specific.
// Never cache this HTML across users.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const meta = {
    ro: ["Săli de Nuntă și Restaurante în Chișinău, Moldova", "Compară săli de nuntă, restaurante și locații pentru evenimente în Chișinău și Republica Moldova în 2026."],
    ru: ["Свадебные залы и рестораны Кишинева, Молдова", "Сравните свадебные залы, рестораны и площадки для событий в Кишиневе и Молдове в 2026 году."],
    en: ["Wedding Venues and Restaurants in Chișinău, Moldova", "Compare wedding venues, restaurants and event locations in Chișinău and Moldova in 2026."],
  }[locale];
  return metaForPath("/sali", {
    title: meta[0],
    description: meta[1],
  }, locale);
}

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function VenuesPage({ params, searchParams }: Props) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const sp = await searchParams;

  // The homepage hero search already sends `?date=` here (hero-search.tsx),
  // and getVenues excludes venues booked or blocked that day — the page just
  // never read it, so the filter silently did nothing and the cards claimed
  // availability nobody had checked. Anything that is not a calendar date is
  // dropped rather than handed to the calendar_events subquery.
  const { userId } = await auth();
  const revealPrices = Boolean(userId);
  const parsed = parseCatalogFilters({
    guest_count: sp.guest_count ?? sp.capacity_min,
    date: sp.date,
    start: sp.start ?? sp.start_time,
    end: sp.end ?? sp.end_time,
    price_max: revealPrices ? sp.price_max : undefined,
    sort: sp.sort,
    page: sp.page,
  });

  const filters = {
    city: (sp.city as string) || undefined,
    capacityMin: parsed.guestCount,
    guestCount: parsed.guestCount,
    availableDate: parsed.date,
    startTime: parsed.startTime,
    endTime: parsed.endTime,
    sort: catalogSortForPrices(parsed.sort, revealPrices),
    page: parsed.page,
    revealPrices,
    priceMax: revealPrices ? parsed.priceMax : undefined,
  };

  const result = parsed.invalidFields.length
    ? { items: [], total: 0, page: parsed.page, totalPages: 0 }
    : await getVenues(filters);

  // M0a #8 — gate price per person behind login at the server layer.
  const items = publicCatalogData(result.items, revealPrices);

  // Extract unique cities from results for filter pills
  const allCities = Array.from(new Set(result.items.map((v) => v.city).filter(Boolean) as string[])).sort();

  const jsonLdItems = result.items.slice(0, 20).map((v) => ({
    name: locale === "ru" ? v.nameRu || v.nameRo : locale === "en" ? v.nameEn || v.nameRo : v.nameRo,
    url: `https://epetrecere.md/sali/${v.slug}`,
  }));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(breadcrumbJsonLd([
            { name: t("nav.home", locale), url: "https://epetrecere.md" },
            { name: t("venuesPage.breadcrumb", locale), url: "https://epetrecere.md/sali" },
          ])),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(itemListJsonLd(jsonLdItems, t("venuesPage.itemListName", locale))),
        }}
      />
      <VenuesListClient
        venues={items}
        total={result.total}
        page={result.page}
        totalPages={result.totalPages}
        currentSort={filters.sort}
        cities={allCities}
        currentCity={(sp.city as string) || ""}
        currentCapacityMin={parsed.guestCount != null ? String(parsed.guestCount) : ""}
        currentDate={parsed.date ?? ""}
      />
    </>
  );
}
import { publicCatalogData } from "@/lib/privacy/public-catalog";
