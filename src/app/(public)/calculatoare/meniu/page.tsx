import Link from "next/link";
import { metaForPath } from "@/lib/seo/page-meta";
import { breadcrumbJsonLd, safeJsonLd } from "@/lib/seo/jsonld";
import { MenuCalculatorClient } from "./client";

// M3 #4 — Menu / food calculator.
// URL: /calculatoare/meniu

export async function generateMetadata() {
  return metaForPath("/calculatoare/meniu", {
    title: "Calculator meniu & mâncare nuntă, botez, cumătrie",
    description:
      "Calculează cantitățile de aperitive, fel principal, zeamă, fructe și tort pentru evenimentul tău. Norme pe porții, prețuri bulk Moldova 2026.",
  });
}

export default function MenuCalculatorPage() {
  const breadcrumbs = [
    { name: "Acasă", url: "/" },
    { name: "Calculatoare", url: "/calculatoare" },
    { name: "Meniu", url: "/calculatoare/meniu" },
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
          <span className="text-foreground">Meniu</span>
        </nav>
        <header className="mb-8">
          <h1 className="font-heading text-3xl font-bold md:text-4xl">
            Calculator meniu eveniment
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
            Află câte kilograme de mâncare îți trebuie pe fiecare fel de mâncare — de la răcituri și
            salate până la tort și gustare de noapte.
          </p>
        </header>
        <MenuCalculatorClient />
      </div>
    </>
  );
}
