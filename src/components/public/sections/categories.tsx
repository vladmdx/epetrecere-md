"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale } from "@/hooks/use-locale";
import { ScrollReveal } from "@/components/shared/scroll-reveal";

// 12 slugs picked for the homepage hero grid. Order is significant — the
// homepage shows them in this order. Anything beyond this list lives on the
// /categorii page.
const HOMEPAGE_SLUGS = [
  "moderatori",
  "dj",
  "cantareti-de-estrada",
  "formatii",
  "fotografi",
  "videografi",
  "decor",
  "animatori",
  "echipament-tehnic",
  "show-program",
  "dansatori",
  "iluzionisti-magicieni",
];

// Local fallback images bundled with the app. DB image_url overrides these
// when present so admins can swap art without touching the repo.
const LOCAL_IMAGES: Record<string, string> = {
  moderatori: "/images/categories/moderatori.jpg",
  dj: "/images/categories/dj.jpg",
  "cantareti-de-estrada": "/images/categories/cantareti.jpg",
  cantareti: "/images/categories/cantareti.jpg",
  formatii: "/images/categories/formatii.jpg",
  fotografi: "/images/categories/fotografi.jpg",
  videografi: "/images/categories/videografi.jpg",
  decor: "/images/categories/decor.jpg",
  animatori: "/images/categories/animatori.jpg",
  "echipament-tehnic": "/images/categories/echipament.jpg",
  "show-program": "/images/categories/show-program.jpg",
  dansatori: "/images/categories/dansatori.jpg",
  "iluzionisti-magicieni": "/images/categories/iluzionisti-magicieni.jpg",
  "interpreti-muzica-populara": "/images/categories/interpreti-muzica-populara.jpg",
  "cover-band": "/images/categories/cover-band.jpg",
  instrumentalisti: "/images/categories/instrumentalisti.jpg",
  cvartet: "/images/categories/cvartet.jpg",
  "dansuri-populare": "/images/categories/dansuri-populare.jpg",
  "ansamblu-tiganesc": "/images/categories/ansamblu-tiganesc.jpg",
  "dans-oriental": "/images/categories/dans-oriental.jpg",
  striptiz: "/images/categories/striptiz.jpg",
  "show-ul-focului": "/images/categories/show-ul-focului.jpg",
  clovni: "/images/categories/clovni.jpg",
  "interesant-la-sarbatoare": "/images/categories/interesant-la-sarbatoare.jpg",
  "show-circus": "/images/categories/show-circus.jpg",
  "stand-up": "/images/categories/stand-up.jpg",
  "mos-craciun": "/images/categories/mos-craciun.jpg",
  "foto-video": "/images/categories/foto-video.jpg",
  "foto-zona-selfie": "/images/categories/foto-zona-selfie.jpg",
  sali: "/images/categories/sali.jpg",
};

// Translated names for the homepage tile. Used when DB doesn't supply a
// localized name for the active locale (it always supplies nameRo at least).
const NAME_FALLBACK: Record<string, Record<string, string>> = {
  moderatori: { ro: "Moderatori / MC", ru: "Ведущие", en: "MCs / Hosts" },
  dj: { ro: "DJ", ru: "DJ", en: "DJ" },
  "cantareti-de-estrada": { ro: "Cântăreți", ru: "Певцы", en: "Singers" },
  formatii: { ro: "Formații", ru: "Группы", en: "Bands" },
  fotografi: { ro: "Fotografi", ru: "Фотографы", en: "Photographers" },
  videografi: { ro: "Videografi", ru: "Видеографы", en: "Videographers" },
  decor: { ro: "Decor & Floristică", ru: "Декор", en: "Decor & Floristry" },
  animatori: { ro: "Animatori", ru: "Аниматоры", en: "Animators" },
  "echipament-tehnic": { ro: "Echipament Tehnic", ru: "Оборудование", en: "Equipment" },
  "show-program": { ro: "Show Program", ru: "Шоу Программа", en: "Show Program" },
  dansatori: { ro: "Dansatori", ru: "Танцоры", en: "Dancers" },
  "iluzionisti-magicieni": { ro: "Iluzioniști", ru: "Иллюзионисты", en: "Magicians" },
};

interface CategoryRow {
  id: number;
  slug: string;
  nameRo: string;
  nameRu: string | null;
  nameEn: string | null;
  imageUrl: string | null;
  badge: string | null;
  priceFrom: number | null;
  isActive?: boolean;
}

export function CategoriesSection() {
  const { t, locale } = useLocale();
  const [dbCategories, setDbCategories] = useState<CategoryRow[]>([]);

  // Fetch DB categories so admin-uploaded images + badges appear here.
  // Falls back to LOCAL_IMAGES if a row has no image_url. We keep the tile
  // list and order driven by HOMEPAGE_SLUGS so the layout stays predictable.
  useEffect(() => {
    let alive = true;
    fetch("/api/categories", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: unknown) => {
        if (!alive) return;
        const list = Array.isArray(rows) ? (rows as CategoryRow[]) : [];
        setDbCategories(list);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const bySlug = new Map(dbCategories.map((c) => [c.slug, c]));

  // Build the 12 tiles, merging DB overrides with the static defaults.
  const tiles = HOMEPAGE_SLUGS.map((slug) => {
    const db = bySlug.get(slug);
    const localizedName = (() => {
      if (db) {
        if (locale === "ru" && db.nameRu) return db.nameRu;
        if (locale === "en" && db.nameEn) return db.nameEn;
        return db.nameRo;
      }
      return NAME_FALLBACK[slug]?.[locale] || slug;
    })();
    return {
      slug,
      name: localizedName,
      image: db?.imageUrl || LOCAL_IMAGES[slug] || "",
      badge: db?.badge ?? null,
      priceFrom: db?.priceFrom ?? null,
    };
  });

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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {tiles.map((cat, i) => (
            <ScrollReveal key={cat.slug} delay={i * 0.05}>
              <Link
                href={`/categorie/${cat.slug}`}
                className="group relative block overflow-hidden rounded-xl card-premium"
              >
                {/* Image */}
                <div className="relative aspect-[4/3] overflow-hidden">
                  <img
                    src={cat.image}
                    alt={cat.name}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    loading="lazy"
                  />
                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                  {/* Admin-controlled badge (top-right pill) */}
                  {cat.badge && (
                    <span className="absolute right-3 top-3 rounded-full bg-gold px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#0D0D0D] shadow-lg">
                      {cat.badge}
                    </span>
                  )}
                </div>

                {/* Text on overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <h3 className="font-heading text-base font-bold text-white">
                    {cat.name}
                  </h3>
                  {cat.priceFrom && cat.priceFrom > 0 && (
                    <p className="font-accent text-sm text-gold mt-1">
                      {t("common.from")} {cat.priceFrom}€
                    </p>
                  )}
                </div>
              </Link>
            </ScrollReveal>
          ))}
        </div>

        {/* See-all CTA — opens the full categories page in the same style. */}
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
