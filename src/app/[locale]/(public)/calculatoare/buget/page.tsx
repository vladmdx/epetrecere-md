import Link from "@/components/shared/locale-link";
import { metaForPath } from "@/lib/seo/page-meta";
import { t } from "@/i18n";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";
import { breadcrumbJsonLd, safeJsonLd } from "@/lib/seo/jsonld";
import { BudgetCalculatorClient } from "./client";

// M3 #1 — Budget calculator.
// URL: /calculatoare/buget
// Server component handles metadata + breadcrumbs; the interactive form is
// in ./client.tsx since it needs React state.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  // All three languages up front — metaForPath serves the one the route
  // parameter names.
  return metaForPath("/calculatoare/buget", {
    ro: {
      title: "Calculator buget nuntă, botez, cumătrie — estimare online gratuită",
      description:
        "Calculează bugetul exact pentru nuntă, botez sau cumătrie în Moldova. Meniu, artiști, decor, foto-video, transport — prețuri reale 2025 pe ePetrecere.md.",
    },
    ru: {
      title: "Калькулятор бюджета свадьбы и крестин — бесплатно онлайн",
      description:
        "Рассчитайте точный бюджет свадьбы или крестин в Молдове. Меню, артисты, декор, фото и видео, транспорт — реальные цены 2025 на ePetrecere.md.",
    },
    en: {
      title: "Wedding and Party Budget Calculator — Free Online",
      description:
        "Work out the exact budget for a wedding or christening in Moldova. Menu, artists, decor, photo and video, transport — real 2025 prices on ePetrecere.md.",
    },
  }, locale);
}

export default async function BudgetCalculatorPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const breadcrumbs = [
    { name: t("nav.home", locale), url: "/" },
    { name: t("tools.calculators", locale), url: "/calculatoare" },
    { name: t("budgetCalc.breadcrumb", locale), url: "/calculatoare/buget" },
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
          <span className="text-foreground">{t("budgetCalc.breadcrumb", locale)}</span>
        </nav>
        <header className="mb-8">
          <h1 className="font-heading text-3xl font-bold md:text-4xl">
            {t("budgetCalc.pageTitle", locale)}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
            {t("budgetCalc.pageIntro", locale)}
          </p>
        </header>
        <BudgetCalculatorClient />
      </div>
    </>
  );
}
