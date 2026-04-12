"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { VenueCard } from "@/components/public/venue-card";
import { SortBar } from "@/components/public/sort-bar";
import { PaginationBar } from "@/components/public/pagination-bar";
import { CityFilter, CapacityFilter, ActiveFiltersReset } from "@/components/public/filter-bar";
import { useLocale } from "@/hooks/use-locale";

interface Props {
  venues: Array<{
    id: number;
    slug: string;
    nameRo: string;
    nameRu: string | null;
    nameEn: string | null;
    address: string | null;
    city: string | null;
    capacityMin: number | null;
    capacityMax: number | null;
    pricePerPerson: number | null;
    ratingAvg: number | null;
    ratingCount: number | null;
    isFeatured: boolean;
  }>;
  total: number;
  page: number;
  totalPages: number;
  currentSort: string;
  cities: string[];
  currentCity: string;
  currentCapacityMin: string;
}

const sortOptions = [
  { value: "popular", label: "Popular" },
  { value: "price_asc", label: "Preț ↑" },
  { value: "price_desc", label: "Preț ↓" },
  { value: "rating", label: "Rating" },
  { value: "capacity", label: "Capacitate" },
];

export function VenuesListClient({ venues, total, page, totalPages, currentSort, cities, currentCity, currentCapacityMin }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLocale();

  function updateParams(key: string, value: string | undefined) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    if (key !== "page") params.delete("page");
    router.push(`/sali?${params.toString()}`);
  }

  function resetFilters() {
    router.push("/sali");
  }

  const hasFilters = !!(currentCity || currentCapacityMin);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold md:text-4xl">{t("nav.venues")}</h1>
        <p className="mt-2 text-muted-foreground">{total} rezultate</p>
      </div>

      <div className="mb-6">
        <SortBar
          options={sortOptions}
          current={currentSort}
          onChange={(v) => updateParams("sort", v)}
        />
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3">
        <CityFilter
          cities={cities}
          currentCity={currentCity || undefined}
          onChange={(city) => updateParams("city", city)}
        />
        <CapacityFilter
          currentMin={currentCapacityMin || undefined}
          onChange={(min) => updateParams("capacity_min", min)}
        />
        <ActiveFiltersReset hasFilters={hasFilters} onReset={resetFilters} />
      </div>

      {venues.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {venues.map((venue) => <VenueCard key={venue.id} venue={venue} />)}
        </div>
      ) : (
        <div className="py-20 text-center">
          <p className="text-lg text-muted-foreground">{t("common.noResults")}</p>
        </div>
      )}

      <PaginationBar
        page={page}
        totalPages={totalPages}
        onPageChange={(p) => updateParams("page", String(p))}
      />
    </div>
  );
}
