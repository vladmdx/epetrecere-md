"use client";

import Link from "@/components/shared/locale-link";
import { Star, MapPin, Play, ArrowRight } from "lucide-react";
import { ScrollReveal } from "@/components/shared/scroll-reveal";
import { useLocale } from "@/hooks/use-locale";
import { formatPrice } from "@/lib/format/price";

interface ArtistRow {
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
  artists: ArtistRow[];
}

interface DisplayArtist {
  id: number;
  slug: string;
  name: string;
  role: string;
  city: string;
  price: number | null;
  rating: number | null;
  count: number | null;
  image: string;
}

// Dev-only sample so the bento is visible locally without a DB. Production
// renders the real featured artists.
const SAMPLE: DisplayArtist[] = [
  { id: 1, slug: "formatia-noroc", name: "Formația Noroc", role: "Live band", city: "Chișinău", price: 15000, rating: 4.9, count: 145, image: "/images/artists/victoria-lungu.jpg" },
  { id: 2, slug: "dj-alex-mm", name: "DJ Alex MM", role: "DJ", city: "Chișinău", price: 6000, rating: 4.8, count: 98, image: "/images/artists/liviu-gulca.jpg" },
  { id: 3, slug: "mc-paul-event", name: "MC Paul Event", role: "Prezentator", city: "Chișinău", price: 6000, rating: 4.9, count: 72, image: "/images/artists/igor-nedoseikin.jpg" },
  { id: 4, slug: "vitalie-bantas", name: "Vitalie Bantaș", role: "Fotograf", city: "Chișinău", price: 5000, rating: 4.8, count: 88, image: "/images/artists/serj-kuzenkov.jpg" },
  { id: 5, slug: "flower-design", name: "Flower Design", role: "Decor & Floristică", city: "Chișinău", price: 6000, rating: 4.8, count: 64, image: "/images/artists/irina-grekova.jpg" },
];

const CARD_IMAGES = [
  "/images/artists/victoria-lungu.jpg",
  "/images/artists/liviu-gulca.jpg",
  "/images/artists/igor-nedoseikin.jpg",
  "/images/artists/serj-kuzenkov.jpg",
  "/images/artists/irina-grekova.jpg",
];

export function FeaturedArtistsSection({ artists }: Props) {
  const { t, locale } = useLocale();
  const display: DisplayArtist[] = artists.length
    ? artists.slice(0, 5).map((a, i) => ({
        id: a.id,
        slug: a.slug,
        name: a.nameRo,
        // Real artist rows expose `location` (a city), not a display role/
        // category, so leave role blank rather than repeat the city.
        role: "",
        city: a.location ?? "",
        price: a.priceFrom,
        rating: a.ratingAvg,
        count: a.ratingCount,
        image: a.coverImageUrl || CARD_IMAGES[i % CARD_IMAGES.length],
      }))
    : process.env.NODE_ENV === "development"
      ? SAMPLE
      : [];

  if (!display.length) return null;

  const [hero, ...rest] = display;

  return (
    <section className="py-20">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <ScrollReveal>
          <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-heading text-3xl font-bold text-[#FAF8F2] md:text-[40px]">
              {t("home.artists.title")}
            </h2>
            <Link
              href="/artisti"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-gold transition-colors hover:text-gold-soft"
            >
              {t("home.artists.viewAll")} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </ScrollReveal>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Hero artist */}
          <ScrollReveal>
            <Link
              href={`/artisti/${hero.slug}`}
              className="group relative flex h-full min-h-[320px] flex-col justify-end overflow-hidden rounded-2xl"
            >
              { }
              <img
                src={hero.image}
                alt={hero.name}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
              {/* Play button */}
              <span className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-gold/90 text-[#0D0D0D] shadow-lg transition-transform group-hover:scale-110">
                <Play className="h-6 w-6 fill-current" />
              </span>
              <div className="relative z-10 p-6">
                <h3 className="font-heading text-2xl font-bold text-white">{hero.name}</h3>
                {hero.role && <p className="mt-1 text-gold">{hero.role}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-white/80">
                  {hero.city && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 text-gold" /> {hero.city}
                    </span>
                  )}
                  {hero.price ? <span>{t("home.common.from", { price: formatPrice(hero.price, null, locale) ?? "" })}</span> : null}
                  {hero.rating ? (
                    <span className="flex items-center gap-1">
                      <Star className="h-4 w-4 fill-gold text-gold" /> {hero.rating.toFixed(1)}
                      {hero.count ? <span className="text-white/50"> ({hero.count})</span> : null}
                    </span>
                  ) : null}
                </div>
              </div>
            </Link>
          </ScrollReveal>

          {/* Grid of the rest */}
          <div className="grid gap-4 sm:grid-cols-2">
            {rest.map((a, i) => (
              <ScrollReveal key={a.id} delay={i * 0.08}>
                <Link
                  href={`/artisti/${a.slug}`}
                  className="group flex h-full gap-4 overflow-hidden rounded-2xl border border-gold/15 bg-[#1A1A2E] p-3 transition-all hover:-translate-y-0.5 hover:border-gold/40"
                >
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl">
                    { }
                    <img
                      src={a.image}
                      alt={a.name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-center">
                    <h3 className="truncate font-heading text-base font-bold text-white">{a.name}</h3>
                    {a.role && <p className="truncate text-sm text-gold">{a.role}</p>}
                    {a.city && (
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-white/60">
                        <MapPin className="h-3 w-3" /> {a.city}
                      </p>
                    )}
                    <div className="mt-1.5 flex items-center justify-between text-xs">
                      {a.price ? <span className="text-white/80">{t("home.common.from", { price: formatPrice(a.price, null, locale) ?? "" })}</span> : <span />}
                      {a.rating ? (
                        <span className="flex items-center gap-1 text-white/80">
                          <Star className="h-3 w-3 fill-gold text-gold" /> {a.rating.toFixed(1)}
                          {a.count ? <span className="text-white/40"> ({a.count})</span> : null}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
