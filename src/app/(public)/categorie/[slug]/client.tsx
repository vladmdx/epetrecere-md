"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArtistCard } from "@/components/public/artist-card";
import { SortBar } from "@/components/public/sort-bar";
import { PaginationBar } from "@/components/public/pagination-bar";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/hooks/use-locale";
import { getLocalized } from "@/i18n";
import { Star, CalendarDays, SlidersHorizontal, X } from "lucide-react";

interface Props {
  category: {
    id: number;
    nameRo: string;
    nameRu: string | null;
    nameEn: string | null;
    descriptionRo: string | null;
    descriptionRu: string | null;
    descriptionEn: string | null;
    slug: string;
    priceFrom: number | null;
  };
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
}

const sortOptions = [
  { value: "popular", label: "Popular" },
  { value: "price_asc", label: "Preț ↑" },
  { value: "price_desc", label: "Preț ↓" },
  { value: "rating", label: "Rating" },
  { value: "newest", label: "Nou" },
];

/* Reusable filter controls for desktop and mobile sheet */
function FilterControls({ searchParams, updateParams, clearParam, category, router }: {
  searchParams: ReturnType<typeof useSearchParams>;
  updateParams: (key: string, value: string) => void;
  clearParam: (key: string) => void;
  category: Props["category"];
  router: ReturnType<typeof useRouter>;
}) {
  const activeRating = searchParams.get("rating_min");
  const activeDate = searchParams.get("date");

  return (
    <>
      {/* Price range filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground min-w-[36px]">Preț:</span>
        {[100, 200, 500, 1000, 2000].map((price) => (
          <Button
            key={price}
            variant="outline"
            size="sm"
            className={searchParams.get("price_max") === String(price) ? "bg-gold/10 border-gold/30 text-gold" : ""}
            onClick={() => updateParams("price_max", String(price))}
          >
            pînă la {price}€
          </Button>
        ))}
        {searchParams.get("price_max") && (
          <Button variant="ghost" size="sm" className="text-destructive text-xs" onClick={() => clearParam("price_max")}>
            ✕
          </Button>
        )}
      </div>

      {/* Rating filter (G-39) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground min-w-[36px]">Rating:</span>
        {[3, 4, 4.5].map((rating) => (
          <Button
            key={rating}
            variant="outline"
            size="sm"
            className={activeRating === String(rating) ? "bg-gold/10 border-gold/30 text-gold" : ""}
            onClick={() => updateParams("rating_min", String(rating))}
          >
            <Star className="h-3.5 w-3.5 fill-gold text-gold mr-1" />
            {rating}+
          </Button>
        ))}
        {activeRating && (
          <Button variant="ghost" size="sm" className="text-destructive text-xs" onClick={() => clearParam("rating_min")}>
            ✕
          </Button>
        )}
      </div>

      {/* Date availability filter (G-40) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground min-w-[36px]">Data:</span>
        <div className="relative">
          <input
            type="date"
            value={activeDate ?? ""}
            min={new Date().toISOString().split("T")[0]}
            onChange={(e) => {
              if (e.target.value) {
                updateParams("date", e.target.value);
              } else {
                clearParam("date");
              }
            }}
            className="h-9 rounded-md border border-input bg-background px-3 pr-8 text-sm text-foreground focus:border-gold focus:ring-1 focus:ring-gold"
          />
          <CalendarDays className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        </div>
        {activeDate && (
          <Button variant="ghost" size="sm" className="text-destructive text-xs" onClick={() => clearParam("date")}>
            ✕ {activeDate}
          </Button>
        )}
      </div>

      {/* Clear all filters */}
      {(searchParams.get("price_max") || activeRating || activeDate) && (
        <Button variant="ghost" size="sm" className="text-destructive text-xs" onClick={() => {
          router.push(`/categorie/${category.slug}`);
        }}>
          Resetează toate filtrele
        </Button>
      )}
    </>
  );
}

export function CategoryPageClient({
  category,
  artists,
  total,
  page,
  totalPages,
  currentSort,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale, t } = useLocale();
  const name = getLocalized(category, "name", locale);
  const description = getLocalized(category, "description", locale);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  function updateParams(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    if (key !== "page") params.delete("page");
    router.push(`/categorie/${category.slug}?${params.toString()}`);
  }

  function clearParam(key: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(key);
    params.delete("page");
    router.push(`/categorie/${category.slug}?${params.toString()}`);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      {/* Hero */}
      <div className="mb-8">
        <nav className="mb-4 text-xs text-muted-foreground">
          <Link href="/" className="hover:text-gold">Acasă</Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">{name}</span>
        </nav>
        <h1 className="font-heading text-3xl font-bold md:text-4xl">{name}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-muted-foreground">{description}</p>
        )}
        <p className="mt-1 text-sm text-muted-foreground">{total} rezultate</p>
      </div>

      {/* Filters + Sort bar */}
      <div className="mb-6 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <SortBar
            options={sortOptions}
            current={currentSort}
            onChange={(v) => updateParams("sort", v)}
          />
          {/* Mobile filter toggle */}
          <Button
            variant="outline"
            size="sm"
            className="md:hidden border-gold/30 text-gold gap-1.5"
            onClick={() => setMobileFiltersOpen(true)}
          >
            <SlidersHorizontal className="h-4 w-4" /> Filtre
          </Button>
        </div>

        {/* Desktop filters — hidden on mobile */}
        <div className="hidden md:block space-y-3">
          <FilterControls
            searchParams={searchParams}
            updateParams={updateParams}
            clearParam={clearParam}
            category={category}
            router={router}
          />
        </div>
      </div>

      {/* Mobile filter sheet */}
      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileFiltersOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-background border-t border-gold/20 p-6 space-y-4 animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold">Filtre</h3>
              <button onClick={() => setMobileFiltersOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <FilterControls
              searchParams={searchParams}
              updateParams={(k, v) => { updateParams(k, v); setMobileFiltersOpen(false); }}
              clearParam={clearParam}
              category={category}
              router={router}
            />
          </div>
        </div>
      )}

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
