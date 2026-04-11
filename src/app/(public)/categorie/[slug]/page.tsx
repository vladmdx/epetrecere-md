import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCategoryBySlug } from "@/lib/db/queries/categories";
import { getArtists } from "@/lib/db/queries/artists";
import { generateMeta } from "@/lib/seo/generate-meta";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { getLocalized } from "@/i18n";
import { CategoryPageClient } from "./client";

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

  return generateMeta({
    title: `${category.nameRo} — Evenimente Moldova`,
    description: category.seoDescRo || `Descoperă ${category.nameRo?.toLowerCase()} pentru evenimente în Moldova`,
    entity: category,
    path: `/categorie/${slug}`,
  });
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;

  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const filters = {
    categoryId: category.id,
    sort: (sp.sort as "popular" | "price_asc" | "price_desc" | "rating" | "newest") || "popular",
    page: sp.page ? Number(sp.page) : 1,
    priceMin: sp.price_min ? Number(sp.price_min) : undefined,
    priceMax: sp.price_max ? Number(sp.price_max) : undefined,
    ratingMin: sp.rating_min ? Number(sp.rating_min) : undefined,
  };

  const result = await getArtists(filters);

  const breadcrumbs = [
    { name: "Acasă", url: "/" },
    { name: "Categorii", url: "/artisti" },
    { name: getLocalized(category, "name", "ro"), url: `/categorie/${slug}` },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(breadcrumbs)) }}
      />
      <CategoryPageClient
        category={category}
        artists={result.items}
        total={result.total}
        page={result.page}
        totalPages={result.totalPages}
        currentSort={filters.sort}
      />
    </>
  );
}
