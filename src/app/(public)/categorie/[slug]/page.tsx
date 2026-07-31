import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCategoryBySlug } from "@/lib/db/queries/categories";
import { getArtists } from "@/lib/db/queries/artists";
import { generateMeta } from "@/lib/seo/generate-meta";
import { breadcrumbJsonLd, safeJsonLd } from "@/lib/seo/jsonld";
import { getLocalized } from "@/i18n";
import { CategoryPageClient } from "./client";
import { getServerLocale } from "@/lib/i18n/server-locale";

// M11 Intern #2 — ISR: category landings refresh every hour.
export const revalidate = 3600;

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return {};
  const locale = await getServerLocale();
  const name = getLocalized(category, "name", locale);
  const seoTitle = getLocalized(category, "seoTitle", locale);
  const seoDescription = getLocalized(category, "seoDesc", locale);

  return generateMeta({
    title: seoTitle || `${name}: evenimente în Moldova`,
    description: seoDescription || `${name} pentru nunți și evenimente în Chișinău și Republica Moldova în 2026.`,
    entity: category,
    path: `/categorie/${slug}`,
    locale,
  });
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;

  const category = await getCategoryBySlug(slug);
  if (!category) notFound();
  const locale = await getServerLocale();
  const localizedName = getLocalized(category, "name", locale);

  const filters = {
    categoryId: category.id,
    search: typeof sp.q === "string" ? sp.q : undefined,
    city: typeof sp.city === "string" ? sp.city : undefined,
    sort: (sp.sort as "popular" | "price_asc" | "price_desc" | "rating" | "newest") || "popular",
    page: sp.page ? Number(sp.page) : 1,
    priceMin: sp.price_min ? Number(sp.price_min) : undefined,
    priceMax: sp.price_max ? Number(sp.price_max) : undefined,
    ratingMin: sp.rating_min ? Number(sp.rating_min) : undefined,
    availableDate: typeof sp.date === "string" ? sp.date : undefined,
  };

  const result = await getArtists(filters);

  const breadcrumbs = [
    { name: locale === "ru" ? "Главная" : locale === "en" ? "Home" : "Acasă", url: "/" },
    {
      name: category.type === "service"
        ? locale === "ru" ? "Услуги" : locale === "en" ? "Services" : "Servicii"
        : locale === "ru" ? "Артисты" : locale === "en" ? "Artists" : "Artiști",
      url: category.type === "service" ? "/servicii" : "/artisti",
    },
    { name: localizedName, url: `/categorie/${slug}` },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd(breadcrumbs)) }}
      />
      <CategoryPageClient
        category={category}
        artists={result.items}
        total={result.total}
        page={result.page}
        totalPages={result.totalPages}
        currentSort={filters.sort}
        searchQuery={filters.search ?? ""}
        currentCity={filters.city ?? ""}
        currentPriceMin={sp.price_min ? String(sp.price_min) : ""}
        currentPriceMax={sp.price_max ? String(sp.price_max) : ""}
      />
    </>
  );
}
