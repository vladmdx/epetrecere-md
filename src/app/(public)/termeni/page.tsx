import type { Metadata } from "next";
import Link from "next/link";
import { generateMeta } from "@/lib/seo/generate-meta";

export const metadata: Metadata = generateMeta({
  title: "Termeni și Condiții | ePetrecere.md",
  description:
    "Termenii și condițiile de utilizare a platformei ePetrecere.md.",
  path: "/termeni",
});

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 lg:px-8">
      <nav className="mb-4 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-gold">Acasă</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Termeni</span>
      </nav>

      <h1 className="font-heading text-3xl font-bold md:text-4xl">
        Termeni și Condiții
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">Ultima actualizare: 1 ianuarie 2026</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="font-heading text-xl font-semibold text-foreground">1. Despre serviciu</h2>
          <p className="mt-2">
            ePetrecere.md este un marketplace care pune în legătură clienții
            care planifică evenimente cu furnizorii de servicii (artiști,
            săli, fotografi, etc.) din Moldova. Nu suntem parte la contractele
            dintre clienți și furnizori.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold text-foreground">2. Cont și eligibilitate</h2>
          <p className="mt-2">
            Trebuie să ai cel puțin 18 ani pentru a crea un cont. Ești
            responsabil pentru păstrarea credențialelor în siguranță.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold text-foreground">3. Conduita utilizatorilor</h2>
          <p className="mt-2">
            Este interzis să postezi conținut ilegal, înșelător, jignitor
            sau să folosești platforma pentru spam. Recenziile false sunt
            interzise și vor fi șterse.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold text-foreground">4. Responsabilități</h2>
          <p className="mt-2">
            Nu garantăm disponibilitatea, calitatea sau legalitatea
            serviciilor furnizorilor listați. Încurajăm clienții să verifice
            fiecare furnizor independent și să semneze un contract scris.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold text-foreground">5. Proprietate intelectuală</h2>
          <p className="mt-2">
            Brand-ul ePetrecere, logoul și designul sunt protejate. Conținutul
            generat de utilizatori rămâne al autorilor, dar ne acordați o
            licență non-exclusivă pentru afișare pe platformă.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold text-foreground">6. Modificări</h2>
          <p className="mt-2">
            Putem actualiza acești termeni. Versiunea curentă este mereu
            accesibilă la /termeni. Continuarea utilizării înseamnă acceptare.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold text-foreground">7. Contact</h2>
          <p className="mt-2">
            Întrebări?{" "}
            <a href="mailto:legal@epetrecere.md" className="text-gold underline">
              legal@epetrecere.md
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
