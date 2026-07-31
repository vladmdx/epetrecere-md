import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Calendar, Sparkles, Tag } from "lucide-react";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { blogPosts } from "@/lib/db/schema";
import { getLocalized } from "@/i18n";
import { getServerLocale } from "@/lib/i18n/server-locale";
import { findEditorialPost2026 } from "@/lib/blog/editorial-posts-2026";
import { metaForPath } from "@/lib/seo/page-meta";
import { breadcrumbJsonLd, safeJsonLd } from "@/lib/seo/jsonld";

export async function generateMetadata() {
  const locale = await getServerLocale();
  const meta = {
    ro: {
      title: "Blog nunți și evenimente 2026 în Moldova",
      description:
        "Ghiduri locale despre costul nunții, alegerea sălii și organizarea evenimentelor în Chișinău și Republica Moldova în 2026.",
    },
    ru: {
      title: "Блог о свадьбах и событиях 2026 в Молдове",
      description:
        "Местные гиды о стоимости свадьбы, выборе зала и организации событий в Кишиневе и Молдове в 2026 году.",
    },
    en: {
      title: "Moldova Wedding and Event Blog 2026",
      description:
        "Local guides to wedding costs, venue selection and event planning in Chișinău and Moldova in 2026.",
    },
  }[locale];
  return metaForPath("/blog", {
    title: meta.title,
    description: meta.description,
  }, locale);
}

