import Link from "@/components/shared/locale-link";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { metaForPath } from "@/lib/seo/page-meta";
import { ServiceIcon } from "@/components/public/service-icon";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";
import { getSupplyCounts } from "@/lib/db/queries/supply-counts";
import { t } from "@/i18n";
import { NOUNS, plural, type AllForms } from "@/lib/i18n/plural";

const SERVICES_PATH = "/servicii";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const meta = {
    ro: ["Servicii pentru Evenimente în Chișinău și Moldova", "Compară artiști, foto-video, decor, echipament și alte servicii pentru evenimente în Moldova în 2026."],
    ru: ["Услуги для событий в Кишиневе и Молдове", "Сравните артистов, фото, видео, декор, оборудование и другие услуги для событий в Молдове в 2026 году."],
    en: ["Event Services in Chișinău and Moldova", "Compare artists, photo, video, decor, equipment and other event services in Moldova in 2026."],
  }[locale];
  return metaForPath(SERVICES_PATH, {
    title: meta[0],
    description: meta[1],
  }, locale);
}

const serviceGroups = [
  { slug: "moderatori", nameKey: "services.groups.moderatori.name", descKey: "services.groups.moderatori.desc", image: "/images/categories/moderatori.jpg" },
  { slug: "dj", nameKey: "home.categories.dj", descKey: "services.groups.dj.desc", image: "/images/categories/dj.jpg" },
  { slug: "cantareti", nameKey: "services.groups.cantareti.name", descKey: "services.groups.cantareti.desc", image: "/images/categories/cantareti.jpg" },
  { slug: "formatii", nameKey: "services.groups.formatii.name", descKey: "services.groups.formatii.desc", image: "/images/categories/formatii.jpg" },
  { slug: "fotografi", nameKey: "services.groups.fotografi.name", descKey: "services.groups.fotografi.desc", image: "/images/categories/fotografi.jpg" },
  { slug: "videografi", nameKey: "services.groups.videografi.name", descKey: "services.groups.videografi.desc", image: "/images/categories/videografi.jpg" },
  { slug: "decor", nameKey: "home.categories.decor", descKey: "services.groups.decor.desc", image: "/images/categories/decor.jpg" },
  { slug: "animatori", nameKey: "services.groups.animatori.name", descKey: "services.groups.animatori.desc", image: "/images/categories/animatori.jpg" },
  { slug: "sali", nameKey: "nav.venues", descKey: "services.groups.sali.desc", image: "/images/categories/sali.jpg", href: "/sali" },
  { slug: "echipament-tehnic", nameKey: "services.groups.echipamentTehnic.name", descKey: "services.groups.echipamentTehnic.desc", image: "/images/categories/echipament.jpg" },
  { slug: "show-program", nameKey: "services.groups.showProgram.name", descKey: "services.groups.showProgram.desc", image: "/images/categories/show-program.jpg" },
] as const;

const popular = [
  { slug: "dj", nameKey: "services.popular.dj.name", noteKey: "services.popular.dj.note", image: "/images/backgrounds/party-dance.jpg" },
  { slug: "foto-video", nameKey: "services.popular.fotoVideo.name", noteKey: "services.popular.fotoVideo.note", image: "/images/categories/foto-video.jpg" },
  { slug: "decor", nameKey: "home.categories.decor", noteKey: "services.popular.decor.note", image: "/images/blog-decor.jpg" },
  { slug: "sali", nameKey: "nav.venues", noteKey: "services.popular.sali.note", image: "/images/venues/hall-4.jpg", href: "/sali" },
] as const;

// `slug` only picks the icon; the destination is spelled out per entry
// because these labels are buckets, not category slugs. "Toate" carries an
// icon name and belongs on this page, and venues are browsed on /sali rather
// than through the artist categories, so a blanket `/categorie/${slug}` would
// have missed both. The Catering bucket is gone for the same reason: candy
// bar / cake has no category row at all (see the note in
// src/lib/wizard/service-mapping.ts) -- put the pill back the day one is
// added in the admin panel.
const filters = [
  { labelKey: "common.all", slug: "sparkles", href: SERVICES_PATH },
  { labelKey: "services.filters.music", slug: "cantareti", href: "/categorie/cantareti" },
  { labelKey: "services.filters.photoVideo", slug: "fotografi", href: "/categorie/fotografi" },
  { labelKey: "services.filters.decor", slug: "decor", href: "/categorie/decor" },
  { labelKey: "nav.locations", slug: "sali", href: "/sali" },
  { labelKey: "services.filters.technical", slug: "echipament-tehnic", href: "/categorie/echipament-tehnic" },
  { labelKey: "services.filters.entertainment", slug: "show-program", href: "/categorie/show-program" },
] as const;

