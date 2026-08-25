import Link from "@/components/shared/locale-link";
import { metaForPath } from "@/lib/seo/page-meta";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";
import { t } from "@/i18n";
import { breadcrumbJsonLd, safeJsonLd } from "@/lib/seo/jsonld";
import { DrinksCalculatorClient } from "./client";

// M3 #3 — Alcohol & drinks calculator.
// URL: /calculatoare/alcool

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  // All three languages up front — metaForPath serves the one the
  // route parameter names.
  return metaForPath("/calculatoare/alcool", {
    ro: {
      title: "Calculator băuturi nuntă — vin, vodcă, coniac, șampanie, apă",
      description:
        "Calculează câte sticle de vin, vodcă, coniac, șampanie, bere și apă îți trebuie pentru nuntă, botez sau cumătrie. Norme Moldova, 2025.",
    },
    ru: {
      title: "Калькулятор напитков на свадьбу — вино, водка, шампанское",
      description:
        "Рассчитайте, сколько вина, водки, коньяка, шампанского, пива и воды нужно на свадьбу, крестины или корпоратив. Нормы на гостя, Молдова, 2025.",
    },
    en: {
      title: "Wedding Drinks Calculator — Wine, Vodka, Champagne",
      description:
        "Work out how many bottles of wine, vodka, cognac, champagne, beer and water you need per guest for a wedding or christening in Moldova, 2025.",
    },
  }, locale);
}

export default async function DrinksCalculatorPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const breadcrumbs = [
    { name: t("nav.home", locale), url: "/" },
    { name: t("tools.calculators", locale), url: "/calculatoare" },
    { name: t("tools.drinksCalculator", locale), url: "/calculatoare/alcool" },
  ];
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd(breadcrumbs)) }}
      />
      <div className="mx-auto max-w-4xl px-4 py-10 lg:px-8">
        <nav className="mb-4 text-xs text-muted-foreground">
          <Link href="/" className="hover:text-gold">{t("nav.home", locale)}</Link>
          <span className="mx-2">/</span>
          <Link href="/calculatoare" className="hover:text-gold">{t("tools.calculators", locale)}</Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">{t("tools.drinksCalculator", locale)}</span>
        </nav>
        <header className="mb-8">
          <h1 className="font-heading text-3xl font-bold md:text-4xl">
            {t("calc.drinks.title", locale)}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
            {t("calc.drinks.intro", locale)}
          </p>
        </header>
        <DrinksCalculatorClient />
      </div>
    </>
  );
}
