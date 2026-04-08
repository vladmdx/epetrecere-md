"use client";

import Link from "next/link";
import { useLocale } from "@/hooks/use-locale";
import { ScrollReveal } from "@/components/shared/scroll-reveal";

const categories = [
  { slug: "moderatori", image: "/images/categories/moderatori.jpg", price: 200 },
  { slug: "dj", image: "/images/categories/dj.jpg", price: 150 },
  { slug: "cantareti-de-estrada", image: "/images/categories/cantareti.jpg", price: 300 },
  { slug: "formatii", image: "/images/categories/formatii.jpg", price: 500 },
  { slug: "fotografi", image: "/images/categories/fotografi.jpg", price: 200 },
  { slug: "videografi", image: "/images/categories/videografi.jpg", price: 250 },
  { slug: "decor", image: "/images/categories/decor.jpg", price: 100 },
  { slug: "animatori", image: "/images/categories/animatori.jpg", price: 100 },
  { slug: "sali", image: "/images/categories/sali.jpg", price: 25 },
  { slug: "echipament-tehnic", image: "/images/categories/echipament.jpg", price: 100 },
  { slug: "show-program", image: "/images/categories/show-program.jpg", price: 200 },
  { slug: "dansatori", image: "/images/categories/dansatori.jpg", price: 150 },
];

const categoryNames: Record<string, Record<string, string>> = {
  moderatori: { ro: "Moderatori / MC", ru: "Ведущие", en: "MCs / Hosts" },
  dj: { ro: "DJ", ru: "DJ", en: "DJ" },
  "cantareti-de-estrada": { ro: "Cântăreți", ru: "Певцы", en: "Singers" },
  formatii: { ro: "Formații", ru: "Группы", en: "Bands" },
  fotografi: { ro: "Fotografi", ru: "Фотографы", en: "Photographers" },
  videografi: { ro: "Videografi", ru: "Видеографы", en: "Videographers" },
  decor: { ro: "Decor & Floristică", ru: "Декор", en: "Decor & Floristry" },
  animatori: { ro: "Animatori", ru: "Аниматоры", en: "Animators" },
  sali: { ro: "Săli & Restaurante", ru: "Залы", en: "Venues" },
  "echipament-tehnic": { ro: "Echipament Tehnic", ru: "Оборудование", en: "Equipment" },
  "show-program": { ro: "Show Program", ru: "Шоу Программа", en: "Show Program" },
  dansatori: { ro: "Dansatori", ru: "Танцоры", en: "Dancers" },
};

export function CategoriesSection() {
  const { t, locale } = useLocale();

  return (
    <section className="py-20 relative">
      {/* Parallax background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <img src="/images/backgrounds/party-dance.jpg" alt="" className="w-full h-full object-cover opacity-[0.07] blur-[2px] parallax-bg" loading="lazy" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 lg:px-8">
        <ScrollReveal>
          <div className="mb-12 text-center">
            <p className="mb-2 text-sm font-medium uppercase tracking-[3px] text-gold">
              {t("categories.subtitle")}
            </p>
            <h2 className="font-heading text-3xl font-bold md:text-4xl text-[#FAF8F2]">
              {t("categories.title")}
            </h2>
          </div>
        </ScrollReveal>

        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {categories.map((cat, i) => (
            <ScrollReveal key={cat.slug} delay={i * 0.05}>
              <Link
                href={`/categorie/${cat.slug}`}
                className="group relative block overflow-hidden rounded-xl card-premium"
              >
                {/* Image */}
                <div className="relative aspect-[4/3] overflow-hidden">
                  <img
                    src={cat.image}
                    alt={categoryNames[cat.slug]?.[locale] || cat.slug}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    loading="lazy"
                  />
                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                </div>

                {/* Text on overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <h3 className="font-heading text-base font-bold text-white">
                    {categoryNames[cat.slug]?.[locale] || cat.slug}
                  </h3>
                  <p className="font-accent text-sm text-gold mt-1">
                    {t("common.from")} {cat.price}€
                  </p>
                </div>
              </Link>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