/**
 * Live supplier counts. These used to be hardcoded strings — "214 fotografi",
 * "138 locații", "156 soliști" — adding up to well over a thousand suppliers
 * on a marketplace that had ten. Whatever the catalogue holds, the page now
 * says so.
 */
// Plural forms live next to `plural()` rather than in the dictionary because
// agreement is a rule, not a phrase: RO needs "de" from 20 up and RU has
// three endings. `NOUNS` has no "professional" entry, so it is spelled here.
const PROFESSIONALS: AllForms = {
  ro: { one: "profesionist", few: "profesioniști", many: "profesioniști" },
  ru: { one: "профессионал", few: "профессионала", many: "профессионалов" },
  en: { one: "professional", other: "professionals" },
};

function supplyLabel(
  slug: string,
  supply: Awaited<ReturnType<typeof getSupplyCounts>>,
  locale: string,
): string | null {
  const n = slug === "sali" ? supply.activeVenues : supply.bySlug[slug];
  // No count rather than a count of zero: omitting the line says nothing,
  // while "0 profesioniști" on ten cards advertises the gap. The point of
  // this helper is that whatever it prints is true — not that it prints.
  if (!n) return null;
  return plural(n, locale, slug === "sali" ? NOUNS.venues : PROFESSIONALS);
}

