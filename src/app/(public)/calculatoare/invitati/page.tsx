import Link from "@/components/shared/locale-link";
import { metaForPath } from "@/lib/seo/page-meta";
import { breadcrumbJsonLd, safeJsonLd } from "@/lib/seo/jsonld";
import { GuestCalculatorClient } from "./client";

// M3 #2 — Guest / table planning calculator.
// URL: /calculatoare/invitati

export async function generateMetadata() {
  // All three languages up front — metaForPath serves the one the
  // middleware resolved from the URL prefix.
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
  });
}

export default function GuestCalculatorPage() {
  const breadcrumbs = [
    { name: "Acasă", url: "/" },
    { name: "Calculatoare", url: "/calculatoare" },
    { name: "Invitați", url: "/calculatoare/invitati" },
  ];
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd(breadcrumbs)) }}
      />
      <div className="mx-auto max-w-4xl px-4 py-10 lg:px-8">
        <nav className="mb-4 text-xs text-muted-foreground">
          <Link href="/" className="hover:text-gold">Acasă</Link>
          <span className="mx-2">/</span>
          <Link href="/calculatoare" className="hover:text-gold">Calculatoare</Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">Invitați</span>
        </nav>
        <header className="mb-8">
          <h1 className="font-heading text-3xl font-bold md:text-4xl">
            Calculator invitați & mese
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
            Află câte mese, băi, ospătari și locuri de parcare îți sunt necesare
            pentru un eveniment confortabil și bine organizat.
          </p>
        </header>
        <GuestCalculatorClient />
      </div>
    </>
  );
}
