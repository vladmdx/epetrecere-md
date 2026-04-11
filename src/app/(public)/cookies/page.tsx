import type { Metadata } from "next";
import Link from "next/link";
import { generateMeta } from "@/lib/seo/generate-meta";

export const metadata: Metadata = generateMeta({
  title: "Politica Cookies | ePetrecere.md",
  description:
    "Cum folosim cookie-urile pe ePetrecere.md și cum le poți gestiona.",
  path: "/cookies",
});

export default function CookiesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 lg:px-8">
      <nav className="mb-4 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-gold">Acasă</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Cookies</span>
      </nav>

      <h1 className="font-heading text-3xl font-bold md:text-4xl">
        Politica Cookies
      </h1>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <p>
          Un cookie este un fișier text mic pe care site-ul îl stochează pe
          dispozitivul tău pentru a reține preferințe sau a măsura utilizarea.
        </p>

        <section>
          <h2 className="font-heading text-xl font-semibold text-foreground">Cookie-uri esențiale</h2>
          <p className="mt-2">
            Fără acestea site-ul nu funcționează: autentificare, sesiune,
            protecție CSRF. Nu poți să le dezactivezi din setări.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold text-foreground">Cookie-uri de preferințe</h2>
          <p className="mt-2">
            Păstrăm local limba aleasă, modul întunecat și acordul pentru
            cookies (localStorage <code>cookie-consent</code>).
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold text-foreground">Cookie-uri de analytics</h2>
          <p className="mt-2">
            Doar dacă accepți, folosim un instrument de analytics agregat
            pentru a înțelege cum este folosit site-ul. Nu te identificăm
            personal.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold text-foreground">Cum le controlezi</h2>
          <p className="mt-2">
            Poți șterge cookie-urile oricând din setările browserului sau
            retrage acordul resetând localStorage-ul (F12 → Application →
            Local Storage → șterge cookie-consent).
          </p>
        </section>

        <section>
          <p>
            Întrebări? Scrie-ne la{" "}
            <a href="mailto:privacy@epetrecere.md" className="text-gold underline">
              privacy@epetrecere.md
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
