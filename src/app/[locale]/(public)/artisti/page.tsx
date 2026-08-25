import { auth } from "@clerk/nextjs/server";
import { getArtists } from "@/lib/db/queries/artists";
import { getAllCategories } from "@/lib/db/queries/categories";
import { metaForPath } from "@/lib/seo/page-meta";
import { breadcrumbJsonLd, itemListJsonLd, safeJsonLd } from "@/lib/seo/jsonld";
import { ArtistsListClient } from "./client";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const meta = {
    ro: ["Artiști pentru Evenimente în Chișinău și Moldova", "Descoperă artiști, DJ, formații și prezentatori pentru nunți și evenimente în Chișinău și Republica Moldova în 2026."],
    ru: ["Артисты на события в Кишиневе и Молдове", "Найдите артистов, DJ, группы и ведущих для свадеб и событий в Кишиневе и Молдове в 2026 году."],
    en: ["Event Artists in Chișinău and Moldova", "Discover artists, DJs, bands and hosts for weddings and events in Chișinău and Moldova in 2026."],
  }[locale];
  return metaForPath("/artisti", {
    title: meta[0],
    description: meta[1],
  }, locale);
}

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ArtistsPage({ params, searchParams }: Props) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const sp = await searchParams;

  const filters = {
    search: (sp.q as string) || undefined,
    categoryId: sp.category ? Number(sp.category) : undefined,
    // City filter — passed by the homepage search bar. Matches base_city
    // OR travel_distance_km>=999 (artists who cover all Moldova).
    city: (sp.city as string) || undefined,
    sort: (sp.sort as "popular" | "price_asc" | "price_desc" | "rating" | "newest") || "popular",
    page: sp.page ? Number(sp.page) : 1,
    priceMin: sp.price_min ? Number(sp.price_min) : undefined,
    priceMax: sp.price_max ? Number(sp.price_max) : undefined,
    ratingMin: sp.rating_min ? Number(sp.rating_min) : undefined,
    // Availability filter — when present we exclude artists booked/blocked on
    // that date via the calendar_events join in getArtists().
    availableDate: (sp.date as string) || undefined,
  };

  const [result, cats] = await Promise.all([
    getArtists(filters),
    getAllCategories(),
  ]);

  // M0a #8 — redact price for unauthenticated visitors at the server layer.
  const { userId } = await auth();
  const items = userId
    ? result.items
    : result.items.map((a) => ({ ...a, priceFrom: null }));

  const jsonLdItems = result.items.slice(0, 20).map((a) => ({
    name: locale === "ru" ? a.nameRu || a.nameRo : locale === "en" ? a.nameEn || a.nameRo : a.nameRo,
    url: `https://epetrecere.md/artisti/${a.slug}`,
  }));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(breadcrumbJsonLd([
            { name: locale === "ru" ? "Главная" : locale === "en" ? "Home" : "Acasă", url: "https://epetrecere.md" },
            { name: locale === "ru" ? "Артисты" : locale === "en" ? "Artists" : "Artiști", url: "https://epetrecere.md/artisti" },
          ])),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(itemListJsonLd(jsonLdItems, locale === "ru" ? "Артисты на события" : locale === "en" ? "Event Artists" : "Artiști pentru Evenimente")),
        }}
      />
    <ArtistsListClient
      artists={items}
      total={result.total}
      page={result.page}
      totalPages={result.totalPages}
      currentSort={filters.sort}
      searchQuery={(sp.q as string) || ""}
      categories={cats.map((c) => ({ id: c.id, slug: c.slug, nameRo: c.nameRo, nameRu: c.nameRu, nameEn: c.nameEn }))}
      currentCategory={(sp.category as string) || ""}
      currentPriceMin={(sp.price_min as string) || ""}
      currentPriceMax={(sp.price_max as string) || ""}
    />
    </>
  );
}