function formatDate(value: Date, locale: "ro" | "ru" | "en") {
  return value.toLocaleDateString(locale === "ru" ? "ru-RU" : locale === "en" ? "en-GB" : "ro-RO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function BlogListingPage() {
  const locale = await getServerLocale();
  const labels = {
    ro: {
      home: "Acasă", eyebrow: "Inspirație ePetrecere", title: "Idei care transformă planurile în momente memorabile",
      description: "Ghiduri practice, tendințe și recomandări pentru nunți, cumetrii, aniversări și evenimente corporate în Republica Moldova.",
      featured: "Articol recomandat", read: "Citește articolul", latest: "Cele mai noi", ideas: "Sfaturi și idei", articles: "articole",
      emptyTitle: "Primele articole sunt în pregătire",
      emptyDescription: "Revino în curând pentru ghiduri și idei noi de organizare.",
    },
    ru: {
      home: "Главная", eyebrow: "Вдохновение ePetrecere", title: "Идеи, которые превращают планы в памятные события",
      description: "Практические гиды, тенденции и рекомендации для свадеб, крестин, дней рождения и корпоративных событий в Молдове.",
      featured: "Рекомендуем", read: "Читать статью", latest: "Новое", ideas: "Советы и идеи", articles: "статьи",
      emptyTitle: "Первые статьи готовятся",
      emptyDescription: "Скоро здесь появятся новые гиды и идеи для организации.",
    },
    en: {
      home: "Home", eyebrow: "ePetrecere inspiration", title: "Ideas that turn plans into memorable moments",
      description: "Practical guides, trends and recommendations for weddings, baptisms, birthdays and corporate events in Moldova.",
      featured: "Featured article", read: "Read article", latest: "Latest", ideas: "Advice and ideas", articles: "articles",
      emptyTitle: "The first articles are being prepared",
      emptyDescription: "Come back soon for new planning guides and ideas.",
    },
  }[locale];
  const posts = await db
    .select()
    .from(blogPosts)
    .where(eq(blogPosts.status, "published"))
    .orderBy(desc(blogPosts.publishedAt), desc(blogPosts.createdAt))
    .limit(50);

  const [featured, ...remaining] = posts;
  const crumbs = breadcrumbJsonLd([
    { name: labels.home, url: "/" },
    { name: "Blog", url: "/blog" },
  ]);

  return (
    <div className="-mt-16 min-h-screen bg-[#05080d] pt-16 text-[#f6f0e5]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(crumbs) }}
      />

      <section className="relative isolate overflow-hidden border-b border-gold/10 py-20">
        <img
          src="/images/backgrounds/party-dance.jpg"
          alt=""
          className="absolute inset-0 -z-20 h-full w-full object-cover opacity-30"
        />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(5,8,13,.99),rgba(5,8,13,.9)_55%,rgba(5,8,13,.66))]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent to-[#05080d]" />
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[.28em] text-gold">
            {labels.eyebrow}
          </p>
          <h1 className="mt-3 max-w-3xl font-heading text-4xl font-semibold tracking-tight sm:text-6xl">
            {labels.title}
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-white/62 sm:text-base">
            {labels.description}
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
        {posts.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-white/[.025] px-6 py-24 text-center">
            <Sparkles className="mx-auto h-10 w-10 text-gold/55" />
            <h2 className="mt-5 font-heading text-2xl font-semibold">
              {labels.emptyTitle}
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-white/50">
              {labels.emptyDescription}
            </p>
          </div>
        ) : (
          <>
            {featured && (
              <Link
                href={`/blog/${featured.slug}`}
                className="group grid overflow-hidden rounded-2xl border border-gold/18 bg-[linear-gradient(135deg,#101622,#0b0e14)] shadow-[0_24px_70px_rgba(0,0,0,.24)] transition hover:border-gold/42 lg:grid-cols-[1.08fr_.92fr]"
              >
                <div className="relative min-h-[310px] overflow-hidden bg-[#111724]">
                  {featured.coverImageUrl ? (
                    <Image
                      src={featured.coverImageUrl}
                      alt={findEditorialPost2026(featured.slug)
                        ? locale === "ru"
                          ? findEditorialPost2026(featured.slug)!.coverAltRu
                          : locale === "en"
                            ? findEditorialPost2026(featured.slug)!.coverAltEn
                            : findEditorialPost2026(featured.slug)!.coverAltRo
                        : getLocalized(featured, "title", locale)}
                      fill
                      priority
                      sizes="(max-width: 1024px) 100vw, 55vw"
                      className="object-cover transition duration-700 group-hover:scale-105"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_30%,rgba(230,184,77,.28),transparent_28%),linear-gradient(145deg,#1b2130,#090c12)]" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0a0d13]/65 to-transparent lg:bg-gradient-to-r lg:from-transparent lg:to-[#0d111a]/25" />
                </div>
                <div className="flex flex-col justify-center p-7 sm:p-10">
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-white/44">
                    <span className="rounded-full border border-gold/25 bg-gold/8 px-3 py-1 font-semibold uppercase tracking-wider text-gold">
                      {labels.featured}
                    </span>
                    {featured.category && (
                      <span className="flex items-center gap-1.5">
                        <Tag className="h-3 w-3" />
                        {featured.category}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-5 font-heading text-3xl font-semibold leading-tight text-white group-hover:text-[#efd078]">
                    {getLocalized(featured, "title", locale)}
                  </h2>
                  {getLocalized(featured, "excerpt", locale) && (
                    <p className="mt-4 line-clamp-3 text-sm leading-7 text-white/57">
                      {getLocalized(featured, "excerpt", locale)}
                    </p>
                  )}
                  <div className="mt-7 flex items-center justify-between border-t border-white/8 pt-5 text-xs">
                    <span className="flex items-center gap-2 text-white/42">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatDate(featured.publishedAt || featured.createdAt, locale)}
                    </span>
                    <span className="flex items-center gap-2 font-semibold text-gold">
                      {labels.read}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </div>
                </div>
              </Link>
            )}

            {remaining.length > 0 && (
              <section className="mt-14">
                <div className="mb-6 flex items-end justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[.24em] text-gold">
                      {labels.latest}
                    </p>
                    <h2 className="mt-2 font-heading text-3xl font-semibold">
                      {labels.ideas}
                    </h2>
                  </div>
                  <p className="text-xs text-white/38">
                    {remaining.length} {labels.articles}
                  </p>
                </div>

                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {remaining.map((post) => (
                    <Link
                      key={post.id}
                      href={`/blog/${post.slug}`}
                      className="group flex min-h-full flex-col overflow-hidden rounded-xl border border-white/8 bg-[#0d111a] transition duration-300 hover:-translate-y-1 hover:border-gold/35 hover:shadow-[0_20px_45px_rgba(0,0,0,.28)]"
                    >
                      <div className="relative aspect-[16/10] overflow-hidden bg-[#121824]">
                        {post.coverImageUrl ? (
                          <Image
                            src={post.coverImageUrl}
                            alt={findEditorialPost2026(post.slug)
                              ? locale === "ru"
                                ? findEditorialPost2026(post.slug)!.coverAltRu
                                : locale === "en"
                                  ? findEditorialPost2026(post.slug)!.coverAltEn
                                  : findEditorialPost2026(post.slug)!.coverAltRo
                              : getLocalized(post, "title", locale)}
                            fill
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                            className="object-cover transition duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(230,184,77,.2),transparent_26%),linear-gradient(150deg,#171d2b,#090c12)]" />
                        )}
                        {post.category && (
                          <span className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/55 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider text-[#edc86b] backdrop-blur">
                            {post.category}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col p-5">
                        <h3 className="line-clamp-2 font-heading text-xl font-semibold leading-snug text-white group-hover:text-[#edc86b]">
                          {getLocalized(post, "title", locale)}
                        </h3>
                        {getLocalized(post, "excerpt", locale) && (
                          <p className="mt-3 line-clamp-3 text-sm leading-6 text-white/50">
                            {getLocalized(post, "excerpt", locale)}
                          </p>
                        )}
                        <div className="mt-auto flex items-center justify-between border-t border-white/7 pt-4 text-[11px]">
                          <span className="flex items-center gap-1.5 text-white/37">
                            <Calendar className="h-3 w-3" />
                            {formatDate(post.publishedAt || post.createdAt, locale)}
                          </span>
                          <ArrowRight className="h-4 w-4 text-gold transition-transform group-hover:translate-x-1" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
