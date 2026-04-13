import type { Metadata } from "next";
import { generateMeta } from "@/lib/seo/generate-meta";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { DarNuntaClient } from "./client";

// M10 Intern #2 — "Cât să dau dar la nuntă?" calculator (Feature 3).
// Classic Moldovan dilemma: based on relationship to couple, city tier,
// whether you attend solo/couple/family, and venue tier, compute a
// suggested minimum / typical / generous gift amount in €.

export const metadata: Metadata = generateMeta({
  title: "Cât să dau dar la nuntă? — Calculator Moldova",
  description:
    "Calculează suma potrivită pentru darul de nuntă în funcție de relația cu mirii, oraș, tipul sălii și câte persoane mergi. Sugestii reale pentru Moldova 2025.",
  path: "/calculatoare/dar-nunta",
});

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
          __html: JSON.stringify(breadcrumbJsonLd(breadcrumbs)),
        }}
      />
      <DarNuntaClient />
    </>
  );
}
