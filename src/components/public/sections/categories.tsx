"use client";

import Link from "next/link";
import { useLocale } from "@/hooks/use-locale";
import {
  Mic,
  Music,
  Guitar,
  Disc3,
  Camera,
  Video,
  Palette,
  PartyPopper,
  Building2,
  Speaker,
  Star,
  Sparkles,
} from "lucide-react";

const categories = [
  { slug: "moderatori", icon: Mic, price: 200 },
  { slug: "dj", icon: Disc3, price: 150 },
  { slug: "cantareti", icon: Music, price: 300 },
  { slug: "formatii", icon: Guitar, price: 500 },
  { slug: "fotografi", icon: Camera, price: 200 },
  { slug: "videografi", icon: Video, price: 250 },
  { slug: "decor", icon: Palette, price: 100 },
  { slug: "animatori", icon: PartyPopper, price: 100 },
  { slug: "sali", icon: Building2, price: 25 },
  { slug: "echipament", icon: Speaker, price: 100 },
  { slug: "show-program", icon: Star, price: 200 },
  { slug: "alte-servicii", icon: Sparkles, price: 50 },
];

const categoryNames: Record<string, Record<string, string>> = {
  moderatori: { ro: "Moderatori / MC", ru: "Ведущие", en: "MCs / Hosts" },
  dj: { ro: "DJ", ru: "DJ", en: "DJ" },
  cantareti: { ro: "Cântăreți", ru: "Певцы", en: "Singers" },
  formatii: { ro: "Formații", ru: "Группы", en: "Bands" },
  fotografi: { ro: "Fotografi", ru: "Фотографы", en: "Photographers" },
  videografi: { ro: "Videografi", ru: "Видеографы", en: "Videographers" },
  decor: { ro: "Decor & Floristică", ru: "Декор", en: "Decor & Floristry" },
  animatori: { ro: "Animatori", ru: "Аниматоры", en: "Animators" },
  sali: { ro: "Săli & Restaurante", ru: "Залы", en: "Venues" },
  echipament: { ro: "Echipament Tehnic", ru: "Оборудование", en: "Equipment" },
  "show-program": { ro: "Show Program", ru: "Шоу Программа", en: "Show Program" },
  "alte-servicii": { ro: "Alte Servicii", ru: "Другие Услуги", en: "Other Services" },
};

export function CategoriesSection() {
  const { t, locale } = useLocale();

  return (
    <section className="py-20">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="mb-12 text-center">
          <p className="mb-2 text-sm font-medium uppercase tracking-[3px] text-gold">
            {t("categories.subtitle")}
          </p>
          <h2 className="font-heading text-3xl font-bold md:text-4xl">
            {t("categories.title")}
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {categories.map((cat, i) => (
            <Link
              key={cat.slug}
              href={`/categorie/${cat.slug}`}
              className="group flex flex-col items-center gap-3 rounded-xl border border-border/40 bg-card p-6 text-center transition-all duration-300 hover:border-gold/30 hover:shadow-[0_4px_20px_rgba(201,168,76,0.15)] hover:-translate-y-1 animate-fade-up"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gold/10 text-gold transition-colors group-hover:bg-gold/20">
                <cat.icon className="h-7 w-7" />
              </div>
              <h3 className="font-heading text-sm font-bold">
                {categoryNames[cat.slug]?.[locale] || cat.slug}
              </h3>
              <p className="font-accent text-sm text-gold">
                {t("common.from")} {cat.price}€
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
