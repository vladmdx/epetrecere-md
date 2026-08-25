import type { Metadata } from "next";
import Link from "@/components/shared/locale-link";
import { generateMetaAsync } from "@/lib/seo/generate-meta";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const meta = {
    ro: {
      title: "Termeni și Condiții",
      description:
        "Termenii și condițiile de utilizare a platformei ePetrecere.md, pentru clienți și pentru furnizori.",
    },
    ru: {
      title: "Условия использования",
      description:
        "Условия использования платформы ePetrecere.md — для клиентов и для поставщиков услуг.",
    },
    en: {
      title: "Terms and Conditions",
      description:
        "The terms and conditions for using the ePetrecere.md platform, for clients and service providers alike.",
    },
  }[locale];
  return generateMetaAsync({
    title: meta.title,
    description: meta.description,
    path: "/termeni",
    locale,
  });
}

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
          <h2 className="font-heading text-xl font-semibold text-foreground">7. Operatorul platformei</h2>
          <p className="mt-2">
            Operatorul platformei este Societatea cu Răspundere Limitată „EPETRECERE” (EPETRECERE S.R.L.), IDNO 1026023123354, cu sediul în MD-3701, or. Strășeni, str. Mihai Eminescu 64, of. 6, Republica Moldova.{" "}
            Documentele contractuale complete — Termenii Generali, acordurile
            cu partenerii și cu locațiile, politicile de confidențialitate,
            cookie, recenzii și anti-fraudă — sunt publicate la{" "}
            <a href="/legal" className="text-gold underline">
              /legal
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold text-foreground">8. Contact</h2>
          <p className="mt-2">
            Întrebări?{" "}
            <a href="mailto:legal@epetrecere.md" className="text-gold underline">
              legal@epetrecere.md
            </a>
          </p>
        </section>
      </div>
    
      <div className="mt-8 rounded-xl border border-gold/30 bg-gold/5 p-4 text-sm">
        <p className="font-semibold">Pachetul legal complet</p>
        <p className="mt-1 text-muted-foreground">
          Acordurile pentru parteneri și locații, regulile marketplace, tarifele și
          politicile de recenzii, anti-fraudă și calitate sunt disponibile în română și
          rusă la <Link href="/legal" className="text-gold hover:underline">Documente legale</Link>.
        </p>
      </div>
    </div>
  );
}
