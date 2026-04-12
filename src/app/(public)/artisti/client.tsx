"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ArtistCard } from "@/components/public/artist-card";
import { SortBar } from "@/components/public/sort-bar";
import { PaginationBar } from "@/components/public/pagination-bar";
import { PriceFilter, CategoryFilter, ActiveFiltersReset } from "@/components/public/filter-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/hooks/use-locale";
import { Search } from "lucide-react";
import { useState } from "react";

interface Props {
  artists: Array<{
    id: number;
    slug: string;
    nameRo: string;
    nameRu: string | null;
    nameEn: string | null;
    descriptionRo: string | null;
    descriptionRu: string | null;
    descriptionEn: string | null;
    priceFrom: number | null;
    priceCurrency: string | null;
    ratingAvg: number | null;
    ratingCount: number | null;
    isVerified: boolean;
    isFeatured: boolean;
    isPremium: boolean;
    location: string | null;
  }>;
  total: number;
  page: number;
  totalPages: number;
  currentSort: string;
  searchQuery: string;
  categories: Array<{ id: number; nameRo: string }>;
  currentCategory: string;
  currentPriceMin: string;
  currentPriceMax: string;
}

const sortOptions = [
  { value: "popular", label: "Popular" },
  { value: "price_asc", label: "Preț ↑" },
  { value: "price_desc", label: "Preț ↓" },
  { value: "rating", label: "Rating" },
  { value: "newest", label: "Nou" },
];

export function ArtistsListClient({ artists, total, page, totalPages, currentSort, searchQuery, categories, currentCategory, currentPriceMin, currentPriceMax }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLocale();
  const [query, setQuery] = useState(searchQuery);

  function updateParams(key: string, value: string | undefined) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    if (key !== "page") params.delete("page");
    router.push(`/artisti?${params.toString()}`);
  }

  function updateMultiParams(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    params.delete("page");
    router.push(`/artisti?${params.toString()}`);
  }

  function resetFilters() {
    router.push("/artisti");
  }

  const hasFilters = !!(currentCategory || currentPriceMin || currentPriceMax || searchQuery);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    updateParams("q", query);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold md:text-4xl">{t("nav.artists")}</h1>
        <p className="mt-2 text-muted-foreground">{total} rezultate</p>
      </div>

      {/* Search + Sort */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={handleSearch} className="flex gap-2 sm:max-w-sm">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search.placeholder")}
          />
          <Button type="submit" className="bg-gold text-background hover:bg-gold-dark">
            <Search className="h-4 w-4" />
          </Button>
        </form>

        <SortBar
          options={sortOptions}
          current={currentSort}
          onChange={(v) => updateParams("sort", v)}
        />
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3">
        <CategoryFilter
          categories={categories}
          currentId={currentCategory || undefined}
          onChange={(id) => updateParams("category", id)}
        />
        <PriceFilter
          currentMin={currentPriceMin || undefined}
          currentMax={currentPriceMax || undefined}
          onChange={(min, max) => updateMultiParams({ price_min: min, price_max: max })}
        />
        <ActiveFiltersReset hasFilters={hasFilters} onReset={resetFilters} />
      </div>

      {/* Grid */}
      {artists.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {artists.map((artist) => (
            <ArtistCard key={artist.id} artist={artist} />
          ))}
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
