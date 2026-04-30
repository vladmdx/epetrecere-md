import type { Metadata } from "next";
import Link from "next/link";
import { getAllCategories } from "@/lib/db/queries/categories";
import { generateMeta } from "@/lib/seo/generate-meta";
import { ScrollReveal } from "@/components/shared/scroll-reveal";
import { CategoryCard } from "./category-card";

// ISR: categories don't change often (admin adds/edits in panel) — refresh
// hourly is plenty.
export const revalidate = 3600;

export const metadata: Metadata = generateMeta({
  title: "Toate Categoriile — ePetrecere.md",
  description:
    "Descoperă toate categoriile de artiști și servicii pentru evenimente în Moldova: DJ, cântăreți, formații, fotografi, decor, animatori și multe altele.",
  path: "/categorii",
});

// Hardcoded local images for the categories that have them — DB image_url is
// optional and most rows are null. The fallback (gold gradient + emoji)
// renders nicely for everyone else.
const LOCAL_IMAGES: Record<string, string> = {
  moderatori: "/images/categories/moderatori.jpg",
  dj: "/images/categories/dj.jpg",
  cantareti: "/images/categories/cantareti.jpg",
  "cantareti-de-estrada": "/images/categories/cantareti.jpg",
  formatii: "/images/categories/formatii.jpg",
  fotografi: "/images/categories/fotografi.jpg",
  videografi: "/images/categories/videografi.jpg",
  decor: "/images/categories/decor.jpg",
  animatori: "/images/categories/animatori.jpg",
  "echipament-tehnic": "/images/categories/echipament.jpg",
  "show-program": "/images/categories/show-program.jpg",
  dansatori: "/images/categories/dansatori.jpg",
};

export default async function AllCategoriesPage() {
  const cats = await getAllCategories();
  // Show artist + service categories. Venues live on a separate /sali page.
  const visible = cats
    .filter((c) => c.type === "artist" || c.type === "service")
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const artists = visible.filter((c) => c.type === "artist");
  const services = visible.filter((c) => c.type === "service");

  return (
    <main className="relative min-h-screen pt-24 pb-20">
      {/* Same parallax background style as the homepage section, so the page
          feels like a natural extension of it. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <img
          src="/images/backgrounds/party-dance.jpg"
          alt=""
          className="parallax-bg h-full w-full object-cover opacity-[0.07] blur-[2px]"
          loading="lazy"
        />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 lg:px-8">
        <ScrollReveal>
          <div className="mb-12 text-center">
            <p className="mb-2 text-sm font-medium uppercase tracking-[3px] text-gold">
              Categorii
            </p>
            <h1 className="font-heading text-3xl font-bold md:text-5xl text-[#FAF8F2]">
              Toate Categoriile
            </h1>
            <p className="mt-4 text-base text-muted-foreground">
              Alege categoria de artiști sau servicii pentru evenimentul tău.
            </p>
          </div>
        </ScrollReveal>

        {/* Artists block */}
        {artists.length > 0 && (
          <section className="mb-16">
            <ScrollReveal>
              <h2 className="mb-6 font-heading text-2xl font-bold text-[#FAF8F2]">
                Artiști
              </h2>
            </ScrollReveal>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {artists.map((cat, i) => (
                <ScrollReveal key={cat.slug} delay={i * 0.04}>
                  <CategoryCard
                    slug={cat.slug}
                    name={cat.nameRo}
                    image={cat.imageUrl ?? LOCAL_IMAGES[cat.slug] ?? null}
                    priceFrom={cat.priceFrom}
                  />
                </ScrollReveal>
              ))}
            </div>
          </section>
        )}

        {/* Services block */}
        {services.length > 0 && (
          <section>
            <ScrollReveal>
              <h2 className="mb-6 font-heading text-2xl font-bold text-[#FAF8F2]">
                Servicii
              </h2>
            </ScrollReveal>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {services.map((cat, i) => (
                <ScrollReveal key={cat.slug} delay={i * 0.04}>
                  <CategoryCard
                    slug={cat.slug}
                    name={cat.nameRo}
                    image={cat.imageUrl ?? LOCAL_IMAGES[cat.slug] ?? null}
                    priceFrom={cat.priceFrom}
                  />
                </ScrollReveal>
              ))}
            </div>
          </section>
        )}

        <ScrollReveal delay={0.1}>
          <div className="mt-16 flex justify-center">
            <Link
              href="/artisti"
              className="inline-flex items-center gap-2 rounded-full bg-gold px-6 py-3 text-sm font-medium text-[#0D0D0D] transition-all hover:bg-gold-dark"
            >
              Vezi toți artiștii
              <span aria-hidden>→</span>
            </Link>
          </div>
        </ScrollReveal>
      </div>
    </main>
  );
}
