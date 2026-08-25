import Link from "@/components/shared/locale-link";
import { metaForPath } from "@/lib/seo/page-meta";
import { breadcrumbJsonLd, faqJsonLd, safeJsonLd } from "@/lib/seo/jsonld";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";
import { t } from "@/i18n";
import { Calculator, WalletCards, UsersRound, Wine, UtensilsCrossed, Heart, Gift, ArrowRight } from "lucide-react";

// M3 — Calculators index. Entry point for all event planning tools.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const meta = {
    ro: {
      title: "Calculatoare pentru evenimente: buget, invitați, băuturi, meniu",
      description: "Calculează bugetul nunții, invitații, mesele, băuturile și meniul cu estimări 2026 pentru Chișinău și Republica Moldova.",
    },
    ru: {
      title: "Калькуляторы событий: бюджет, гости, напитки и меню",
      description: "Рассчитайте бюджет свадьбы, гостей, столы, напитки и меню с ориентирами 2026 года для Кишинева и Молдовы.",
    },
    en: {
      title: "Event Calculators: Budget, Guests, Drinks and Menu",
      description: "Calculate your wedding budget, guests, tables, drinks and menu with 2026 estimates for Chișinău and Moldova.",
    },
  }[locale];
  return metaForPath("/calculatoare", {
    title: meta.title,
    description: meta.description,
  }, locale);
}

const CALCULATORS = [
  {
    slug: "dar-nunta",
    key: "darNunta",
    icon: Gift,
    color: "text-gold",
  },
  {
    slug: "nunta",
    key: "nunta",
    icon: Heart,
    color: "text-rose-500",
  },
  {
    slug: "buget",
    key: "buget",
    icon: WalletCards,
    color: "text-emerald-500",
  },
  {
    slug: "invitati",
    key: "invitati",
    icon: UsersRound,
    color: "text-blue-500",
  },
  {
    slug: "alcool",
    key: "alcool",
    icon: Wine,
    color: "text-rose-500",
  },
  {
    slug: "meniu",
    key: "meniu",
    icon: UtensilsCrossed,
    color: "text-amber-500",
  },
];

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://epetrecere.md";

export default async function CalculatorsIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const breadcrumbs = [
    { name: t("nav.home", locale), url: "/" },
    { name: t("tools.calculators", locale), url: "/calculatoare" },
  ];
  const faq = [1, 2, 3].map((n) => ({
    question: t(`calc.index.faq.q${n}`, locale),
    answer: t(`calc.index.faq.a${n}`, locale),
  }));

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: t("calc.index.title", locale),
    numberOfItems: CALCULATORS.length,
    itemListElement: CALCULATORS.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${BASE_URL}/calculatoare/${c.slug}`,
      name: t(`calc.index.cards.${c.key}.title`, locale),
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd(breadcrumbs)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(itemList) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd([...faq])) }}
      />

      <div className="mx-auto max-w-5xl px-4 py-12 lg:px-8">
        <nav className="mb-4 text-xs text-muted-foreground">
          <Link href="/" className="hover:text-gold">{t("nav.home", locale)}</Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">{t("tools.calculators", locale)}</span>
        </nav>

        <header className="mb-10 text-center">
          <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/10">
            <Calculator className="h-8 w-8 text-gold" />
          </div>
          <h1 className="font-heading text-3xl font-bold md:text-4xl">
            {t("calc.index.title", locale)}
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
            {t("calc.index.description", locale)}
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          {CALCULATORS.map((c) => {
            const Icon = c.icon;
            const highlights = [1, 2, 3].map((n) => t(`calc.index.cards.${c.key}.h${n}`, locale));
            return (
              <Link
                key={c.slug}
                href={`/calculatoare/${c.slug}`}
                className="group relative overflow-hidden rounded-2xl border border-border/40 bg-card p-6 transition-all hover:border-gold/40 hover:shadow-lg"
              >
                <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-muted ${c.color}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <h2 className="mb-2 font-heading text-xl font-semibold group-hover:text-gold">
                  {t(`calc.index.cards.${c.key}.title`, locale)}
                </h2>
                <p className="mb-4 text-sm text-muted-foreground">
                  {t(`calc.index.cards.${c.key}.desc`, locale)}
                </p>
                <ul className="mb-4 space-y-1">
                  {highlights.map((h) => (
                    <li key={h} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="h-1 w-1 rounded-full bg-gold" />
                      {h}
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-1 text-sm font-medium text-gold">
                  {t("calc.index.open", locale)}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            );
          })}
        </div>

        <div className="mt-12 rounded-2xl border border-gold/20 bg-gold/5 p-6 text-center">
          <h3 className="mb-2 font-heading text-lg font-semibold">
            {t("calc.index.ctaTitle", locale)}
          </h3>
          <p className="mb-4 text-sm text-muted-foreground">
            {t("calc.index.ctaDesc", locale)}
          </p>
          <Link
            href="/planifica"
            className="inline-flex items-center gap-2 rounded-lg bg-gold px-6 py-2.5 text-sm font-medium text-[#0D0D0D] hover:bg-gold-dark"
          >
            {t("calc.index.cta", locale)}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <section className="mt-14">
          <h2 className="text-center font-heading text-2xl font-semibold">
            {t("calc.index.faqTitle", locale)}
          </h2>
          <div className="mx-auto mt-6 max-w-3xl space-y-2">
            {faq.map((item) => (
              <details key={item.question} className="rounded-xl border border-border/40 bg-card p-4">
                <summary className="cursor-pointer font-medium">{item.question}</summary>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
