import { notFound } from "next/navigation";
import Link from "@/components/shared/locale-link";
import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { getArtists } from "@/lib/db/queries/artists";
import { getCategoryBySlug, getAllCategories } from "@/lib/db/queries/categories";
import { generateMeta } from "@/lib/seo/generate-meta";
import { breadcrumbJsonLd, safeJsonLd } from "@/lib/seo/jsonld";
import { getCityBySlug, getCityLocalizedName, CITIES } from "@/lib/seo/cities";
import { cityNameAfterIn } from "@/lib/seo/city-grammar";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";
import { plural } from "@/lib/i18n/plural";
import { getLocalized, t } from "@/i18n";
import { ArtistCard } from "@/components/public/artist-card";

// M2 — City × Category SEO landing page.
// URL: /artisti/in/[city]/[category]
//   e.g. /artisti/in/chisinau/fotografi

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://epetrecere.md";

/** The count in the title has to agree with its noun in each language. */
const PROFESSIONALS = {
  ro: { one: "profesionist", few: "profesioniști", many: "profesioniști" },
  ru: { one: "специалист", few: "специалиста", many: "специалистов" },
  en: { one: "professional", other: "professionals" },
};

interface Props {
  params: Promise<{ locale: string; city: string; category: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, city: citySlug, category: categorySlug } =
    await params;
  const city = getCityBySlug(citySlug);
  const category = await getCategoryBySlug(categorySlug);
  if (!city || !category) return {};

  const { total } = await getArtists({
    categoryId: category.id,
    cityKeywords: city.keywords,
    limit: 1,
  });

  // Category and city are data (both carry ru/en columns); the sentence that
  // frames them is what gets translated.
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const catName = getLocalized(category, "name", locale);
  const cityName = cityNameAfterIn(city, locale);
  const pros = plural(total, locale, PROFESSIONALS);
  const copy = {
    ro: {
      title: `${catName} în ${cityName} — ${pros}`,
      description: `Top ${catName.toLowerCase()} în ${cityName} pentru nuntă, botez și evenimente corporate. Compară prețuri și recenzii, apoi rezervă online.`,
    },
    ru: {
      title: `${catName} в ${cityName} — ${pros}`,
      description: `${catName} в ${cityName} для свадьбы, крестин и корпоратива. Сравните цены и отзывы, забронируйте онлайн на ePetrecere.md.`,
    },
    en: {
      title: `${catName} in ${cityName} — ${pros}`,
      description: `${catName} in ${cityName} for weddings, christenings and corporate events. Compare prices and reviews, then book online.`,
    },
  }[locale];

  return generateMeta({
    title: copy.title,
    description: copy.description,
    path: `/artisti/in/${citySlug}/${categorySlug}`,
    locale,
  });
}

export async function generateStaticParams() {
  // Deliberately empty: nothing in this route is enumerated at build time.
  //
  // Building every one of these up front meant 1537 pages, each opening
  // queries against a database in another region, on a two-core builder.
  // Whichever page happened to be rendering when the shared connection pool
  // ran dry would wait rather than fail — postgres.js queues instead of
  // erroring — and Next.js would eventually kill it and take the whole
  // deploy with it. The page that died moved every attempt, which is how the
  // contention gave itself away.
  //
  // `dynamicParams` defaults to true, so every slug still resolves; the page
  // is simply rendered on its first request and then cached under the
  // `revalidate` below, which is where all but the first visitor was already
  // being served from. What this costs is one slow request per page after a
  // deploy. What it buys is a build that finishes.
  return [];
}

export default async function CityCategoryPage({ params, searchParams }: Props) {
  const { locale: rawLocale, city: citySlug, category: categorySlug } =
    await params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const city = getCityBySlug(citySlug);
  const category = await getCategoryBySlug(categorySlug);
  if (!city || !category) notFound();

  // Category and city names are data — the sentence around them is the copy.
  const catName = getLocalized(category, "name", locale);
  const catNameLower = catName.toLowerCase();
  const cityName = getCityLocalizedName(city, locale);
  const cityAfterIn = cityNameAfterIn(city, locale);

  const sp = await searchParams;
  const page = sp.page ? Number(sp.page) : 1;

  const { items: artistsList, total, totalPages } = await getArtists({
    categoryId: category.id,
    cityKeywords: city.keywords,
    sort: (sp.sort as "popular" | "price_asc" | "price_desc" | "rating" | "newest") || "popular",
    page,
    limit: 24,
  });

  // M0a #8 price gating at SSR.
  const { userId } = await auth();
  const safeArtists = userId
    ? artistsList
    : artistsList.map((a) => ({ ...a, priceFrom: null, phone: null, email: null, instagram: null }));

  const breadcrumbs = [
    { name: t("nav.home", locale), url: "/" },
    { name: t("nav.artists", locale), url: "/artisti" },
    { name: cityName, url: `/artisti/in/${citySlug}` },
    { name: catName, url: `/artisti/in/${citySlug}/${categorySlug}` },
  ];

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: t("cityCategory.heading", locale, { category: catName, city: cityAfterIn }),
    numberOfItems: total,
    itemListElement: safeArtists.slice(0, 10).map((a, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${BASE_URL}/artisti/${a.slug}`,
      name: a.nameRo,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd(breadcrumbs)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(itemList) }}
      />

      <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        <nav className="mb-4 text-xs text-muted-foreground">
          <Link href="/" className="hover:text-gold">{t("nav.home", locale)}</Link>
          <span className="mx-2">/</span>
          <Link href="/artisti" className="hover:text-gold">{t("nav.artists", locale)}</Link>
          <span className="mx-2">/</span>
          <Link href={`/artisti/in/${citySlug}`} className="hover:text-gold">{cityName}</Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">{catName}</span>
        </nav>

        <header className="mb-8">
          <h1 className="font-heading text-3xl font-bold md:text-4xl">
            {t("cityCategory.heading", locale, {
              category: catName,
              city: cityAfterIn,
            })}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">
            {total > 0
              ? t("cityCategory.intro", locale, {
                  total,
                  category: catNameLower,
                  city: cityAfterIn,
                })
              : t("cityCategory.empty", locale, {
                  category: catNameLower,
                  city: cityAfterIn,
                })}
          </p>
        </header>

        {safeArtists.length === 0 ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-dashed border-border/40 bg-card py-16 text-center">
              <p className="text-muted-foreground">
                {t("cityCategory.none", locale, {
                  category: catNameLower,
                  city: cityAfterIn,
                })}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm">
                <a href={`/categorie/${categorySlug}`} className="text-gold hover:underline">
                  {t("cityCategory.viewAllCategory", locale, { category: catNameLower })}
                </a>
                <span className="text-muted-foreground">·</span>
                <a href={`/artisti/in/${citySlug}`} className="text-gold hover:underline">
                  {t("cityCategory.viewAllCity", locale, { city: cityName })}
                </a>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {safeArtists.map((a) => (
              <ArtistCard key={a.id} artist={a} />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-10 flex items-center justify-center gap-2">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <a
                key={p}
                href={`/artisti/in/${citySlug}/${categorySlug}?page=${p}`}
                className={`rounded-md border px-3 py-1.5 text-sm ${p === page ? "border-gold bg-gold text-[#0D0D0D]" : "border-border/40 hover:border-gold/40"}`}
              >
                {p}
              </a>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
