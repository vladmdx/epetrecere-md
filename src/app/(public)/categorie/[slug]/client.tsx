"use client";

import { FormEvent, useState } from "react";
import Link from "@/components/shared/locale-link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  MapPin,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { ArtistCard } from "@/components/public/artist-card";
import { ArtistListCard } from "@/components/public/artist-list-card";
import { PaginationBar } from "@/components/public/pagination-bar";
import { SortBar } from "@/components/public/sort-bar";
import { ViewSwitcher, gridClassName, useViewMode } from "@/components/public/view-switcher";
import { useLocale } from "@/hooks/use-locale";
import { getLocalized } from "@/i18n";
import { cn } from "@/lib/utils";

interface Artist {
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
  coverImageUrl?: string | null;
}

interface Category {
  id: number;
  type: string;
  nameRo: string;
  nameRu: string | null;
  nameEn: string | null;
  descriptionRo: string | null;
  descriptionRu: string | null;
  descriptionEn: string | null;
  slug: string;
  priceFrom: number | null;
  seoBodyRo: string | null;
}

interface Props {
  category: Category;
  artists: Artist[];
  total: number;
  page: number;
  totalPages: number;
  currentSort: string;
  searchQuery: string;
  currentCity: string;
  currentPriceMin: string;
  currentPriceMax: string;
}

const sortOptions = [
  { value: "popular", label: "Popularitate" },
  { value: "price_asc", label: "Preț crescător" },
  { value: "price_desc", label: "Preț descrescător" },
  { value: "rating", label: "Rating" },
  { value: "newest", label: "Cei mai noi" },
];

const locations = ["", "Chișinău", "Bălți", "Orhei", "Cahul", "Ungheni", "Soroca"];

interface FilterPanelProps {
  city: string;
  priceMin: string;
  priceMax: string;
  rating: string;
  hasFilters: boolean;
  onCityChange: (value: string) => void;
  onPriceMinChange: (value: string) => void;
  onPriceMaxChange: (value: string) => void;
  onRatingChange: (value: string) => void;
  onApply: () => void;
  onReset: () => void;
}

