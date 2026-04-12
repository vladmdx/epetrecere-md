import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
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
    // Availability filter — exclude venues booked/blocked on this date.
    availableDate: (sp.date as string) || undefined,
  };

  const result = await getVenues(filters);

  // M0a #8 — gate price per person behind login at the server layer.
  const { userId } = await auth();
  const items = userId
    ? result.items
    : result.items.map((v) => ({ ...v, pricePerPerson: null }));

  // Extract unique cities from results for filter pills
  const allCities = Array.from(new Set(result.items.map((v) => v.city).filter(Boolean) as string[])).sort();

  return (
    <VenuesListClient
      venues={items}
      total={result.total}
      page={result.page}
      totalPages={result.totalPages}
      currentSort={filters.sort}
      cities={allCities}
      currentCity={(sp.city as string) || ""}
      currentCapacityMin={(sp.capacity_min as string) || ""}
    />
  );
}