export default async function ServicesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const supply = await getSupplyCounts();
  return (
    <div className="-mt-16 min-h-screen bg-[#020814] text-[#f6f0e5]">
      <section className="relative isolate overflow-hidden border-b border-[#e6b84d]/15 pt-16">
        <img
          src="/images/redesign/services-hero.webp"
          alt={t("services.hero.imageAlt", locale)}
          className="absolute inset-0 -z-20 h-full w-full object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(2,8,20,.46),rgba(2,8,20,.84)_65%,#020814)]" />
        <div className="mx-auto max-w-7xl px-4 pb-9 pt-7 lg:px-8">
          <nav className="mb-7 text-xs text-white/55">
            <Link href="/" className="hover:text-[#e6b84d]">{t("nav.home", locale)}</Link>
            <span className="mx-2">/</span>
            <span>{t("nav.services", locale)}</span>
          </nav>

          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[.36em] text-[#e6b84d]">
              {t("services.hero.eyebrow", locale)}
            </p>
            <h1 className="mt-3 font-heading text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              {t("services.hero.title", locale)}
            </h1>
            <p className="mt-3 text-base text-white/68">
              {t("services.hero.subtitle", locale)}
            </p>
          </div>

          <div className="mx-auto mt-7 flex max-w-5xl gap-1 overflow-x-auto rounded-full border border-white/10 bg-[#050b17]/72 p-1.5 backdrop-blur-xl">
            {filters.map((filter) => {
              // The row only ever renders on /servicii, but keying the
              // highlight off the destination instead of the index means
              // reordering the array can no longer light up the wrong pill.
              const isCurrent = filter.href === SERVICES_PATH;
              return (
                <Link
                  key={filter.labelKey}
                  href={filter.href}
                  aria-current={isCurrent ? "page" : undefined}
                  className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-xs transition-colors ${
                    isCurrent
                      ? "bg-[#e6b84d]/16 text-[#f3c75c] ring-1 ring-[#e6b84d]/35"
                      : "text-white/72 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <ServiceIcon slug={filter.slug} className="h-4 w-4" />
                  {t(filter.labelKey, locale)}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4 pb-16 pt-5 lg:px-8">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {serviceGroups.map((service) => (
            <Link
              key={service.slug}
              href={"href" in service ? service.href : `/categorie/${service.slug}`}
              className="group relative min-h-32 overflow-hidden rounded-xl border border-[#d9a93f]/35 bg-[#07101e] p-4 transition duration-300 hover:-translate-y-0.5 hover:border-[#efc456]/75 hover:shadow-[0_16px_38px_rgba(0,0,0,.32)]"
            >
              <img
                src={service.image}
                alt={t("services.card.imageAlt", locale, { name: t(service.nameKey, locale) })}
                className="absolute inset-0 h-full w-full object-cover opacity-24 transition duration-500 group-hover:scale-105 group-hover:opacity-34"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#030916] via-[#050b17]/88 to-[#050b17]/36" />
              <div className="relative flex h-full items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#e6b84d]/75 bg-[#06101e]/82 text-[#e6b84d] shadow-[0_0_24px_rgba(230,184,77,.08)]">
                  <ServiceIcon slug={service.slug} className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-heading text-lg font-semibold text-white">
                    {t(service.nameKey, locale)}
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-white/62">
                    {t(service.descKey, locale)}
                  </p>
                </div>
              </div>
              <div className="relative mt-4 flex items-center justify-between border-t border-white/9 pt-2.5 text-[11px] text-white/58">
                <span>{supplyLabel(service.slug, supply, locale) ?? ""}</span>
                <ArrowRight className="h-4 w-4 text-[#e6b84d] transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>

        <section className="relative mt-3 overflow-hidden rounded-xl border border-[#e6b84d]/55 bg-[linear-gradient(100deg,#081225,#120f1c,#081225)] px-5 py-5 sm:px-9">
          <Sparkles className="absolute -left-4 top-1/2 h-24 w-24 -translate-y-1/2 text-[#e6b84d]/12" />
          <div className="relative flex flex-col items-center gap-5 text-center md:flex-row md:text-left">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-[#e6b84d]/35 text-[#e6b84d]">
              <ServiceIcon slug="sparkles" className="h-8 w-8" />
            </div>
            <div className="flex-1">
              <h2 className="font-heading text-2xl font-semibold text-[#edc767]">
                {t("services.cta.title", locale)}
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/62">
                {t("services.cta.desc", locale)}
              </p>
            </div>
            <Link
              href="/planifica"
              className="inline-flex min-h-12 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#f0cd71,#d5a43d)] px-7 text-sm font-semibold text-[#07101d] shadow-[0_8px_28px_rgba(224,177,64,.2)] hover:brightness-105"
            >
              {t("services.cta.button", locale)}
            </Link>
            <span className="absolute bottom-2 right-8 hidden items-center gap-1 text-[11px] text-white/55 lg:flex">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#e6b84d]" />
              {t("services.cta.free", locale)}
            </span>
          </div>
        </section>

        <section className="mt-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-heading text-xl font-semibold">
              <span className="mr-2 text-[#e6b84d]">✦</span>
              {t("services.popular.title", locale)}
            </h2>
            <Link href="/categorii" className="inline-flex items-center gap-2 text-xs text-white/70 hover:text-[#e6b84d]">
              {t("services.popular.viewAll", locale)} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {popular.map((item) => (
              <Link
                key={item.slug}
                href={"href" in item ? item.href : `/categorie/${item.slug}`}
                className="group relative min-h-28 overflow-hidden rounded-xl border border-[#e6b84d]/30"
              >
                <img
                  src={item.image}
                  alt={t("services.popular.imageAlt", locale, { name: t(item.nameKey, locale) })}
                  className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#020814] via-[#020814]/72 to-black/20" />
                <span className="absolute left-3 top-3 rounded-full border border-[#e6b84d]/50 bg-[#0a101b]/78 px-2 py-1 text-[9px] font-medium text-[#efc456] backdrop-blur">
                  {t(item.noteKey, locale)}
                </span>
                <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e6b84d]/55 bg-black/38 text-[#e6b84d]">
                    <ServiceIcon slug={item.slug} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-heading text-base font-semibold text-white">{t(item.nameKey, locale)}</h3>
                    <p className="text-[10px] text-white/58">{supplyLabel(item.slug, supply, locale) ?? t(item.noteKey, locale)}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-[#e6b84d]" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
