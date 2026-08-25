"use client";

import { FormEvent, useState, useTransition } from "react";
import Link from "@/components/shared/locale-link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, MapPin, Search, SlidersHorizontal, Sparkles, Loader2 } from "lucide-react";
import { ArtistCard } from "@/components/public/artist-card";
import { ArtistListCard } from "@/components/public/artist-list-card";
import { SortBar } from "@/components/public/sort-bar";
import { PaginationBar } from "@/components/public/pagination-bar";
import { CompareBar } from "@/components/public/compare-bar";
import { RecentlyViewed } from "@/components/public/recently-viewed";
import { ViewSwitcher, gridClassName, useViewMode } from "@/components/public/view-switcher";
import { useLocale } from "@/hooks/use-locale";
import { getLocalized } from "@/i18n";
import { cn } from "@/lib/utils";
import { CatalogSeoContent } from "@/components/public/catalog-seo-content";

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

interface Props {
  artists: Artist[];
  total: number;
  page: number;
  totalPages: number;
  currentSort: string;
  searchQuery: string;
  categories: Array<{ id: number; slug: string; nameRo: string; nameRu: string | null; nameEn: string | null }>;
  currentCategory: string;
  currentPriceMin: string;
  currentPriceMax: string;
}

const sortOptionKeys = [
  { value: "popular", key: "catalog.popular" },
  { value: "price_asc", key: "catalog.priceAsc" },
  { value: "price_desc", key: "catalog.priceDesc" },
  { value: "rating", key: "catalog.rating" },
  { value: "newest", key: "catalog.newest" },
];

// The chips used to be display strings pushed into ?q=, a free-text ILIKE over
// name_ro/name_ru/description_ro — so a DJ whose description never spells out
// "DJ" was missed, and the RU/EN chips matched nothing at all. They are real
// categories now; anything that does not resolve against the DB simply does not
// render, so a stale slug degrades to a missing chip instead of a 404.
const popularCategorySlugs = [
  "formatii",
  "dj",
  "moderatori",
  "interpreti-muzica-populara",
  "cover-band",
  "instrumentalisti",
];

const locations = ["", "Chișinău", "Bălți", "Orhei", "Cahul", "Ungheni", "Soroca"];

