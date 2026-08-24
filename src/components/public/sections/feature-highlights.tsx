"use client";

import Link from "@/components/shared/locale-link";
import { MapPin, Music, ClipboardList, ArrowRight } from "lucide-react";
import { ScrollReveal } from "@/components/shared/scroll-reveal";
import { useLocale } from "@/hooks/use-locale";
import Image from "next/image";

// "Tot ce ai nevoie pentru un eveniment reușit" — three top-level entry points
// (venues / artists / planner) on a light section. Copy lives in i18n under
// home.features.<key>{Title,Desc,Cta}.
const CARDS = [
  { key: "venues", icon: MapPin, image: "/images/redesign/home/home-feature-venue.webp", href: "/sali" },
  { key: "artists", icon: Music, image: "/images/redesign/home/home-feature-artists.webp", href: "/artisti" },
  { key: "planner", icon: ClipboardList, image: "/images/redesign/home/home-feature-planner.webp", href: "/planifica" },
] as const;

export function FeatureHighlightsSection() {
  const { t } = useLocale();

  return (
    <section className="bg-[#FAF8F2] py-20 text-[#2C2C3A]">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <ScrollReveal>
          <div className="mb-14 text-center">
            <span className="mb-3 inline-block text-gold">✦</span>
            <h2 className="font-heading text-3xl font-bold md:text-[40px] md:leading-tight">
              {t("home.features.title")}
            </h2>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {CARDS.map((card, i) => {
            const title = t(`home.features.${card.key}Title`);
            return (
              <ScrollReveal key={card.key} delay={i * 0.1}>
                <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[#E4DECF] bg-white shadow-[0_2px_16px_rgba(0,0,0,0.04)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(0,0,0,0.10)]">
                  {/* Image */}
                  <div className="relative h-44 overflow-hidden">
                    <Image
                      src={card.image}
                      alt={title}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                  </div>

                  {/* Icon badge — sits on the image/body seam, at card level so
                      the image's overflow-hidden doesn't clip it. */}
                  <div className="absolute left-6 top-[152px] flex h-12 w-12 items-center justify-center rounded-full border border-gold/30 bg-[#1A1A2E] shadow-lg">
                    <card.icon className="h-5 w-5 text-gold" />
                  </div>

                  {/* Body */}
                  <div className="flex flex-1 flex-col px-6 pb-6 pt-9">
                    <h3 className="font-heading text-xl font-bold">{title}</h3>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-[#6B6B7B]">
                      {t(`home.features.${card.key}Desc`)}
                    </p>
                    <Link
                      href={card.href}
                      className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-gold-dark transition-colors hover:text-gold"
                    >
                      {t(`home.features.${card.key}Cta`)}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
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
