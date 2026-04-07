import type { Metadata } from "next";
import { getArtists } from "@/lib/db/queries/artists";
import { generateMeta } from "@/lib/seo/generate-meta";
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
  };

  const result = await getArtists(filters);

  return (
    <ArtistsListClient
      artists={result.items}
      total={result.total}
      page={result.page}
      totalPages={result.totalPages}
      currentSort={filters.sort}
      searchQuery={(sp.q as string) || ""}
    />
  );
}