export function ArtistsListClient({
  artists,
  total,
  page,
  totalPages,
  currentSort,
  searchQuery,
  categories,
  currentCategory,
  currentPriceMin,
  currentPriceMax,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, locale } = useLocale();
  const [query, setQuery] = useState(searchQuery);
  const [city, setCity] = useState(searchParams.get("city") ?? "");
  const [priceMin, setPriceMin] = useState(currentPriceMin);
  const [priceMax, setPriceMax] = useState(currentPriceMax);
  const [viewMode, setViewMode] = useViewMode();

  const [pending, startTransition] = useTransition();

  const popularCategories = popularCategorySlugs
    .map((slug) => categories.find((category) => category.slug === slug))
    .filter((category): category is Props["categories"][number] => Boolean(category));

  // Clicking "Caută" used to feel slower and less reliable than pressing Enter:
  // both run the same handler, but router.push does an RSC round-trip and the
  // button gave no sign it had registered the click, so people clicked again.
  // The transition marks the navigation pending, so the button reacts on the
  // first press exactly like Enter does.
  function navigate(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    if (!("page" in updates)) params.delete("page");
    const suffix = params.toString();
    startTransition(() => {
      router.push(suffix ? `/artisti?${suffix}` : "/artisti");
    });
  }

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    navigate({ q: query.trim() || undefined, city: city || undefined });
  }

  // Pushing the bare path clears the URL but not the inputs, and those inputs
  // are exactly what "Aplică filtrele" submits next — so a reset followed by
  // Apply silently re-applied the filters the user had just cleared.
  function resetFilters() {
    setQuery("");
    setCity("");
    setPriceMin("");
    setPriceMax("");
    startTransition(() => {
      router.push("/artisti");
    });
  }

  function applyPrice() {
    navigate({
      price_min: priceMin || undefined,
      price_max: priceMax || undefined,
    });
  }

  const hasFilters =
    Boolean(searchQuery || currentCategory || currentPriceMin || currentPriceMax) ||
    Boolean(searchParams.get("city") || searchParams.get("rating_min"));

  return (
    <div className="-mt-16 min-h-screen bg-[#05080d] text-[#f6f0e5]">
      <CompareBar entityType="artist" />

      <section className="relative isolate overflow-hidden border-b border-[#e4b747]/12 pt-16">
        <img
          src="/images/redesign/artists-hero.webp"
          alt={t("artistsPage.heroAlt")}
          className="absolute inset-0 -z-20 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(5,8,13,.98)_0%,rgba(5,8,13,.88)_48%,rgba(5,8,13,.38)_78%,rgba(5,8,13,.58)_100%)]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-transparent to-[#05080d]" />

        <div className="mx-auto max-w-[1480px] px-4 pb-9 pt-7 lg:px-8">
          <nav className="text-xs text-white/48">
            <Link href="/" className="hover:text-[#e6b84d]">{t("nav.home")}</Link>
            <span className="mx-2">›</span>
            <span>{t("nav.artists")}</span>
          </nav>

          <div className="mt-8 max-w-3xl">
            <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
              {t("artistsPage.title")}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/68 sm:text-base">
              {t("artistsPage.description")}
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
                  placeholder={t("artistsPage.searchPlaceholder")}
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
                  <option value="" className="bg-[#0a1019]">{t("catalogFilters.allMoldova")}</option>
                  {locations.slice(1).map((item) => (
                    <option key={item} value={item} className="bg-[#0a1019]">{item}</option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                disabled={pending}
                aria-busy={pending}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[linear-gradient(135deg,#f0ce72,#d8a63c)] px-7 text-sm font-semibold text-[#07101d] transition hover:brightness-105 disabled:cursor-progress disabled:opacity-75"
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("common.search")}
              </button>
              {popularCategories.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 sm:col-span-3">
                <span className="mr-1 text-[10px] text-white/43">{t("artistsPage.popularSearches")}</span>
                {popularCategories.map((category) => (
                  <Link
                    key={category.id}
                    href={`/categorie/${category.slug}`}
                    className="rounded-full border border-white/9 bg-white/[.04] px-2.5 py-1 text-[10px] text-white/66 hover:border-[#e6b84d]/35 hover:text-[#e6b84d]"
                  >
                    {getLocalized(category, "name", locale)}
                  </Link>
                ))}
              </div>
              )}
            </form>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-[1480px] px-4 py-7 lg:px-8">
        <div className="grid items-start gap-5 lg:grid-cols-[245px_minmax(0,1fr)]">
          <aside className="rounded-xl border border-white/8 bg-[linear-gradient(180deg,#0d1017,#090c12)] p-4 shadow-[0_24px_55px_rgba(0,0,0,.18)] lg:sticky lg:top-20">
            <div className="flex items-center justify-between border-b border-white/8 pb-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[#e8c05f]">
                <SlidersHorizontal className="h-4 w-4" />
                {t("catalogFilters.title")}
              </h2>
              {hasFilters && (
                <button onClick={resetFilters} className="text-[10px] text-white/45 hover:text-white">
                  {t("catalog.reset")}
                </button>
              )}
            </div>

            <div className="border-b border-white/8 py-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[#e8c05f]">{t("catalogFilters.category")}</p>
              <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                <button
                  onClick={() => navigate({ category: undefined })}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs",
                    !currentCategory ? "bg-[#e6b84d]/10 text-[#edc86b]" : "text-white/66 hover:bg-white/[.04]",
                  )}
                >
                  <span className={cn("h-3.5 w-3.5 rounded border", !currentCategory ? "border-[#e6b84d] bg-[#e6b84d]" : "border-white/24")} />
                  {t("catalogFilters.allCategories")}
                </button>
                {categories.map((category) => {
                  const selected = currentCategory === String(category.id);
                  return (
                    <button
                      key={category.id}
                      onClick={() => navigate({ category: selected ? undefined : String(category.id) })}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs",
                        selected ? "bg-[#e6b84d]/10 text-[#edc86b]" : "text-white/66 hover:bg-white/[.04]",
                      )}
                    >
                      <span className={cn("h-3.5 w-3.5 rounded border", selected ? "border-[#e6b84d] bg-[#e6b84d]" : "border-white/24")} />
                      <span className="truncate">{getLocalized(category, "name", locale)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-b border-white/8 py-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[#e8c05f]">{t("catalogFilters.price")}</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  inputMode="numeric"
                  value={priceMin}
                  onChange={(event) => setPriceMin(event.target.value.replace(/\D/g, ""))}
                  placeholder={t("catalogFilters.priceMin")}
                  className="h-9 rounded-lg border border-white/10 bg-black/18 px-2.5 text-xs outline-none focus:border-[#e6b84d]/60"
                />
                <input
                  inputMode="numeric"
                  value={priceMax}
                  onChange={(event) => setPriceMax(event.target.value.replace(/\D/g, ""))}
                  placeholder={t("catalogFilters.priceMax")}
                  className="h-9 rounded-lg border border-white/10 bg-black/18 px-2.5 text-xs outline-none focus:border-[#e6b84d]/60"
                />
              </div>
            </div>

            <div className="border-b border-white/8 py-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[#e8c05f]">{t("catalogFilters.location")}</p>
              <select
                value={city}
                onChange={(event) => {
                  setCity(event.target.value);
                  navigate({ city: event.target.value || undefined });
                }}
                className="h-10 w-full rounded-lg border border-white/10 bg-[#090d14] px-3 text-xs text-white/76 outline-none"
              >
                <option value="">{t("catalogFilters.allLocations")}</option>
                {locations.slice(1).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>

            <div className="py-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[#e8c05f]">{t("catalogFilters.minRating")}</p>
              <div className="flex gap-1">
                {[3, 4, 5].map((rating) => (
                  <button
                    key={rating}
                    onClick={() => navigate({ rating_min: String(rating) })}
                    className={cn(
                      "flex-1 rounded-lg border px-2 py-2 text-xs",
                      searchParams.get("rating_min") === String(rating)
                        ? "border-[#e6b84d] bg-[#e6b84d]/12 text-[#e6b84d]"
                        : "border-white/10 text-white/58 hover:border-[#e6b84d]/35",
                    )}
                  >
                    {rating}★+
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={applyPrice}
              className="h-11 w-full rounded-lg border border-[#e6b84d]/65 bg-[#e6b84d]/8 text-xs font-semibold text-[#edc666] hover:bg-[#e6b84d]/15"
            >
              {t("catalogFilters.apply")}
            </button>
          </aside>

          <section className="min-w-0">
            {/* On a phone the sort control, the map toggle and the view
                switcher together are wider than the column, so the row broke
                mid-control and the display mode ended up split across two
                lines. Sorting now sits on the first line with the result
                count and the display mode gets a line of its own; from `lg`
                up it collapses back to the single row it always was. */}
            <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:gap-3">
              <div className="flex items-center justify-between gap-3 lg:contents">
                <div className="lg:mr-auto">
                  <p className="text-sm text-white/68">
                    <span className="font-semibold text-white">{total}</span> {t("catalog.foundArtists")}
                  </p>
                  {hasFilters && <p className="mt-0.5 text-[10px] text-[#e6b84d]">{t("catalog.activeFilters")}</p>}
                </div>
                <div className="lg:order-2">
                  <SortBar
                    options={sortOptionKeys.map((option) => ({
                      value: option.value,
                      label: t(option.key),
                    }))}
                    current={currentSort}
                    onChange={(value) => navigate({ sort: value })}
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 overflow-x-auto lg:order-3 lg:overflow-visible">
                <ViewSwitcher mode={viewMode} onChange={setViewMode} />
              </div>
            </div>

            {artists.length > 0 ? (
              viewMode.kind === "grid" ? (
                <div className={gridClassName(viewMode.cols)}>
                  {artists.map((artist) => <ArtistCard key={artist.id} artist={artist} />)}
                </div>
              ) : (
                <div className="space-y-2">
                  {artists.map((artist) => (
                    <ArtistListCard key={artist.id} artist={artist} density={viewMode.density} />
                  ))}
                </div>
              )
            ) : (
              <div className="rounded-xl border border-white/8 bg-white/[.02] py-24 text-center">
                <Sparkles className="mx-auto h-9 w-9 text-[#e6b84d]/60" />
                <p className="mt-4 text-sm text-white/58">{t("common.noResults")}</p>
                <button onClick={resetFilters} className="mt-4 text-xs text-[#e6b84d]">
                  {t("catalog.reset")}
                </button>
              </div>
            )}

            <PaginationBar
              page={page}
              totalPages={totalPages}
              onPageChange={(value) => navigate({ page: String(value) })}
            />

            <div className="mt-7 flex flex-col items-center gap-5 rounded-xl border border-[#e6b84d]/25 bg-[radial-gradient(circle_at_15%_30%,rgba(230,184,77,.11),transparent_28%),linear-gradient(100deg,#0d1019,#151022,#0c101a)] px-6 py-7 text-center sm:flex-row sm:text-left">
              <ServiceHat />
              <div className="flex-1">
                <h2 className="font-heading text-2xl font-semibold text-[#edd08a]">
                  {t("artistsPage.ctaTitle")}
                </h2>
                <p className="mt-1 text-sm text-white/56">
                  {t("artistsPage.ctaDesc")}
                </p>
              </div>
              <Link
                href="/planifica"
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-[linear-gradient(135deg,#f0ce72,#d8a63c)] px-6 text-xs font-semibold text-[#07101d]"
              >
                {t("artistsPage.ctaButton")} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-10 border-t border-white/8 pt-7">
              <RecentlyViewed type="artist" />
            </div>
          </section>
        </div>
      </main>
      <CatalogSeoContent kind="artists" />
    </div>
  );
}

function ServiceHat() {
  return (
    <div className="relative flex h-20 w-24 shrink-0 items-center justify-center text-[#e6b84d]">
      <span className="absolute inset-0 rounded-full bg-[#e6b84d]/5 blur-xl" />
      <svg viewBox="0 0 100 76" className="relative h-full w-full" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 57c15-5 43-5 58 0M28 55l7-22h30l7 22M35 33h30M50 12v13M43 17l7 8 7-8M24 20l4 5 6-2M76 20l-4 5-6-2M18 34l7 1 2-6M82 34l-7 1-2-6" />
        <path d="M39 60c6 5 16 5 22 0" />
      </svg>
    </div>
  );
}
