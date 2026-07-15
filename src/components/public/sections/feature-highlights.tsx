"use client";

import Link from "next/link";
import { MapPin, Music, ClipboardList, ArrowRight } from "lucide-react";
import { ScrollReveal } from "@/components/shared/scroll-reveal";

// "Tot ce ai nevoie pentru un eveniment reușit" — three top-level entry points
// (venues / artists / services) on a light section. Copy is RO-first; i18n
// keys can be layered on later.
const CARDS = [
  {
    icon: MapPin,
    image: "/images/categories/sali.jpg",
    title: "Găsește locația ideală",
    description:
      "Descoperă spații premium pentru nunți, botezuri, petreceri private și evenimente corporate.",
    cta: "Explorează locații",
    href: "/sali",
  },
  {
    icon: Music,
    image: "/images/categories/formatii.jpg",
    title: "Descoperă artiști și prestatori",
    description:
      "Muzicieni, DJ, prezentatori, fotografi și alți profesioniști care aduc evenimentul tău la viață.",
    cta: "Explorează artiști",
    href: "/artisti",
  },
  {
    icon: ClipboardList,
    image: "/images/categories/decor.jpg",
    title: "Planifică întregul eveniment",
    description:
      "Servicii complete: decor, floristică, catering, tehnică și multe altele, într-un singur loc.",
    cta: "Deschide planificatorul",
    href: "/planifica",
  },
];

export function FeatureHighlightsSection() {
  return (
    <section className="bg-[#FAF8F2] py-20 text-[#2C2C3A]">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <ScrollReveal>
          <div className="mb-14 text-center">
            <span className="mb-3 inline-block text-gold">✦</span>
            <h2 className="font-heading text-3xl font-bold md:text-[40px] md:leading-tight">
              Tot ce ai nevoie pentru un eveniment reușit
            </h2>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {CARDS.map((card, i) => (
            <ScrollReveal key={card.title} delay={i * 0.1}>
              <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[#E4DECF] bg-white shadow-[0_2px_16px_rgba(0,0,0,0.04)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(0,0,0,0.10)]">
                {/* Image */}
                <div className="relative h-44 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={card.image}
                    alt={card.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
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
                  <h3 className="font-heading text-xl font-bold">{card.title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-[#6B6B7B]">
                    {card.description}
                  </p>
                  <Link
                    href={card.href}
                    className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-gold-dark transition-colors hover:text-gold"
                  >
                    {card.cta}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
