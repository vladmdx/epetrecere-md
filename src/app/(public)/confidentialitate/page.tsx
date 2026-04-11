import type { Metadata } from "next";
import Link from "next/link";
import { generateMeta } from "@/lib/seo/generate-meta";

// M11 Intern #1 — GDPR privacy policy (Feature: compliance).

export const metadata: Metadata = generateMeta({
  title: "Politica de Confidențialitate | ePetrecere.md",
  description:
    "Cum colectăm, folosim și protejăm datele tale personale pe ePetrecere.md. Drepturile tale conform GDPR și Legii 133/2011 a RM.",
  path: "/confidentialitate",
});

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 lg:px-8">
      <nav className="mb-4 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-gold">Acasă</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Politica de Confidențialitate</span>
      </nav>

      <h1 className="font-heading text-3xl font-bold md:text-4xl">
        Politica de Confidențialitate
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Ultima actualizare: 1 ianuarie 2026
      </p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="font-heading text-xl font-semibold">1. Cine suntem</h2>
          <p className="mt-2 text-muted-foreground">
            ePetrecere.md este un marketplace de servicii pentru evenimente din
            Republica Moldova (nunți, cumetrii, corporate, aniversări). Operăm în
            conformitate cu Legea nr. 133/2011 privind protecția datelor cu
            caracter personal a RM și, pentru utilizatorii din UE, conform
            Regulamentului General privind Protecția Datelor (GDPR) UE 2016/679.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold">2. Ce date colectăm</h2>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            <li>• <strong>Date de cont:</strong> nume, email, telefon (la înregistrare)</li>
            <li>• <strong>Date de eveniment:</strong> tip eveniment, dată, locație, număr invitați, buget (când trimiți o solicitare)</li>
            <li>• <strong>Date de interacțiune:</strong> mesaje către artiști, recenzii, fotografii încărcate</li>
            <li>• <strong>Date tehnice:</strong> adresă IP, tip browser, cookie-uri (analytics)</li>
          </ul>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold">3. Cum folosim datele</h2>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            <li>• Pentru a conecta clienții cu furnizorii de servicii</li>
            <li>• Pentru a genera oferte personalizate prin sistemul de matching</li>
            <li>• Pentru a trimite confirmări, reminduri și emailuri tranzacționale</li>
            <li>• Pentru a îmbunătăți platforma (analytics agregat, fără identificare)</li>
            <li>• Pentru a respecta obligațiile legale</li>
          </ul>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold">4. Cu cine partajăm</h2>
          <p className="mt-2 text-muted-foreground">
            Datele tale NU sunt vândute niciodată. Le partajăm doar cu:
          </p>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            <li>• <strong>Furnizorii la care trimiți solicitarea</strong> (nume, telefon, email, detaliile evenimentului)</li>
            <li>• <strong>Procesatori tehnici:</strong> Neon (DB), Clerk (auth), Resend (email), Anthropic (AI)</li>
            <li>• <strong>Autorități</strong> doar când e obligatoriu prin lege</li>
          </ul>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold">5. Cât timp păstrăm datele</h2>
          <p className="mt-2 text-muted-foreground">
            Contul tău și datele asociate sunt păstrate atât timp cât contul este
            activ. La ștergerea contului, datele personale sunt eliminate în
            maximum 30 de zile, cu excepția informațiilor necesare pentru
            obligații legale (facturare, contabilitate).
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold">6. Drepturile tale</h2>
          <p className="mt-2 text-muted-foreground">
            Conform GDPR și Legii 133/2011, ai dreptul la:
          </p>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            <li>• <strong>Acces</strong> la datele tale personale</li>
            <li>• <strong>Rectificare</strong> a datelor incorecte</li>
            <li>• <strong>Ștergere</strong> (&quot;dreptul de a fi uitat&quot;)</li>
            <li>• <strong>Portabilitate</strong> (export într-un format standard)</li>
            <li>• <strong>Opoziție</strong> la prelucrarea pentru marketing</li>
            <li>• <strong>Retragerea consimțământului</strong> în orice moment</li>
          </ul>
          <p className="mt-3 text-muted-foreground">
            Poți exercita aceste drepturi din{" "}
            <Link href="/cabinet/date" className="text-gold underline">
              Cabinet → Datele mele
            </Link>{" "}
            sau scriindu-ne la{" "}
            <a href="mailto:privacy@epetrecere.md" className="text-gold underline">
              privacy@epetrecere.md
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold">7. Cookies</h2>
          <p className="mt-2 text-muted-foreground">
            Folosim cookie-uri esențiale (autentificare, sesiune) și cookie-uri
            de analytics (agregate, anonimizate). Poți citi mai multe în{" "}
            <Link href="/cookies" className="text-gold underline">Politica Cookies</Link>.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold">8. Contact</h2>
          <p className="mt-2 text-muted-foreground">
            Pentru orice întrebare legată de datele tale personale:{" "}
            <a href="mailto:privacy@epetrecere.md" className="text-gold underline">
              privacy@epetrecere.md
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
