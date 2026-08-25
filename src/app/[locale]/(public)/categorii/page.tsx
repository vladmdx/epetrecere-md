import Link from "@/components/shared/locale-link";
import { getAllCategories } from "@/lib/db/queries/categories";
import { metaForPath } from "@/lib/seo/page-meta";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";
import { ScrollReveal } from "@/components/shared/scroll-reveal";
import { CategoryCard } from "./category-card";

// ISR: categories don't change often (admin adds/edits in panel) — refresh
// hourly is plenty.
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  // All three languages up front — metaForPath serves the one the route
  // parameter names. The RO title no longer spells out the brand, which the
  // root layout template appended a second time.
  return metaForPath("/categorii", {
    ro: {
      title: "Toate categoriile de artiști și servicii",
      description:
        "Descoperă toate categoriile de artiști și servicii pentru evenimente în Moldova: DJ, cântăreți, formații, fotografi, decor, animatori și multe altele.",
    },
    ru: {
      title: "Все категории артистов и услуг",
      description:
        "Все категории артистов и услуг для мероприятий в Молдове: диджеи, певцы, группы, фотографы, декор, аниматоры и многое другое.",
    },
    en: {
      title: "All Artist and Service Categories",
      description:
        "Every category of artists and event services in Moldova: DJs, singers, bands, photographers, decor, entertainers and much more.",
    },
  }, locale);
}

// Local images for every category. DB image_url is optional — most rows are
// null — so we map slug → filename in /public/images/categories. Fallback
// (gold gradient + emoji) only kicks in for slugs not listed here.
const LOCAL_IMAGES: Record<string, string> = {
  // Music
  moderatori: "/images/categories/moderatori.jpg",
  dj: "/images/categories/dj.jpg",
  cantareti: "/images/categories/cantareti.jpg",
  "cantareti-de-estrada": "/images/categories/cantareti.jpg",
  "interpreti-muzica-populara": "/images/categories/interpreti-muzica-populara.jpg",
  formatii: "/images/categories/formatii.jpg",
  "cover-band": "/images/categories/cover-band.jpg",
  instrumentalisti: "/images/categories/instrumentalisti.jpg",
  cvartet: "/images/categories/cvartet.jpg",
  // Dance
  dansatori: "/images/categories/dansatori.jpg",
  "dansuri-populare": "/images/categories/dansuri-populare.jpg",
  "ansamblu-tiganesc": "/images/categories/ansamblu-tiganesc.jpg",
  "dans-oriental": "/images/categories/dans-oriental.jpg",
  striptiz: "/images/categories/striptiz.jpg",
  // Show
  "show-program": "/images/categories/show-program.jpg",
  "iluzionisti-magicieni": "/images/categories/iluzionisti-magicieni.jpg",
  animatori: "/images/categories/animatori.jpg",
  "show-ul-focului": "/images/categories/show-ul-focului.jpg",
  clovni: "/images/categories/clovni.jpg",
  "interesant-la-sarbatoare": "/images/categories/interesant-la-sarbatoare.jpg",
  "show-circus": "/images/categories/show-circus.jpg",
  "stand-up": "/images/categories/stand-up.jpg",
  "mos-craciun": "/images/categories/mos-craciun.jpg",
  // Services
  fotografi: "/images/categories/fotografi.jpg",
  videografi: "/images/categories/videografi.jpg",
  decor: "/images/categories/decor.jpg",
  "echipament-tehnic": "/images/categories/echipament.jpg",
  "foto-video": "/images/categories/foto-video.jpg",
  "foto-zona-selfie": "/images/categories/foto-zona-selfie.jpg",
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
                    imageAlt={cat.imageAlt}
                    priceFrom={cat.priceFrom}
                    badge={cat.badge}
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
                    imageAlt={cat.imageAlt}
                    priceFrom={cat.priceFrom}
                    badge={cat.badge}
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
