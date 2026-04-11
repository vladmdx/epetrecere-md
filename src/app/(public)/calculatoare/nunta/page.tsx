import type { Metadata } from "next";
import Link from "next/link";
import { generateMeta } from "@/lib/seo/generate-meta";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { WeddingCostCalculatorClient } from "./client";

// M7 Feature 8 — Dedicated Wedding Cost Calculator.
// Distinct from /calculatoare/buget (generic event) because weddings have
// unique categories (inele, rochie, costum, dar de nașă, lună de miere) and
// Moldovan traditions (cumătri, nași) that don't apply to corporate/birthday.

export const metadata: Metadata = generateMeta({
  title: "Calculator cost nuntă Moldova 2025 — estimează total pe categorii",
  description:
    "Cât costă o nuntă în Moldova? Calculator complet: sală, meniu, rochie, foto-video, decor, inele, lună de miere. Estimări pe intervale reale 2025.",
  path: "/calculatoare/nunta",
});

export default function WeddingCostPage() {
  const breadcrumbs = [
    { name: "Acasă", url: "/" },
    { name: "Calculatoare", url: "/calculatoare" },
    { name: "Cost nuntă", url: "/calculatoare/nunta" },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbJsonLd(breadcrumbs)),
        }}
      />
      <div className="mx-auto max-w-5xl px-4 py-12 lg:px-8">
        <nav className="mb-4 text-xs text-muted-foreground">
          <Link href="/" className="hover:text-gold">
            Acasă
          </Link>
          <span className="mx-2">/</span>
          <Link href="/calculatoare" className="hover:text-gold">
            Calculatoare
          </Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">Cost nuntă</span>
        </nav>
        <header className="mb-8">
          <h1 className="font-heading text-3xl font-bold md:text-4xl">
            Calculator cost nuntă Moldova
          </h1>
          <p className="mt-2 text-sm text-muted-foreground md:text-base">
            Estimare completă a bugetului pentru nunta ta, cu categorii
            specifice tradițiilor moldovenești. Modifică valorile în fiecare
            categorie pentru a vedea impactul pe totalul final.
          </p>
        </header>
        <WeddingCostCalculatorClient />
      </div>
    </>
  );
}
