import type { Metadata } from "next";
import { getVenues } from "@/lib/db/queries/venues";
import { generateMeta } from "@/lib/seo/generate-meta";
import { VenuesListClient } from "./client";

export const metadata: Metadata = generateMeta({
  title: "Săli & Restaurante pentru Evenimente",
  description: "Găsește sala perfectă pentru nunta sau evenimentul tău în Republica Moldova.",
  path: "/sali",
});

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function VenuesPage({ searchParams }: Props) {
  const sp = await searchParams;

  const filters = {
    city: (sp.city as string) || undefined,
    capacityMin: sp.capacity_min ? Number(sp.capacity_min) : undefined,
    sort: (sp.sort as "popular" | "price_asc" | "price_desc" | "rating" | "capacity") || "popular",
    page: sp.page ? Number(sp.page) : 1,
  };

  const result = await getVenues(filters);
  return <VenuesListClient venues={result.items} total={result.total} page={result.page} totalPages={result.totalPages} currentSort={filters.sort} />;
}
