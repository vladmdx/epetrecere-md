import Link from "@/components/shared/locale-link";
import { metaForPath } from "@/lib/seo/page-meta";
import { breadcrumbJsonLd, faqJsonLd, safeJsonLd } from "@/lib/seo/jsonld";
import { getServerLocale } from "@/lib/i18n/server-locale";
import { Calculator, WalletCards, UsersRound, Wine, UtensilsCrossed, Heart, Gift, ArrowRight } from "lucide-react";

// M3 — Calculators index. Entry point for all event planning tools.

export async function generateMetadata() {
  const locale = await getServerLocale();
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
    icon: Gift,
    color: "text-gold",
  },
  {
    slug: "nunta",
    icon: Heart,
    color: "text-rose-500",
  },
  {
    slug: "buget",
    icon: WalletCards,
    color: "text-emerald-500",
  },
  {
    slug: "invitati",
    icon: UsersRound,
    color: "text-blue-500",
  },
  {
    slug: "alcool",
    icon: Wine,
    color: "text-rose-500",
  },
  {
    slug: "meniu",
    icon: UtensilsCrossed,
    color: "text-amber-500",
  },
];

const pageCopy = {
  ro: {
    home: "Acasă", breadcrumb: "Calculatoare", eyebrow: "Instrumente gratuite pentru Moldova",
    title: "Calculatoare pentru evenimente",
    description: "Planifică bugetul, cantitățile și logistica înainte de a contacta furnizorii. Estimările folosesc repere pentru Republica Moldova actualizate în 2026.",
    open: "Deschide calculatorul", ctaTitle: "Gata cu calculele? Găsește furnizorii potriviți.",
    ctaDesc: "Folosește planificatorul și primești rezultate personalizate în mai puțin de un minut.", cta: "Planifică evenimentul",
    cards: [
      ["Cât să dau dar la nuntă?", "Calculează suma potrivită după relație, tipul sălii și orașul nunții.", ["Minimum, tipic și generos", "Adulți și copii", "Relație și zonă"]],
      ["Calculator Cost Nuntă", "Estimare completă pentru sală, ținute, inele, foto-video, muzică, decor și luna de miere.", ["13 categorii cu intervale", "Preț pe invitat", "Categorii principale"]],
      ["Calculator Buget Eveniment", "Estimează costul nunții, botezului sau cumătriei, inclusiv meniu, artiști și decor.", ["Peste 12 categorii", "Interval minim și maxim", "Preț pe persoană"]],
      ["Calculator Invitați și Mese", "Află câte mese, ospătari și locuri de parcare sunt necesare pentru invitații tăi.", ["Mese și locuri", "Rata de absențe", "Personal și parcare"]],
      ["Calculator Băuturi", "Calculează vinul, băuturile tari, șampania, berea și apa necesare.", ["Norme pentru Moldova", "Cost total estimat", "Ajustare după durată"]],
      ["Calculator Meniu", "Calculează aperitivele, felul principal, tortul, fructele și gustarea de noapte.", ["Grame pe invitat", "Kilograme totale", "Cost estimat"]],
    ],
  },
  ru: {
    home: "Главная", breadcrumb: "Калькуляторы", eyebrow: "Бесплатные инструменты для Молдовы",
    title: "Калькуляторы для событий",
    description: "Спланируйте бюджет, количество и логистику до обращения к поставщикам. Ориентиры для Молдовы обновлены на 2026 год.",
    open: "Открыть калькулятор", ctaTitle: "Расчеты готовы? Найдите подходящих поставщиков.",
    ctaDesc: "Используйте планировщик и получите персональную подборку меньше чем за минуту.", cta: "Планировать событие",
    cards: [
      ["Сколько подарить на свадьбу?", "Рассчитайте сумму с учетом отношений, типа зала и города.", ["Минимум, обычно и щедро", "Взрослые и дети", "Отношения и регион"]],
      ["Стоимость свадьбы", "Полная оценка зала, нарядов, колец, фото, видео, музыки и декора.", ["13 категорий", "Цена на гостя", "Главные статьи"]],
      ["Бюджет события", "Оцените стоимость свадьбы, крестин или семейного события.", ["Более 12 категорий", "Минимум и максимум", "Цена на человека"]],
      ["Гости и столы", "Узнайте число столов, персонала и парковочных мест.", ["Столы и места", "Процент отказов", "Персонал и парковка"]],
      ["Напитки", "Рассчитайте вино, крепкие напитки, шампанское, пиво и воду.", ["Нормы для Молдовы", "Общая стоимость", "Учет длительности"]],
      ["Меню", "Рассчитайте закуски, горячее, торт, фрукты и позднюю закуску.", ["Граммы на гостя", "Общий вес", "Ориентир стоимости"]],
    ],
  },
  en: {
    home: "Home", breadcrumb: "Calculators", eyebrow: "Free tools for Moldova",
    title: "Event calculators",
    description: "Plan your budget, quantities and logistics before contacting vendors. Estimates use Moldova benchmarks updated for 2026.",
    open: "Open calculator", ctaTitle: "Finished calculating? Find the right vendors.",
    ctaDesc: "Use the planner to get personalized results in less than a minute.", cta: "Plan your event",
    cards: [
      ["Wedding Gift Calculator", "Estimate a suitable gift based on relationship, venue type and city.", ["Minimum, typical and generous", "Adults and children", "Relationship and region"]],
      ["Wedding Cost Calculator", "A full estimate for venue, attire, rings, photo, video, music and decor.", ["13 cost categories", "Cost per guest", "Largest categories"]],
      ["Event Budget Calculator", "Estimate the total cost of a wedding, baptism or family celebration.", ["Over 12 categories", "Minimum and maximum", "Cost per person"]],
      ["Guests and Tables", "Calculate tables, serving staff and parking spaces for your guest count.", ["Tables and seats", "No-show rate", "Staff and parking"]],
      ["Drinks Calculator", "Calculate wine, spirits, sparkling wine, beer and water.", ["Moldova benchmarks", "Estimated total cost", "Duration adjustment"]],
      ["Menu Calculator", "Calculate starters, main course, cake, fruit and late-night food.", ["Grams per guest", "Total kilograms", "Estimated cost"]],
    ],
  },
} as const;

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://epetrecere.md";

