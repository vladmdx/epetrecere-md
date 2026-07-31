import Link from "next/link";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { metaForPath } from "@/lib/seo/page-meta";
import { ServiceIcon } from "@/components/public/service-icon";

export async function generateMetadata() {
  return metaForPath("/servicii", {
    title: "Servicii pentru Evenimente",
    description:
      "Toate serviciile disponibile pentru evenimentul tău: artiști, fotografi, videografi, decor, echipament și multe altele.",
  });
}

const serviceGroups = [
  { slug: "moderatori", name: "Moderatori / MC", count: "128 artiști", desc: "Profesioniști care conduc ceremonia și petrecerea cu stil.", image: "/images/categories/moderatori.jpg" },
  { slug: "dj", name: "DJ", count: "86 DJ", desc: "Muzică pentru orice gust și atmosferă.", image: "/images/categories/dj.jpg" },
  { slug: "cantareti", name: "Cântăreți", count: "156 soliști", desc: "Voci excepționale pentru momentele speciale.", image: "/images/categories/cantareti.jpg" },
  { slug: "formatii", name: "Formații & Grupuri", count: "72 formații", desc: "Muzică live pentru o petrecere de neuitat.", image: "/images/categories/formatii.jpg" },
  { slug: "fotografi", name: "Fotografi", count: "214 fotografi", desc: "Capturăm cele mai frumoase momente.", image: "/images/categories/fotografi.jpg" },
  { slug: "videografi", name: "Videografi", count: "96 videografi", desc: "Filmări profesionale pentru amintiri veșnice.", image: "/images/categories/videografi.jpg" },
  { slug: "decor", name: "Decor & Floristică", count: "132 furnizori", desc: "Transformăm spațiul în vis.", image: "/images/categories/decor.jpg" },
  { slug: "animatori", name: "Animatori", count: "67 animatori", desc: "Distracție garantată pentru toate vârstele.", image: "/images/categories/animatori.jpg" },
  { slug: "sali", name: "Săli & Restaurante", count: "138 locații", desc: "Locația perfectă pentru evenimentul tău.", image: "/images/categories/sali.jpg", href: "/sali" },
  { slug: "echipament-tehnic", name: "Echipament Tehnic", count: "91 furnizori", desc: "Sunet, lumini și scenă profesionale.", image: "/images/categories/echipament.jpg" },
  { slug: "show-program", name: "Show Program", count: "75 show-uri", desc: "Spectacole de foc, circ și magie.", image: "/images/categories/show-program.jpg" },
  { slug: "candy-bar-tort", name: "Candy Bar & Tort", count: "63 furnizori", desc: "Dulciuri și tort pentru orice eveniment.", image: "/images/event-types/birthday.jpg" },
] as const;

const popular = [
  { slug: "dj", name: "DJ pentru petreceri", note: "Cel mai solicitat", count: "86 DJ disponibili", image: "/images/backgrounds/party-dance.jpg" },
  { slug: "foto-video", name: "Foto & Video premium", note: "Top alegere", count: "310 profesioniști", image: "/images/categories/foto-video.jpg" },
  { slug: "decor", name: "Decor & Floristică", note: "Tendință în creștere", count: "132 furnizori", image: "/images/blog-decor.jpg" },
  { slug: "sali", name: "Săli & Restaurante", note: "Locații de top", count: "138 locații premium", image: "/images/venues/hall-4.jpg", href: "/sali" },
] as const;

const filters = [
  { label: "Toate", slug: "sparkles" },
  { label: "Muzică", slug: "cantareti" },
  { label: "Foto & Video", slug: "fotografi" },
  { label: "Decor", slug: "decor" },
  { label: "Locații", slug: "sali" },
  { label: "Tehnic", slug: "echipament-tehnic" },
  { label: "Entertainment", slug: "show-program" },
  { label: "Catering", slug: "candy-bar-tort" },
] as const;

