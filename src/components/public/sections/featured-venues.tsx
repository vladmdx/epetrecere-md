"use client";

import Link from "@/components/shared/locale-link";
import { Star, MapPin, Users, ArrowRight } from "lucide-react";
import { ScrollReveal } from "@/components/shared/scroll-reveal";
import { useLocale } from "@/hooks/use-locale";
import { formatPrice } from "@/lib/format/price";
import Image from "next/image";

interface VenueRow {
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
  venues: VenueRow[];
}

// Dev-only sample so the section is visible locally without a DB. Production
// always renders the real featured venues (and nothing if there are none).
const SAMPLE_VENUES: VenueRow[] = [
  { id: 1, slug: "sala-la-placinte", nameRo: "Sala de Ceremonii La Plăcinte", nameRu: null, nameEn: null, address: null, city: "Chișinău", capacityMin: null, capacityMax: 350, pricePerPerson: 12000, ratingAvg: 4.9, ratingCount: 128, isFeatured: true },
  { id: 2, slug: "castel-mimi-events", nameRo: "Castel Mimi Events", nameRu: null, nameEn: null, address: null, city: "Bulboaca", capacityMin: null, capacityMax: 250, pricePerPerson: 10500, ratingAvg: 4.8, ratingCount: 96, isFeatured: false },
  { id: 3, slug: "nobil-luxury-events", nameRo: "Nobil Luxury Events", nameRu: null, nameEn: null, address: null, city: "Chișinău", capacityMin: null, capacityMax: 350, pricePerPerson: 11500, ratingAvg: 4.9, ratingCount: 87, isFeatured: true },
];

export function FeaturedVenuesSection({ venues }: Props) {
  const { t, locale } = useLocale();
  const list = venues.length
    ? venues
    : process.env.NODE_ENV === "development"
      ? SAMPLE_VENUES
      : [];
  if (!list.length) return null;

  return (
    <section className="bg-[#FAF8F2] py-20 text-[#2C2C3A]">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <ScrollReveal>
          <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[3px] text-gold-dark">
                {t("home.venues.eyebrow")}
              </p>
              <h2 className="font-heading text-3xl font-bold md:text-[40px]">
                {t("home.venues.title")}
              </h2>
            </div>
            <Link
              href="/sali"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-gold-dark transition-colors hover:text-gold"
            >
              {t("home.venues.viewAll")} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {list.slice(0, 3).map((v, i) => {
            const name = v.nameRo;
            const badge = v.isFeatured ? t("home.venues.premium") : t("home.venues.recommended");
            return (
              <ScrollReveal key={v.id} delay={i * 0.1}>
                <div className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[#E4DECF] bg-white shadow-[0_2px_16px_rgba(0,0,0,0.04)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(0,0,0,0.10)]">
                  <div className="relative aspect-[16/10] overflow-hidden">
                    <Image
                      src={v.coverImageUrl || `/images/venues/hall-${(v.id % 6) + 1}.jpg`}
                      alt={name}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <span className="absolute left-3 top-3 rounded-full bg-gold px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#0D0D0D] shadow">
                      {badge}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="font-heading text-lg font-bold">{name}</h3>
                    {v.city && (
                      <p className="mt-1.5 flex items-center gap-1.5 text-sm text-[#6B6B7B]">
                        <MapPin className="h-3.5 w-3.5 text-gold-dark" /> {v.city}
                      </p>
                    )}
                    <div className="mt-3 space-y-1.5 text-sm text-[#6B6B7B]">
                      {v.capacityMax && (
                        <p className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-gold-dark" /> {t("home.venues.capacity", { n: v.capacityMax })}
                        </p>
                      )}
                      {v.pricePerPerson ? (
                        <p className="font-semibold text-[#2C2C3A]">{t("home.common.from", { price: formatPrice(v.pricePerPerson, null, locale) ?? "" })}</p>
                      ) : null}
                    </div>

                    <div className="mt-auto flex items-center justify-between pt-4">
                      {v.ratingAvg ? (
                        <span className="flex items-center gap-1 text-sm font-medium">
                          <Star className="h-4 w-4 fill-gold text-gold" />
                          {v.ratingAvg.toFixed(1)}
                          {v.ratingCount ? (
                            <span className="text-[#9A9A8C]"> ({v.ratingCount})</span>
                          ) : null}
                        </span>
                      ) : <span />}
                      <Link
                        href={`/sali/${v.slug}`}
                        className="rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-sm font-semibold text-gold-dark transition-colors hover:bg-gold hover:text-[#0D0D0D]"
                      >
                        {t("home.venues.view")}
                      </Link>
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
