import type { Metadata } from "next";
import Link from "next/link";
import { generateMeta } from "@/lib/seo/generate-meta";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { GuestCalculatorClient } from "./client";

// M3 #2 — Guest / table planning calculator.
// URL: /calculatoare/invitati

export const metadata: Metadata = generateMeta({
  title: "Calculator invitați, mese și logistică eveniment",
  description:
    "Calculează câte mese, băi, ospătari și locuri de parcare îți trebuie pentru numărul tău de invitați. Formule verificate pentru nunți și evenimente în Moldova.",
  path: "/calculatoare/invitati",
});

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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(breadcrumbs)) }}
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
