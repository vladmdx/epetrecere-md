import Link from "@/components/shared/locale-link";
import { metaForPath } from "@/lib/seo/page-meta";
import { t } from "@/i18n";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";
import { breadcrumbJsonLd, safeJsonLd } from "@/lib/seo/jsonld";
import { WeddingCostCalculatorClient } from "./client";

// M7 Feature 8 — Dedicated Wedding Cost Calculator.
// Distinct from /calculatoare/buget (generic event) because weddings have
// unique categories (inele, rochie, costum, dar de nașă, lună de miere) and
// Moldovan traditions (cumătri, nași) that don't apply to corporate/birthday.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  // All three languages up front — metaForPath serves the one the route
  // parameter names.
  return metaForPath("/calculatoare/nunta", {
    ro: {
      title: "Calculator cost nuntă Moldova 2025 — estimează total pe categorii",
      description:
        "Cât costă o nuntă în Moldova? Calculator complet: sală, meniu, rochie, foto-video, decor, inele, lună de miere. Estimări pe intervale reale 2025.",
    },
    ru: {
      title: "Калькулятор стоимости свадьбы в Молдове 2025",
      description:
        "Сколько стоит свадьба в Молдове? Полный расчёт: зал, меню, платье, фото и видео, декор, кольца, медовый месяц. Реальные диапазоны цен 2025 года.",
    },
    en: {
      title: "Moldova Wedding Cost Calculator 2025",
      description:
        "How much does a wedding in Moldova cost? Full calculator: venue, menu, dress, photo and video, decor, rings, honeymoon. Real 2025 price ranges.",
    },
  }, locale);
}

export default async function WeddingCostPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const breadcrumbs = [
    { name: t("nav.home", locale), url: "/" },
    { name: t("calc.nav.calculators", locale), url: "/calculatoare" },
    { name: t("calc.wedding.breadcrumb", locale), url: "/calculatoare/nunta" },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(breadcrumbJsonLd(breadcrumbs)),
        }}
      />
      <div className="mx-auto max-w-5xl px-4 py-12 lg:px-8">
        <nav className="mb-4 text-xs text-muted-foreground">
          <Link href="/" className="hover:text-gold">
            {t("nav.home", locale)}
          </Link>
          <span className="mx-2">/</span>
          <Link href="/calculatoare" className="hover:text-gold">
            {t("calc.nav.calculators", locale)}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">{t("calc.wedding.breadcrumb", locale)}</span>
        </nav>
        <header className="mb-8">
          <h1 className="font-heading text-3xl font-bold md:text-4xl">
            {t("calc.wedding.title", locale)}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground md:text-base">
            {t("calc.wedding.subtitle", locale)}
          </p>
        </header>
        <WeddingCostCalculatorClient />
      </div>
    </>
  );
}