export default function ServicesPage() {
  return (
    <div className="-mt-16 min-h-screen bg-[#020814] text-[#f6f0e5]">
      <section className="relative isolate overflow-hidden border-b border-[#e6b84d]/15 pt-16">
        <img
          src="/images/redesign/services-hero.webp"
          alt="Servicii pentru nunți și evenimente în Chișinău și Moldova"
          className="absolute inset-0 -z-20 h-full w-full object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(2,8,20,.46),rgba(2,8,20,.84)_65%,#020814)]" />
        <div className="mx-auto max-w-7xl px-4 pb-9 pt-7 lg:px-8">
          <nav className="mb-7 text-xs text-white/55">
            <Link href="/" className="hover:text-[#e6b84d]">Acasă</Link>
            <span className="mx-2">/</span>
            <span>Servicii</span>
          </nav>

          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[.36em] text-[#e6b84d]">
              Ce oferim
            </p>
            <h1 className="mt-3 font-heading text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              Servicii pentru evenimente
            </h1>
            <p className="mt-3 text-base text-white/68">
              Tot ce ai nevoie pentru un eveniment perfect, într-un singur loc
            </p>
          </div>

          <div className="mx-auto mt-7 flex max-w-5xl gap-1 overflow-x-auto rounded-full border border-white/10 bg-[#050b17]/72 p-1.5 backdrop-blur-xl">
            {filters.map((filter, index) => (
              <span
                key={filter.label}
                className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-xs transition-colors ${
                  index === 0
                    ? "bg-[#e6b84d]/16 text-[#f3c75c] ring-1 ring-[#e6b84d]/35"
                    : "text-white/72 hover:bg-white/5 hover:text-white"
                }`}
              >
                <ServiceIcon slug={filter.slug} className="h-4 w-4" />
                {filter.label}
              </span>
            ))}
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
                alt={`${service.name} pentru evenimente în Moldova`}
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
                    {service.name}
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-white/62">
                    {service.desc}
                  </p>
                </div>
              </div>
              <div className="relative mt-4 flex items-center justify-between border-t border-white/9 pt-2.5 text-[11px] text-white/58">
                <span>{service.count}</span>
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
                Nu știi de ce servicii ai nevoie?
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/62">
                Răspunde la câteva întrebări despre evenimentul tău și îți recomandăm cele mai potrivite servicii, adaptate bugetului și stilului tău.
              </p>
            </div>
            <Link
              href="/planifica"
              className="inline-flex min-h-12 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#f0cd71,#d5a43d)] px-7 text-sm font-semibold text-[#07101d] shadow-[0_8px_28px_rgba(224,177,64,.2)] hover:brightness-105"
            >
              Primește recomandări personalizate
            </Link>
            <span className="absolute bottom-2 right-8 hidden items-center gap-1 text-[11px] text-white/55 lg:flex">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#e6b84d]" />
              Gratuit, rapid și fără obligații
            </span>
          </div>
        </section>

        <section className="mt-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-heading text-xl font-semibold">
              <span className="mr-2 text-[#e6b84d]">✦</span>
              Servicii populare
            </h2>
            <Link href="/categorii" className="inline-flex items-center gap-2 text-xs text-white/70 hover:text-[#e6b84d]">
              Vezi toate serviciile <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {popular.map((item) => (
              <Link
                key={item.name}
                href={"href" in item ? item.href : `/categorie/${item.slug}`}
                className="group relative min-h-28 overflow-hidden rounded-xl border border-[#e6b84d]/30"
              >
                <img
                  src={item.image}
                  alt={`${item.name} pentru nunți și evenimente în Moldova`}
                  className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#020814] via-[#020814]/72 to-black/20" />
                <span className="absolute left-3 top-3 rounded-full border border-[#e6b84d]/50 bg-[#0a101b]/78 px-2 py-1 text-[9px] font-medium text-[#efc456] backdrop-blur">
                  {item.note}
                </span>
                <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e6b84d]/55 bg-black/38 text-[#e6b84d]">
                    <ServiceIcon slug={item.slug} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-heading text-base font-semibold text-white">{item.name}</h3>
                    <p className="text-[10px] text-white/58">{item.count}</p>
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
