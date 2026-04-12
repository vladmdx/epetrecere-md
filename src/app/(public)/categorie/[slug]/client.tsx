"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArtistCard } from "@/components/public/artist-card";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/hooks/use-locale";
import { getLocalized } from "@/i18n";
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";

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

  function updateParams(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    if (key !== "page") params.delete("page");
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
        <div className="flex flex-wrap items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          {sortOptions.map((opt) => (
            <Button
              key={opt.value}
              variant={currentSort === opt.value ? "default" : "outline"}
              size="sm"
              className={currentSort === opt.value ? "bg-gold text-background hover:bg-gold-dark" : ""}
              onClick={() => updateParams("sort", opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
        {/* Price range filter */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">Preț:</span>
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
            <Button variant="ghost" size="sm" className="text-destructive text-xs" onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.delete("price_max");
              params.delete("page");
              router.push(`/categorie/${category.slug}?${params.toString()}`);
            }}>
              ✕ Resetează
            </Button>
          )}
        </div>
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => updateParams("page", String(page - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => updateParams("page", String(page + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
