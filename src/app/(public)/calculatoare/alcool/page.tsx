import type { Metadata } from "next";
import Link from "next/link";
import { generateMeta } from "@/lib/seo/generate-meta";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { DrinksCalculatorClient } from "./client";

// M3 #3 — Alcohol & drinks calculator.
// URL: /calculatoare/alcool

export const metadata: Metadata = generateMeta({
  title: "Calculator băuturi nuntă — vin, vodcă, coniac, șampanie, apă",
  description:
    "Calculează câte sticle de vin, vodcă, coniac, șampanie, bere și apă îți trebuie pentru nuntă, botez sau cumătrie. Norme Moldova, 2025.",
  path: "/calculatoare/alcool",
});

export default function DrinksCalculatorPage() {
  const breadcrumbs = [
    { name: "Acasă", url: "/" },
    { name: "Calculatoare", url: "/calculatoare" },
    { name: "Băuturi", url: "/calculatoare/alcool" },
  ];
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(breadcrumbs)) }}
      />
      <div className="mx-auto max-w-4xl px-4 py-10 lg:px-8">
        <nav className="mb-4 text-xs text-muted-foreground">
          <Link href="/" className="hover:text-gold">Acasă</Link>
          <span className="mx-2">/</span>
          <Link href="/calculatoare" className="hover:text-gold">Calculatoare</Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">Băuturi</span>
        </nav>
        <header className="mb-8">
          <h1 className="font-heading text-3xl font-bold md:text-4xl">
            Calculator băuturi pentru eveniment
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
            Află exact câte sticle de vin, vodcă, coniac, șampanie, bere și apă trebuie să cumperi
            în funcție de tipul evenimentului, numărul de invitați și durata petrecerii.
          </p>
        </header>
        <DrinksCalculatorClient />
      </div>
    </>
  );
}
