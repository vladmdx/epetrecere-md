"use client";

import Link from "next/link";
import { Star, MapPin, Users, ArrowRight } from "lucide-react";
import { ScrollReveal } from "@/components/shared/scroll-reveal";

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

function fmt(n: number) {
  return n.toLocaleString("ro-RO");
}

export function FeaturedVenuesSection({ venues }: Props) {
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
                Categorii populare
              </p>
              <h2 className="font-heading text-3xl font-bold md:text-[40px]">
                Spații care transformă orice eveniment
              </h2>
            </div>
            <Link
              href="/sali"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-gold-dark transition-colors hover:text-gold"
            >
              Vezi toate locațiile <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {list.slice(0, 3).map((v, i) => {
            const name = v.nameRo;
            const badge = v.isFeatured ? "Premium" : "Recomandat";
            return (
              <ScrollReveal key={v.id} delay={i * 0.1}>
                <div className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[#E4DECF] bg-white shadow-[0_2px_16px_rgba(0,0,0,0.04)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(0,0,0,0.10)]">
                  <div className="relative aspect-[16/10] overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/images/venues/hall-${(v.id % 6) + 1}.jpg`}
                      alt={name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
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
                          <Users className="h-3.5 w-3.5 text-gold-dark" /> Până la {v.capacityMax} invitați
                        </p>
                      )}
                      {v.pricePerPerson ? (
                        <p className="font-semibold text-[#2C2C3A]">de la {fmt(v.pricePerPerson)} MDL</p>
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
                        Vezi locația
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