export default async function CalculatorsIndexPage() {
  const locale = await getServerLocale();
  const labels = pageCopy[locale];
  const breadcrumbs = [
    { name: labels.home, url: "/" },
    { name: labels.breadcrumb, url: "/calculatoare" },
  ];
  const faq = {
    ro: [
      { question: "Estimările sunt prețuri garantate?", answer: "Nu. Rezultatele sunt orientative pentru planificare. Oferta scrisă a furnizorului este valoarea finală." },
      { question: "Calculatoarele folosesc repere pentru Moldova?", answer: "Da. Formulele și intervalele sunt adaptate evenimentelor din Republica Moldova și actualizate pentru 2026." },
      { question: "Trebuie să am cont?", answer: "Poți deschide calculatoarele public, iar contul îți permite să păstrezi rezultatele și să continui planificarea." },
    ],
    ru: [
      { question: "Результаты являются гарантированной ценой?", answer: "Нет. Это ориентиры для планирования. Финальную стоимость определяет письменное предложение поставщика." },
      { question: "Калькуляторы адаптированы для Молдовы?", answer: "Да. Формулы и диапазоны учитывают события в Молдове и обновлены для 2026 года." },
      { question: "Нужен ли аккаунт?", answer: "Калькуляторы доступны публично, а аккаунт позволяет сохранить результат." },
    ],
    en: [
      { question: "Are the estimates guaranteed prices?", answer: "No. They are planning benchmarks. The vendor's written quote is the final price." },
      { question: "Are the calculators adapted for Moldova?", answer: "Yes. Their formulas and ranges reflect events in Moldova and were updated for 2026." },
      { question: "Is an account required?", answer: "The calculators are public, while an account lets you save results and continue planning." },
    ],
  }[locale];

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: labels.title,
    numberOfItems: CALCULATORS.length,
    itemListElement: CALCULATORS.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${BASE_URL}/calculatoare/${c.slug}`,
      name: labels.cards[i][0],
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
          <Link href="/" className="hover:text-gold">{labels.home}</Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">{labels.breadcrumb}</span>
        </nav>

        <header className="mb-10 text-center">
          <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/10">
            <Calculator className="h-8 w-8 text-gold" />
          </div>
          <h1 className="font-heading text-3xl font-bold md:text-4xl">
            {labels.title}
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
            {labels.description}
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          {CALCULATORS.map((c, index) => {
            const Icon = c.icon;
            const [title, description, highlights] = labels.cards[index];
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
                  {title}
                </h2>
                <p className="mb-4 text-sm text-muted-foreground">{description}</p>
                <ul className="mb-4 space-y-1">
                  {highlights.map((h) => (
                    <li key={h} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="h-1 w-1 rounded-full bg-gold" />
                      {h}
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-1 text-sm font-medium text-gold">
                  {labels.open}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            );
          })}
        </div>

        <div className="mt-12 rounded-2xl border border-gold/20 bg-gold/5 p-6 text-center">
          <h3 className="mb-2 font-heading text-lg font-semibold">
            {labels.ctaTitle}
          </h3>
          <p className="mb-4 text-sm text-muted-foreground">
            {labels.ctaDesc}
          </p>
          <Link
            href="/planifica"
            className="inline-flex items-center gap-2 rounded-lg bg-gold px-6 py-2.5 text-sm font-medium text-[#0D0D0D] hover:bg-gold-dark"
          >
            {labels.cta}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <section className="mt-14">
          <h2 className="text-center font-heading text-2xl font-semibold">
            {locale === "ru" ? "Частые вопросы" : locale === "en" ? "Frequently asked questions" : "Întrebări frecvente"}
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
