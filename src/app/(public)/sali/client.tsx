"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { VenueCard } from "@/components/public/venue-card";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/hooks/use-locale";
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";

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
}

const sortOptions = [
  { value: "popular", label: "Popular" },
  { value: "price_asc", label: "Preț ↑" },
  { value: "price_desc", label: "Preț ↓" },
  { value: "rating", label: "Rating" },
  { value: "capacity", label: "Capacitate" },
];

export function VenuesListClient({ venues, total, page, totalPages, currentSort }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLocale();

  function updateParams(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    if (key !== "page") params.delete("page");
    router.push(`/sali?${params.toString()}`);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold md:text-4xl">{t("nav.venues")}</h1>
        <p className="mt-2 text-muted-foreground">{total} rezultate</p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
        {sortOptions.map((opt) => (
          <Button key={opt.value} variant={currentSort === opt.value ? "default" : "outline"} size="sm" className={currentSort === opt.value ? "bg-gold text-background hover:bg-gold-dark" : ""} onClick={() => updateParams("sort", opt.value)}>
            {opt.label}
          </Button>
        ))}
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

      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => updateParams("page", String(page - 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => updateParams("page", String(page + 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  );
}
