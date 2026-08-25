import Link from "@/components/shared/locale-link";
import { metaForPath } from "@/lib/seo/page-meta";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";
import { t } from "@/i18n";
import { breadcrumbJsonLd, safeJsonLd } from "@/lib/seo/jsonld";
import { GuestCalculatorClient } from "./client";

// M3 #2 — Guest / table planning calculator.
// URL: /calculatoare/invitati

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  // All three languages up front — metaForPath serves the one the route
  // parameter names.
  return metaForPath("/calculatoare/invitati", {
    ro: {
      title: "Calculator invitați, mese și logistică eveniment",
      description:
        "Calculează câte mese, băi, ospătari și locuri de parcare îți trebuie pentru numărul tău de invitați. Formule verificate pentru nunți și evenimente în Moldova.",
    },
    ru: {
      title: "Калькулятор гостей, столов и логистики мероприятия",
      description:
        "Рассчитайте, сколько столов, официантов, туалетов и парковочных мест нужно на ваше количество гостей. Проверенные нормы для событий в Молдове.",
    },
    en: {
      title: "Guest, Table and Event Logistics Calculator",
      description:
        "Work out how many tables, restrooms, waiters and parking spaces your guest count needs. Proven formulas for weddings and events in Moldova.",
    },
  }, locale);
}

export default async function GuestCalculatorPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const breadcrumbs = [
    { name: t("nav.home", locale), url: "/" },
    { name: t("tools.calculators", locale), url: "/calculatoare" },
    { name: t("calc.guests.breadcrumb", locale), url: "/calculatoare/invitati" },
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
          <span className="text-foreground">{t("calc.guests.breadcrumb", locale)}</span>
        </nav>
        <header className="mb-8">
          <h1 className="font-heading text-3xl font-bold md:text-4xl">
            {t("calc.guests.pageTitle", locale)}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
            {t("calc.guests.pageIntro", locale)}
          </p>
        </header>
        <GuestCalculatorClient />
      </div>
    </>
  );
}