function FilterPanel({
  city,
  priceMin,
  priceMax,
  rating,
  hasFilters,
  onCityChange,
  onPriceMinChange,
  onPriceMaxChange,
  onRatingChange,
  onApply,
  onReset,
}: FilterPanelProps) {
  const { locale } = useLocale();
  const labels = {
    ro: { filter: "Filtrează rezultate", reset: "Resetează", price: "Preț", location: "Locație", all: "Toată Moldova", rating: "Rating minim", apply: "Aplică filtrele" },
    ru: { filter: "Фильтры", reset: "Сбросить", price: "Цена", location: "Город", all: "Вся Молдова", rating: "Минимальный рейтинг", apply: "Применить фильтры" },
    en: { filter: "Filter results", reset: "Reset", price: "Price", location: "Location", all: "All Moldova", rating: "Minimum rating", apply: "Apply filters" },
  }[locale];
  return (
    <div className="rounded-xl border border-white/8 bg-[linear-gradient(180deg,#0d1017,#090c12)] p-4 shadow-[0_24px_55px_rgba(0,0,0,.18)]">
      <div className="flex items-center justify-between border-b border-white/8 pb-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[#e8c05f]">
          <SlidersHorizontal className="h-4 w-4" />
          {labels.filter}
        </h2>
        {hasFilters && (
          <button
            type="button"
            onClick={onReset}
            className="text-[10px] text-white/45 hover:text-white"
          >
            {labels.reset}
          </button>
        )}
      </div>

      <div className="border-b border-white/8 py-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[#e8c05f]">
          {labels.price}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <input
            inputMode="numeric"
            value={priceMin}
            onChange={(event) =>
              onPriceMinChange(event.target.value.replace(/\D/g, ""))
            }
            placeholder="Min €"
            className="h-9 rounded-lg border border-white/10 bg-black/18 px-2.5 text-xs text-white outline-none placeholder:text-white/35 focus:border-[#e6b84d]/60"
          />
          <input
            inputMode="numeric"
            value={priceMax}
            onChange={(event) =>
              onPriceMaxChange(event.target.value.replace(/\D/g, ""))
            }
            placeholder="Max €"
            className="h-9 rounded-lg border border-white/10 bg-black/18 px-2.5 text-xs text-white outline-none placeholder:text-white/35 focus:border-[#e6b84d]/60"
          />
        </div>
      </div>

      <div className="border-b border-white/8 py-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[#e8c05f]">
          {labels.location}
        </p>
        <select
          value={city}
          onChange={(event) => onCityChange(event.target.value)}
          className="h-10 w-full rounded-lg border border-white/10 bg-[#090d14] px-3 text-xs text-white/76 outline-none"
        >
          <option value="">{labels.all}</option>
          {locations.slice(1).map((location) => (
            <option key={location} value={location}>
              {location}
            </option>
          ))}
        </select>
      </div>

      <div className="py-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[#e8c05f]">
          {labels.rating}
        </p>
        <div className="flex gap-1">
          {[3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() =>
                onRatingChange(rating === String(value) ? "" : String(value))
              }
              className={cn(
                "flex-1 rounded-lg border px-2 py-2 text-xs",
                rating === String(value)
                  ? "border-[#e6b84d] bg-[#e6b84d]/12 text-[#e6b84d]"
                  : "border-white/10 text-white/58 hover:border-[#e6b84d]/35",
              )}
            >
              {value}★+
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onApply}
        className="h-11 w-full rounded-lg border border-[#e6b84d]/65 bg-[#e6b84d]/8 text-xs font-semibold text-[#edc666] hover:bg-[#e6b84d]/15"
      >
        {labels.apply}
      </button>
    </div>
  );
}
export function CategoryPageClient({
  category,
  artists,
  total,
  page,
  totalPages,
  currentSort,
  searchQuery,
  currentCity,
  currentPriceMin,
  currentPriceMax,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale, t } = useLocale();
  const [query, setQuery] = useState(searchQuery);
  const [city, setCity] = useState(currentCity);
  const [priceMin, setPriceMin] = useState(currentPriceMin);
  const [priceMax, setPriceMax] = useState(currentPriceMax);
  const [rating, setRating] = useState(searchParams.get("rating_min") ?? "");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useViewMode();

  const name = getLocalized(category, "name", locale);
  const description = getLocalized(category, "description", locale);
  const labels = {
    ro: { home: "Acasă", services: "Servicii", artists: "Artiști", suppliers: "furnizori", artistEntities: "artiști", premium: "Categorie premium", fallback: "Descoperă profesioniști potriviți pentru evenimentul tău, într-o selecție modernă și ușor de filtrat.", search: "Caută", inCategory: "Caută în", allMoldova: "Toată Moldova", found: "găsiți", active: "Filtre active", filters: "Filtre", reset: "Resetează filtrele", heroAlt: "Profesioniști pentru evenimente din Moldova" },
    ru: { home: "Главная", services: "Услуги", artists: "Артисты", suppliers: "поставщиков", artistEntities: "артистов", premium: "Премиальная категория", fallback: "Найдите подходящих профессионалов для события в современной подборке с удобными фильтрами.", search: "Найти", inCategory: "Поиск в", allMoldova: "Вся Молдова", found: "найдено", active: "Фильтры активны", filters: "Фильтры", reset: "Сбросить фильтры", heroAlt: "Профессионалы для событий в Молдове" },
    en: { home: "Home", services: "Services", artists: "Artists", suppliers: "vendors", artistEntities: "artists", premium: "Premium category", fallback: "Discover suitable event professionals in a modern selection with easy filters.", search: "Search", inCategory: "Search in", allMoldova: "All Moldova", found: "found", active: "Active filters", filters: "Filters", reset: "Reset filters", heroAlt: "Event professionals in Moldova" },
  }[locale];
  const entityLabel = category.type === "service" ? labels.suppliers : labels.artistEntities;
  const parentHref = category.type === "service" ? "/servicii" : "/artisti";
  const parentLabel = category.type === "service" ? labels.services : labels.artists;
  const hasFilters = Boolean(
    searchQuery ||
      currentCity ||
      currentPriceMin ||
      currentPriceMax ||
      searchParams.get("rating_min"),
  );

  function navigate(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    if (!("page" in updates)) params.delete("page");
    const suffix = params.toString();
    router.push(
      suffix
        ? `/categorie/${category.slug}?${suffix}`
        : `/categorie/${category.slug}`,
    );
  }

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    navigate({ q: query.trim() || undefined, city: city || undefined });
  }

  function applyFilters() {
    navigate({
      city: city || undefined,
      price_min: priceMin || undefined,
      price_max: priceMax || undefined,
      rating_min: rating || undefined,
    });
    setMobileFiltersOpen(false);
  }

  function resetFilters() {
    setQuery("");
    setCity("");
    setPriceMin("");
    setPriceMax("");
    setRating("");
    router.push(`/categorie/${category.slug}`);
    setMobileFiltersOpen(false);
  }

  const filterProps: FilterPanelProps = {
    city,
    priceMin,
    priceMax,
    rating,
    hasFilters,
    onCityChange: setCity,
    onPriceMinChange: setPriceMin,
    onPriceMaxChange: setPriceMax,
    onRatingChange: setRating,
    onApply: applyFilters,
    onReset: resetFilters,
  };

  return (
    <div className="-mt-16 min-h-screen bg-[#05080d] text-[#f6f0e5]">
      <section className="relative isolate overflow-hidden border-b border-[#e4b747]/12 pt-16">
        <img
          src="/images/redesign/artists-hero.webp"
          alt={labels.heroAlt}
          className="absolute inset-0 -z-20 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(5,8,13,.98)_0%,rgba(5,8,13,.9)_50%,rgba(5,8,13,.48)_100%)]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-transparent to-[#05080d]" />

        <div className="mx-auto max-w-[1480px] px-4 pb-9 pt-7 lg:px-8">
          <nav className="text-xs text-white/48">
            <Link href="/" className="hover:text-[#e6b84d]">
              {labels.home}
            </Link>
            <span className="mx-2">›</span>
            <Link href={parentHref} className="hover:text-[#e6b84d]">
              {parentLabel}
            </Link>
            <span className="mx-2">›</span>
            <span>{name}</span>
          </nav>

          <div className="mt-8 max-w-3xl">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.28em] text-[#e6b84d]">
              {labels.premium}
            </p>
            <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
              {name}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/68 sm:text-base">
              {description || labels.fallback}
            </p>

            <form
              onSubmit={handleSearch}
              className="mt-6 grid gap-2 rounded-xl border border-white/12 bg-[#090d14]/80 p-3 shadow-[0_20px_50px_rgba(0,0,0,.25)] backdrop-blur-xl sm:grid-cols-[1fr_210px_auto]"
            >
              <label className="flex min-h-11 items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3">
                <Search className="h-4 w-4 text-[#e6b84d]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={`${labels.inCategory} ${name.toLowerCase()}...`}
                  className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
                />
              </label>
              <label className="flex min-h-11 items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3">
                <MapPin className="h-4 w-4 text-[#e6b84d]" />
                <select
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none"
                >
                  <option value="" className="bg-[#0a1019]">
                    {labels.allMoldova}
                  </option>
                  {locations.slice(1).map((location) => (
                    <option
                      key={location}
                      value={location}
                      className="bg-[#0a1019]"
                    >
                      {location}
                    </option>
                  ))}
                </select>
              </label>
              <button className="min-h-11 rounded-lg bg-[linear-gradient(135deg,#f0ce72,#d8a63c)] px-7 text-sm font-semibold text-[#07101d] hover:brightness-105">
                {labels.search}
              </button>
            </form>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-[1480px] px-4 py-7 lg:px-8">
        <div className="grid items-start gap-5 lg:grid-cols-[245px_minmax(0,1fr)]">
          <aside className="hidden lg:sticky lg:top-20 lg:block">
            <FilterPanel {...filterProps} />
          </aside>

          <section className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-white/68">
                  <span className="font-semibold text-white">{total}</span>{" "}
                  {entityLabel} {labels.found}
                </p>
                {hasFilters && (
                  <p className="mt-0.5 text-[10px] text-[#e6b84d]">
                    {labels.active}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMobileFiltersOpen(true)}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#e6b84d]/30 px-3 text-xs text-[#e6b84d] lg:hidden"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  {labels.filters}
                </button>
                <SortBar
                  options={sortOptions}
                  current={currentSort}
                  onChange={(value) => navigate({ sort: value })}
                />
                <ViewSwitcher mode={viewMode} onChange={setViewMode} />
              </div>
            </div>

            {artists.length > 0 ? (
              viewMode.kind === "grid" ? (
                <div className={gridClassName(viewMode.cols)}>
                  {artists.map((artist) => (
                    <ArtistCard key={artist.id} artist={artist} />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {artists.map((artist) => (
                    <ArtistListCard
                      key={artist.id}
                      artist={artist}
                      density={viewMode.density}
                    />
                  ))}
                </div>
              )
            ) : (
              <div className="rounded-xl border border-white/8 bg-white/[.02] py-24 text-center">
                <Sparkles className="mx-auto h-9 w-9 text-[#e6b84d]/60" />
                <p className="mt-4 text-sm text-white/58">
                  {t("common.noResults")}
                </p>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="mt-4 text-xs text-[#e6b84d]"
                >
                  {labels.reset}
                </button>
              </div>
            )}

            <PaginationBar
              page={page}
              totalPages={totalPages}
              onPageChange={(value) => navigate({ page: String(value) })}
            />

            <div className="mt-7 flex flex-col items-center gap-5 rounded-xl border border-[#e6b84d]/25 bg-[radial-gradient(circle_at_15%_30%,rgba(230,184,77,.11),transparent_28%),linear-gradient(100deg,#0d1019,#151022,#0c101a)] px-6 py-7 text-center sm:flex-row sm:text-left">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-gold/25 bg-gold/8">
                <Sparkles className="h-7 w-7 text-gold" />
              </div>
              <div className="flex-1">
                <h2 className="font-heading text-2xl font-semibold text-[#edd08a]">
                  Vrei recomandări potrivite evenimentului tău?
                </h2>
                <p className="mt-1 text-sm text-white/56">
                  Spune-ne ce organizezi și planificatorul îți pregătește o
                  selecție personalizată.
                </p>
              </div>
              <Link
                href="/planifica"
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-[linear-gradient(135deg,#f0ce72,#d8a63c)] px-6 text-xs font-semibold text-[#07101d]"
              >
                Planifică evenimentul
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {category.seoBodyRo && (
              <article className="mx-auto mt-12 max-w-3xl border-t border-white/8 pt-8">
                {category.seoBodyRo.split(/\n\s*\n/).map((paragraph, index) => {
                  const value = paragraph.trim();
                  if (!value) return null;
                  if (value.startsWith("## ")) {
                    return (
                      <h2
                        key={index}
                        className="mb-3 mt-7 font-heading text-2xl font-semibold text-[#edcf87]"
                      >
                        {value.slice(3)}
                      </h2>
                    );
                  }
                  if (value.startsWith("### ")) {
                    return (
                      <h3
                        key={index}
                        className="mb-2 mt-5 font-heading text-lg font-semibold text-white"
                      >
                        {value.slice(4)}
                      </h3>
                    );
                  }
                  return (
                    <p
                      key={index}
                      className="mb-4 text-sm leading-7 text-white/58"
                    >
                      {value}
                    </p>
                  );
                })}
              </article>
            )}
          </section>
        </div>
      </main>

      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <button
            type="button"
            aria-label="Închide filtrele"
            className="absolute inset-0 bg-black/70"
            onClick={() => setMobileFiltersOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[86vh] overflow-y-auto rounded-t-2xl border-t border-gold/20 bg-[#070a10] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-heading text-lg font-semibold text-white">
                Filtre
              </p>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                aria-label="Închide"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-white/65"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <FilterPanel {...filterProps} />
          </div>
        </div>
      )}
    </div>
  );
}
