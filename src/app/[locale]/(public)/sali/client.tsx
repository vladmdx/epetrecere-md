"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import Link from "@/components/shared/locale-link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  MapPin,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Users,
  Map as MapIcon,
  Loader2,
} from "lucide-react";
import { VenueCard } from "@/components/public/venue-card";
import { SortBar } from "@/components/public/sort-bar";
import { PaginationBar } from "@/components/public/pagination-bar";
import { CompareBar } from "@/components/public/compare-bar";
import { RecentlyViewed } from "@/components/public/recently-viewed";
import { ViewSwitcher, gridClassName, useViewMode } from "@/components/public/view-switcher";
import { VenuesMap } from "@/components/public/venues-map";
import { WishlistButton } from "@/components/public/wishlist-button";
import { useLocale } from "@/hooks/use-locale";
import { getLocalized } from "@/i18n";
import { localizePath } from "@/lib/i18n/routing";
import { cn } from "@/lib/utils";
import { CatalogSeoContent } from "@/components/public/catalog-seo-content";

interface Venue {
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
  coverImageUrl?: string | null;
}

interface Props {
  venues: Venue[];
  total: number;
  page: number;
  totalPages: number;
  currentSort: string;
  cities: string[];
  currentCity: string;
  currentCapacityMin: string;
  currentDate: string;
}

const sortOptions = [
  { value: "popular", label: "Popularitate" },
  { value: "price_asc", label: "Preț crescător" },
  { value: "price_desc", label: "Preț descrescător" },
  { value: "rating", label: "Rating" },
  { value: "capacity", label: "Capacitate" },
];

const capacityOptions = [
  { value: "", label: "Orice capacitate" },
  { value: "50", label: "50+ invitați" },
  { value: "100", label: "100+ invitați" },
  { value: "200", label: "200+ invitați" },
  { value: "300", label: "300+ invitați" },
  { value: "500", label: "500+ invitați" },
];

const knownCities = ["Chișinău", "Bălți", "Orhei", "Cahul", "Ungheni", "Soroca"];

