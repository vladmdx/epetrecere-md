import { metaForPath } from "@/lib/seo/page-meta";
import { breadcrumbJsonLd, safeJsonLd } from "@/lib/seo/jsonld";
import { DarNuntaClient } from "./client";

// M10 Intern #2 — "Cât să dau dar la nuntă?" calculator (Feature 3).
// Classic Moldovan dilemma: based on relationship to couple, city tier,
// whether you attend solo/couple/family, and venue tier, compute a
// suggested minimum / typical / generous gift amount in €.

export async function generateMetadata() {
  // All three languages up front — metaForPath serves the one the
  // middleware resolved from the URL prefix.
  return metaForPath("/calculatoare/dar-nunta", {
    ro: {
      title: "Cât să dau dar la nuntă? — Calculator Moldova",
      description:
        "Calculează suma potrivită pentru darul de nuntă în funcție de relația cu mirii, oraș, tipul sălii și câte persoane mergi. Sugestii reale pentru Moldova 2025.",
    },
    ru: {
      title: "Сколько дарить на свадьбу? — калькулятор для Молдовы",
      description:
        "Рассчитайте подходящую сумму подарка: степень родства с молодожёнами, город, уровень зала и сколько человек идёт с вами. Ориентиры для Молдовы, 2025.",
    },
    en: {
      title: "How Much to Give at a Wedding? — Moldova Calculator",
      description:
        "Work out the right wedding gift from your relationship to the couple, the city, the venue tier and how many of you attend. Real Moldova figures, 2025.",
    },
  });
}

export default function DarNuntaPage() {
  const breadcrumbs = [
    { name: "Acasă", url: "/" },
    { name: "Calculatoare", url: "/calculatoare" },
    { name: "Dar de nuntă", url: "/calculatoare/dar-nunta" },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(breadcrumbJsonLd(breadcrumbs)),
        }}
      />
      <DarNuntaClient />
    </>
  );
}
