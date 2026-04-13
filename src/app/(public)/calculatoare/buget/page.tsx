import type { Metadata } from "next";
import Link from "next/link";
import { generateMeta } from "@/lib/seo/generate-meta";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { BudgetCalculatorClient } from "./client";

// M3 #1 — Budget calculator.
// URL: /calculatoare/buget
// Server component handles metadata + breadcrumbs; the interactive form is
// in ./client.tsx since it needs React state.

export const metadata: Metadata = generateMeta({
  title: "Calculator buget nuntă, botez, cumătrie — estimare online gratuită",
  description:
    "Calculează bugetul exact pentru nuntă, botez sau cumătrie în Moldova. Meniu, artiști, decor, foto-video, transport — prețuri reale 2025 pe ePetrecere.md.",
  path: "/calculatoare/buget",
});

export default function BudgetCalculatorPage() {
  const breadcrumbs = [
    { name: "Acasă", url: "/" },
    { name: "Calculatoare", url: "/calculatoare" },
    { name: "Buget", url: "/calculatoare/buget" },
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
          <span className="text-foreground">Buget</span>
        </nav>
        <header className="mb-8">
          <h1 className="font-heading text-3xl font-bold md:text-4xl">
            Calculator buget eveniment
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
            Alege tipul evenimentului, numărul de invitați, prețul pe persoană la sală și serviciile
            de care ai nevoie. Îți calculăm instant bugetul total cu un interval realistic.
          </p>
        </header>
        <BudgetCalculatorClient />
      </div>
    </>
  );
}
