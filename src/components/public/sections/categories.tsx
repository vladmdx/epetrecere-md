"use client";

import Link from "next/link";
import { ScrollReveal } from "@/components/shared/scroll-reveal";

// "Explorează cele mai căutate servicii" — a curated bento of the top service
// groups with marketing supply counts. Static by design (fixed groupings for
// the homepage); the full list lives on /categorii.
interface Tile {
  name: string;
  count: string;
  image: string;
  href: string;
  className: string; // grid placement
}

const TILES: Tile[] = [
  {
    name: "Săli & Restaurante",
    count: "120+ furnizori",
    image: "/images/categories/sali.jpg",
    href: "/sali",
    className: "md:col-span-1 md:row-span-2",
  },
  {
    name: "Muzicieni și Formații",
    count: "150+ furnizori",
    image: "/images/categories/formatii.jpg",
    href: "/categorie/formatii",
    className: "md:col-span-2",
  },
  {
    name: "DJ",
    count: "80+ furnizori",
    image: "/images/categories/dj.jpg",
    href: "/categorie/dj",
    className: "md:col-span-1",
  },
  {
    name: "Fotografi & Videografi",
    count: "110+ furnizori",
    image: "/images/categories/fotografi.jpg",
    href: "/categorie/fotografi",
    className: "md:col-span-1",
  },
  {
    name: "Prezentatori",
    count: "60+ furnizori",
    image: "/images/categories/moderatori.jpg",
    href: "/categorie/moderatori",
    className: "md:col-span-1",
  },
  {
    name: "Decor & Floristică",
    count: "90+ furnizori",
    image: "/images/categories/decor.jpg",
    href: "/categorie/decor",
    className: "md:col-span-1",
  },
];

export function CategoriesSection() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <ScrollReveal>
          <div className="mb-12 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[3px] text-gold">
              Categorii populare
            </p>
            <h2 className="font-heading text-3xl font-bold text-[#FAF8F2] md:text-[40px]">
              Explorează cele mai căutate servicii
            </h2>
          </div>
        </ScrollReveal>

        <div className="grid auto-rows-[180px] grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
          {TILES.map((tile, i) => (
            <ScrollReveal key={tile.name} delay={i * 0.06} className={tile.className}>
              <Link
                href={tile.href}
                className="group relative flex h-full w-full items-end overflow-hidden rounded-2xl"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={tile.image}
                  alt={tile.name}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent transition-opacity group-hover:from-black/90" />
                <div className="relative z-10 p-5">
                  <h3 className="font-heading text-lg font-bold text-white md:text-xl">
                    {tile.name}
                  </h3>
                  <p className="mt-0.5 text-sm text-gold">{tile.count}</p>
                </div>
                <span className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10 transition-all group-hover:ring-gold/40" />
              </Link>
            </ScrollReveal>
          ))}
        </div>

        <ScrollReveal delay={0.2}>
          <div className="mt-10 flex justify-center">
            <Link
              href="/categorii"
              className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-6 py-3 text-sm font-medium text-gold transition-all hover:bg-gold hover:text-[#0D0D0D]"
            >
              Vezi toate categoriile
              <span aria-hidden>→</span>
            </Link>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