export function VenuesListClient({
  venues,
  total,
  page,
  totalPages,
  currentSort,
  cities,
  currentCity,
  currentCapacityMin,
  currentDate,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, locale } = useLocale();
  const labels = {
    ro: { home: "Acasă", venues: "Săli", title: "Săli pentru evenimentul tău", description: "Descoperă restaurante, săli de nuntă și locații premium pentru orice eveniment din Republica Moldova.", allMoldova: "Toată Moldova", anyCapacity: "Orice capacitate", eventDate: "Data evenimentului", guests: "invitați", search: "Caută", filter: "Filtrează rezultate", reset: "Resetează", locality: "Localitate", allLocations: "Toate localitățile", capacity: "Capacitate", apply: "Aplică filtrele", found: "locații găsite", active: "Filtre active", unsure: "Nu știi ce locație să alegi?", ctaDesc: "Spune-ne numărul de invitați și stilul evenimentului, iar noi îți recomandăm săli potrivite.", recommendations: "Primește recomandări", heroAlt: "Sală elegantă pentru evenimente în Republica Moldova", newLabel: "Nou", upTo: "până la" },
    ru: { home: "Главная", venues: "Залы", title: "Залы для вашего события", description: "Найдите рестораны, свадебные залы и премиальные площадки по всей Молдове.", allMoldova: "Вся Молдова", anyCapacity: "Любая вместимость", eventDate: "Дата события", guests: "гостей", search: "Найти", filter: "Фильтры", reset: "Сбросить", locality: "Город", allLocations: "Все города", capacity: "Вместимость", apply: "Применить фильтры", found: "локаций найдено", active: "Фильтры активны", unsure: "Не знаете, какой зал выбрать?", ctaDesc: "Укажите число гостей и стиль события, и мы предложим подходящие залы.", recommendations: "Получить рекомендации", heroAlt: "Элегантный зал для событий в Республике Молдова", newLabel: "Новый", upTo: "до" },
    en: { home: "Home", venues: "Venues", title: "Venues for your event", description: "Discover restaurants, wedding halls and premium venues across Moldova.", allMoldova: "All Moldova", anyCapacity: "Any capacity", eventDate: "Event date", guests: "guests", search: "Search", filter: "Filter results", reset: "Reset", locality: "Location", allLocations: "All locations", capacity: "Capacity", apply: "Apply filters", found: "venues found", active: "Active filters", unsure: "Not sure which venue to choose?", ctaDesc: "Tell us your guest count and event style, and we will suggest suitable venues.", recommendations: "Get recommendations", heroAlt: "Elegant event venue in the Republic of Moldova", newLabel: "New", upTo: "up to" },
  }[locale];
  const [city, setCity] = useState(currentCity);
  const [capacity, setCapacity] = useState(currentCapacityMin);
  const [date, setDate] = useState(currentDate);
  const [viewMode, setViewMode] = useViewMode();
  // Map mode is venue-specific, so it's a local toggle rather than a third
  // ViewSwitcher kind — /artisti shares that component and has no map.
  const [showMap, setShowMap] = useState(false);
  const mapVenues = useMemo(
    () =>
      venues.map((v) => ({
        id: v.id,
        slug: v.slug,
        name: getLocalized(v, "name", locale),
        city: v.city ?? null,
        lat: (v as { lat?: number | null }).lat ?? null,
        lng: (v as { lng?: number | null }).lng ?? null,
        capacityMax: v.capacityMax ?? null,
        pricePerPerson: v.pricePerPerson ?? null,
        ratingAvg: v.ratingAvg ?? null,
        imageUrl: v.coverImageUrl ?? null,
      })),
    [venues, locale],
  );
  const locations = Array.from(new Set([...knownCities, ...cities].filter(Boolean)));

  const [pending, startTransition] = useTransition();

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
    // Locale lives in the path (/ru/sali), so an unprefixed push would drop a
    // Russian or English visitor onto the Romanian listing mid-filtering.
    const base = localizePath("/sali", locale);
    startTransition(() => {
      router.push(suffix ? `${base}?${suffix}` : base);
    });
  }

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    navigate({
      city: city || undefined,
      capacity_min: capacity || undefined,
      date: date || undefined,
    });
  }

  // The bare path drops sort/page from the URL, but the inputs are controlled
  // and the route does not change, so without clearing state too the next
  // "Aplică filtrele" would silently re-submit the filters just reset.
  function resetFilters() {
    setCity("");
    setCapacity("");
    setDate("");
    startTransition(() => {
      router.push(localizePath("/sali", locale));
    });
  }

  const hasFilters = Boolean(currentCity || currentCapacityMin || currentDate);

  return (
    <div className="-mt-16 min-h-screen bg-[#05080d] text-[#f6f0e5]">
      <CompareBar entityType="venue" />

      <section className="relative isolate overflow-hidden border-b border-[#e4b747]/12 pt-16">
        <Image
          src="/images/redesign/venues-catalog-hero.webp"
          alt={labels.heroAlt}
          fill
          priority
          sizes="100vw"
          className="absolute -z-20 object-cover object-center"
        />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(5,8,13,.98)_0%,rgba(5,8,13,.86)_50%,rgba(5,8,13,.28)_82%,rgba(5,8,13,.56)_100%)]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-transparent to-[#05080d]" />

        <div className="mx-auto max-w-[1480px] px-4 pb-9 pt-7 lg:px-8">
          <nav className="text-xs text-white/48">
            <Link href="/" className="hover:text-[#e6b84d]">{labels.home}</Link>
            <span className="mx-2">›</span>
            <span>{labels.venues}</span>
          </nav>

          <div className="mt-8 max-w-4xl">
            <h1 className="max-w-3xl font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
              {labels.title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/68 sm:text-base">
              {labels.description}
            </p>

            <form
              onSubmit={handleSearch}
              className="mt-6 grid gap-2 rounded-xl border border-white/12 bg-[#090d14]/82 p-3 shadow-[0_20px_50px_rgba(0,0,0,.25)] backdrop-blur-xl sm:grid-cols-2 lg:grid-cols-[1fr_210px_190px_auto]"
            >
              <label className="flex min-h-11 items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3">
                <MapPin className="h-4 w-4 text-[#e6b84d]" />
                <select
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none"
                >
                  <option value="" className="bg-[#0a1019]">{labels.allMoldova}</option>
                  {locations.map((item) => (
                    <option key={item} value={item} className="bg-[#0a1019]">{item}</option>
                  ))}
                </select>
              </label>
              <label className="flex min-h-11 items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3">
                <Users className="h-4 w-4 text-[#e6b84d]" />
                <select
                  value={capacity}
                  onChange={(event) => setCapacity(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none"
                >
                  {capacityOptions.map((item) => (
                    <option key={item.value} value={item.value} className="bg-[#0a1019]">
                      {item.value ? `${item.value}+ ${labels.guests}` : labels.anyCapacity}
                    </option>
                  ))}
                </select>
              </label>
              {/* Availability is the one filter the cards make a claim about:
                  only with a date does getVenues drop the venues already
                  booked, so only then does VenueCard show its badge. */}
              <label className="flex min-h-11 items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3">
                <CalendarDays className="h-4 w-4 shrink-0 text-[#e6b84d]" />
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  aria-label={labels.eventDate}
                  title={labels.eventDate}
                  className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none [color-scheme:dark]"
                />
              </label>
              <button
                type="submit"
                disabled={pending}
                aria-busy={pending}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[linear-gradient(135deg,#f0ce72,#d8a63c)] px-7 text-sm font-semibold text-[#07101d] transition hover:brightness-105 disabled:cursor-progress disabled:opacity-75"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {labels.search}
              </button>
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
                {labels.filter}
              </h2>
              {hasFilters && (
                <button onClick={resetFilters} className="text-[10px] text-white/45 hover:text-white">
                  {labels.reset}
                </button>
              )}
            </div>

            <div className="border-b border-white/8 py-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[#e8c05f]">{labels.locality}</p>
              <select
                value={city}
                onChange={(event) => {
                  setCity(event.target.value);
                  navigate({ city: event.target.value || undefined });
                }}
                className="h-10 w-full rounded-lg border border-white/10 bg-[#090d14] px-3 text-xs text-white/76 outline-none"
              >
                <option value="">{labels.allLocations}</option>
                {locations.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>

            <div className="border-b border-white/8 py-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[#e8c05f]">{labels.capacity}</p>
              <div className="grid grid-cols-2 gap-2">
                {capacityOptions.slice(1).map((item) => {
                  const selected = currentCapacityMin === item.value;
                  return (
                    <button
                      key={item.value}
                      onClick={() => {
                        const next = selected ? "" : item.value;
                        setCapacity(next);
                        navigate({ capacity_min: next || undefined });
                      }}
                      className={cn(
                        "rounded-lg border px-2 py-2 text-xs",
                        selected
                          ? "border-[#e6b84d] bg-[#e6b84d]/12 text-[#e6b84d]"
                          : "border-white/10 text-white/58 hover:border-[#e6b84d]/35",
                      )}
                    >
                      {item.label.replace(" invitați", "")}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={() => navigate({ city: city || undefined, capacity_min: capacity || undefined, date: date || undefined })}
              className="h-11 w-full rounded-lg border border-[#e6b84d]/65 bg-[#e6b84d]/8 text-xs font-semibold text-[#edc666] hover:bg-[#e6b84d]/15"
            >
              {labels.apply}
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
                    <span className="font-semibold text-white">{total}</span> {labels.found}
                  </p>
                  {hasFilters && <p className="mt-0.5 text-[10px] text-[#e6b84d]">{labels.active}</p>}
                </div>
                <div className="lg:order-2">
                  <SortBar
                    options={sortOptions}
                    current={currentSort}
                    onChange={(value) => navigate({ sort: value })}
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 overflow-x-auto lg:order-3 lg:overflow-visible">
                <button
                  type="button"
                  onClick={() => setShowMap((v) => !v)}
                  aria-pressed={showMap}
                  className={`flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-xs font-medium transition-colors ${
                    showMap
                      ? "border-[#e6b84d] bg-[#e6b84d]/15 text-[#e6b84d]"
                      : "border-white/12 text-white/70 hover:border-[#e6b84d]/50"
                  }`}
                >
                  <MapIcon className="h-3.5 w-3.5" />
                  {t("catalog.map") !== "catalog.map" ? t("catalog.map") : "Hartă"}
                </button>
                <ViewSwitcher mode={viewMode} onChange={setViewMode} />
              </div>
            </div>

            {showMap && venues.length > 0 && (
              <div className="mb-4">
                <VenuesMap venues={mapVenues} />
              </div>
            )}

            {venues.length > 0 ? (
              viewMode.kind === "grid" ? (
                <div className={gridClassName(viewMode.cols)}>
                  {venues.map((venue, index) => (
                    <VenueCard key={venue.id} venue={venue} imageIndex={index} availableOn={currentDate || null} />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {venues.map((venue, index) => (
                    <VenueListCard key={venue.id} venue={venue} imageIndex={index} detailed={viewMode.density === "detailed"} />
                  ))}
                </div>
              )
            ) : (
              <div className="rounded-xl border border-white/8 bg-white/[.02] py-24 text-center">
                <Sparkles className="mx-auto h-9 w-9 text-[#e6b84d]/60" />
                <p className="mt-4 text-sm text-white/58">{t("common.noResults")}</p>
                <button onClick={resetFilters} className="mt-4 text-xs text-[#e6b84d]">
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
              <VenueIllustration />
              <div className="flex-1">
                <h2 className="font-heading text-2xl font-semibold text-[#edd08a]">
                  {labels.unsure}
                </h2>
                <p className="mt-1 text-sm text-white/56">
                  {labels.ctaDesc}
                </p>
              </div>
              <Link
                href="/planifica"
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-[linear-gradient(135deg,#f0ce72,#d8a63c)] px-6 text-xs font-semibold text-[#07101d]"
              >
                {labels.recommendations} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-10 border-t border-white/8 pt-7">
              <RecentlyViewed type="venue" />
            </div>
          </section>
        </div>
      </main>
      <CatalogSeoContent kind="venues" />
    </div>
  );
}

function VenueListCard({ venue, detailed, imageIndex }: { venue: Venue; detailed: boolean; imageIndex: number }) {
  const { locale, t } = useLocale();
  const upTo = locale === "ru" ? "до" : locale === "en" ? "up to" : "până la";
  const newLabel = locale === "ru" ? "Новый" : locale === "en" ? "New" : "Nou";
  const name = getLocalized(venue, "name", locale);
  const fallback = `/images/venues/hall-${(imageIndex % 6) + 1}.jpg`;
  const image = venue.coverImageUrl || fallback;

  return (
    <div className={cn("flex gap-3 rounded-xl border border-white/8 bg-[#111522] p-3 transition-colors hover:border-[#e6b84d]/35", detailed && "gap-4 p-4")}>
      <Link href={`/sali/${venue.slug}`} className={cn("relative shrink-0 overflow-hidden rounded-lg", detailed ? "h-28 w-40" : "h-16 w-24")}>
        <Image src={image} alt={name} fill sizes={detailed ? "160px" : "96px"} className="object-cover" unoptimized={image.includes("r2.cloudflarestorage.com")} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/sali/${venue.slug}`} className="line-clamp-1 font-heading font-semibold text-white hover:text-[#e6b84d]">
              {name}
            </Link>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/48">
              {venue.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-[#e6b84d]" />{venue.city}</span>}
              {venue.capacityMax && <span className="flex items-center gap-1"><Users className="h-3 w-3" />{upTo} {venue.capacityMax} {t("common.guests")}</span>}
              <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-[#e6b84d] text-[#e6b84d]" />{venue.ratingAvg?.toFixed(1) || newLabel}</span>
            </div>
            {detailed && venue.address && <p className="mt-3 text-xs text-white/46">{venue.address}</p>}
          </div>
          <WishlistButton entityName={name} entityType="venue" entityId={venue.id} />
        </div>
      </div>
    </div>
  );
}

function VenueIllustration() {
  return (
    <div className="relative flex h-20 w-24 shrink-0 items-center justify-center text-[#e6b84d]">
      <span className="absolute inset-0 rounded-full bg-[#e6b84d]/5 blur-xl" />
      <svg viewBox="0 0 100 76" className="relative h-full w-full" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M16 59h68M23 59V35h54v24M31 35V24h38v11M39 24v-8h22v8M31 45h38M39 45v14M61 45v14" />
        <path d="M13 59h74M46 16h8M24 31h52" />
      </svg>
    </div>
  );
}
