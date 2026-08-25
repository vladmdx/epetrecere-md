import { auth } from "@clerk/nextjs/server";
import { getVenues } from "@/lib/db/queries/venues";
import { metaForPath } from "@/lib/seo/page-meta";
import { breadcrumbJsonLd, itemListJsonLd, safeJsonLd } from "@/lib/seo/jsonld";
import { VenuesListClient } from "./client";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";
import { t } from "@/i18n";

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
  const rawDate = typeof sp.date === "string" ? sp.date : "";
  const availableDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : undefined;

  const filters = {
    city: (sp.city as string) || undefined,
    capacityMin: sp.capacity_min ? Number(sp.capacity_min) : undefined,
    availableDate,
    sort: (sp.sort as "popular" | "price_asc" | "price_desc" | "rating" | "capacity") || "popular",
    page: sp.page ? Number(sp.page) : 1,
  };

  const result = await getVenues(filters);

  // M0a #8 — gate price per person behind login at the server layer.
  const { userId } = await auth();
  const items = userId
    ? result.items
    : result.items.map((v) => ({ ...v, pricePerPerson: null }));

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
        currentCapacityMin={(sp.capacity_min as string) || ""}
        currentDate={availableDate ?? ""}
      />
    </>
  );
}
