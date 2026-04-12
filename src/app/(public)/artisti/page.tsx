import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { getArtists } from "@/lib/db/queries/artists";
import { getAllCategories } from "@/lib/db/queries/categories";
import { generateMeta } from "@/lib/seo/generate-meta";
import { breadcrumbJsonLd, itemListJsonLd } from "@/lib/seo/jsonld";
import { ArtistsListClient } from "./client";

export const metadata: Metadata = generateMeta({
  title: "Artiști pentru Evenimente",
  description: "Descoperă cei mai buni artiști pentru nunta, botezul sau evenimentul tău în Republica Moldova.",
  path: "/artisti",
});

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ArtistsPage({ searchParams }: Props) {
  const sp = await searchParams;

  const filters = {
    search: (sp.q as string) || undefined,
    categoryId: sp.category ? Number(sp.category) : undefined,
    sort: (sp.sort as "popular" | "price_asc" | "price_desc" | "rating" | "newest") || "popular",
    page: sp.page ? Number(sp.page) : 1,
    priceMin: sp.price_min ? Number(sp.price_min) : undefined,
    priceMax: sp.price_max ? Number(sp.price_max) : undefined,
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
    name: a.nameRo,
    url: `https://epetrecere.md/artisti/${a.slug}`,
  }));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbJsonLd([
            { name: "Acasă", url: "https://epetrecere.md" },
            { name: "Artiști", url: "https://epetrecere.md/artisti" },
          ])),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(itemListJsonLd(jsonLdItems, "Artiști pentru Evenimente")),
        }}
      />
    <ArtistsListClient
      artists={items}
      total={result.total}
      page={result.page}
      totalPages={result.totalPages}
      currentSort={filters.sort}
      searchQuery={(sp.q as string) || ""}
      categories={cats.map((c) => ({ id: c.id, nameRo: c.nameRo }))}
      currentCategory={(sp.category as string) || ""}
      currentPriceMin={(sp.price_min as string) || ""}
      currentPriceMax={(sp.price_max as string) || ""}
    />
    </>
  );
}
