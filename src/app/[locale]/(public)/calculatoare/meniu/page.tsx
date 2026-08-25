import Link from "@/components/shared/locale-link";
import { metaForPath } from "@/lib/seo/page-meta";
import { t } from "@/i18n";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";
import { breadcrumbJsonLd, safeJsonLd } from "@/lib/seo/jsonld";
import { MenuCalculatorClient } from "./client";

// M3 #4 — Menu / food calculator.
// URL: /calculatoare/meniu

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  // All three languages up front — metaForPath serves the one the route
  // parameter names.
  return metaForPath("/calculatoare/meniu", {
    ro: {
      title: "Calculator meniu & mâncare nuntă, botez, cumătrie",
      description:
        "Calculează cantitățile de aperitive, fel principal, zeamă, fructe și tort pentru evenimentul tău. Norme pe porții, prețuri bulk Moldova 2026.",
    },
    ru: {
      title: "Калькулятор меню и еды на свадьбу и крестины",
      description:
        "Рассчитайте количество закусок, горячего, супа, фруктов и торта для вашего события. Нормы на порцию и оптовые цены по Молдове, 2026.",
    },
    en: {
      title: "Wedding Menu and Food Calculator",
      description:
        "Calculate how much you need of starters, main course, soup, fruit and cake for your event. Per-portion norms and bulk Moldova prices, 2026.",
    },
  }, locale);
}

export default async function MenuCalculatorPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const breadcrumbs = [
    { name: t("nav.home", locale), url: "/" },
    { name: t("calc.nav.calculators", locale), url: "/calculatoare" },
    { name: t("calc.menu.breadcrumb", locale), url: "/calculatoare/meniu" },
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
          <Link href="/calculatoare" className="hover:text-gold">{t("calc.nav.calculators", locale)}</Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">{t("calc.menu.breadcrumb", locale)}</span>
        </nav>
        <header className="mb-8">
          <h1 className="font-heading text-3xl font-bold md:text-4xl">
            {t("calc.menu.title", locale)}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
            {t("calc.menu.subtitle", locale)}
          </p>
        </header>
        <MenuCalculatorClient />
      </div>
    </>
  );
}
