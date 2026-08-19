"use client";

import Link from "@/components/shared/locale-link";
import { ScrollReveal } from "@/components/shared/scroll-reveal";
import { useLocale } from "@/hooks/use-locale";
import { plural, NOUNS } from "@/lib/i18n/plural";

// "Explorează cele mai căutate servicii" — a curated bento of the top service
// groups with marketing supply counts. Static by design (fixed groupings for
// the homepage); the full list lives on /categorii. Names come from i18n
// (home.categories.<key>), counts are interpolated into home.categories.suppliers.
interface Tile {
  key: string;
  image: string;
  href: string;
  className: string; // grid placement
}

const TILES: Tile[] = [
  {
    key: "venues",
    image: "/images/redesign/home/home-category-venues.webp",
    href: "/sali",
    className: "md:col-span-1 md:row-span-2",
  },
  {
    key: "bands",
    image: "/images/redesign/home/home-category-bands.webp",
    href: "/categorie/formatii",
    className: "md:col-span-2",
  },
  {
    key: "dj",
    image: "/images/redesign/home/home-category-dj.webp",
    href: "/categorie/dj",
    className: "md:col-span-1",
  },
  {
    key: "photo",
    image: "/images/redesign/home/home-category-photo-video.webp",
    href: "/categorie/fotografi",
    className: "md:col-span-1",
  },
  {
    key: "hosts",
    image: "/images/redesign/home/home-category-host.webp",
    href: "/categorie/moderatori",
    className: "md:col-span-1",
  },
  {
    key: "decor",
    image: "/images/redesign/home/home-category-decor.webp",
    href: "/categorie/decor",
    className: "md:col-span-1",
  },
];

export function CategoriesSection({
  counts,
}: {
  /** Real per-category supply from the DB. Omitted → no counter is shown. */
  counts?: Record<string, number>;
}) {
  const { t, locale } = useLocale();

  return (
    <section className="py-20">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <ScrollReveal>
          <div className="mb-12 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[3px] text-gold">
              {t("home.categories.eyebrow")}
            </p>
            <h2 className="font-heading text-3xl font-bold text-[#FAF8F2] md:text-[40px]">
              {t("home.categories.title")}
            </h2>
          </div>
        </ScrollReveal>

        <div className="grid auto-rows-[180px] grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
          {TILES.map((tile, i) => {
            const name = t(`home.categories.${tile.key}`);
            return (
              <ScrollReveal key={tile.key} delay={i * 0.06} className={tile.className}>
                <Link
                  href={tile.href}
                  className="group relative flex h-full w-full items-end overflow-hidden rounded-2xl"
                >
                  { }
                  <img
                    src={tile.image}
                    alt={name}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent transition-opacity group-hover:from-black/90" />
                  <div className="relative z-10 p-5">
                    <h3 className="font-heading text-lg font-bold text-white md:text-xl">
                      {name}
                    </h3>
                    {typeof counts?.[tile.key] === "number" && counts[tile.key]! > 0 && (
                      <p className="mt-0.5 text-sm text-gold">
                        {plural(counts[tile.key]!, locale, NOUNS.suppliers)}
                      </p>
                    )}
                  </div>
                  <span className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10 transition-all group-hover:ring-gold/40" />
                </Link>
              </ScrollReveal>
            );
          })}
        </div>

        <ScrollReveal delay={0.2}>
          <div className="mt-10 flex justify-center">
            <Link
              href="/categorii"
              className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-6 py-3 text-sm font-medium text-gold transition-all hover:bg-gold hover:text-[#0D0D0D]"
            >
              {t("home.categories.viewAll")}
              <span aria-hidden>→</span>
            </Link>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
