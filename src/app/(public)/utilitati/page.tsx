import Link from "next/link";
import { metaForPath } from "@/lib/seo/page-meta";
import { ScrollReveal } from "@/components/shared/scroll-reveal";
import { TOOL_DEFS } from "@/lib/utilitati/tools";
import { ArrowRight } from "lucide-react";

export const revalidate = 3600;

export async function generateMetadata() {
  return metaForPath("/utilitati", {
    title: "Utilități pentru Evenimente — ePetrecere.md",
    description:
      "Toate instrumentele de care ai nevoie pentru a-ți organiza evenimentul în Moldova: checklist, buget, invitații electronice, listă invitați și calculatoare. Gratuit.",
  });
}

const CALCULATORS = [
  { slug: "buget", title: "Calculator Buget", desc: "Estimează bugetul total al evenimentului." },
  { slug: "invitati", title: "Calculator Invitați & Mese", desc: "Câte mese, ospătari și locuri de parcare îți trebuie?" },
  { slug: "dar-nunta", title: "Calculator Dar Nuntă", desc: "Cât să dai dar la nuntă în Moldova." },
  { slug: "nunta", title: "Calculator Cost Nuntă", desc: "Estimare totală pentru nunta ta în 2025." },
  { slug: "alcool", title: "Calculator Băuturi", desc: "Câte sticle de vin, vodcă și șampanie pe invitat." },
  { slug: "meniu", title: "Calculator Meniu", desc: "Cantități realiste pentru aperitive, fel principal, desert." },
];

export default function UtilitatiHubPage() {
  return (
    <main className="relative min-h-screen pt-24 pb-20">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <img
          src="/images/backgrounds/party-dance.jpg"
          alt=""
          className="parallax-bg h-full w-full object-cover opacity-[0.07] blur-[2px]"
          loading="lazy"
        />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 lg:px-8">
        <ScrollReveal>
          <div className="mb-12 text-center">
            <p className="mb-2 text-sm font-medium uppercase tracking-[3px] text-gold">
              Utilități
            </p>
            <h1 className="font-heading text-3xl font-bold md:text-5xl text-[#FAF8F2]">
              Instrumente pentru Evenimentul Tău
            </h1>
            <p className="mt-4 max-w-2xl mx-auto text-base text-muted-foreground">
              Tot ce-ți trebuie pentru a organiza o nuntă, cumătrie, botez sau
              eveniment corporate fără stres — checklist, buget, invitații
              electronice, listă invitați, galerie foto și calculatoare. Gratuit.
            </p>
          </div>
        </ScrollReveal>

        {/* Tools grid */}
        <section className="mb-16">
          <ScrollReveal>
            <h2 className="mb-6 font-heading text-2xl font-bold text-[#FAF8F2]">
              Instrumente Online
            </h2>
          </ScrollReveal>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TOOL_DEFS.map((tool, i) => (
              <ScrollReveal key={tool.slug} delay={i * 0.05}>
                <Link
                  href={`/utilitati/${tool.slug}`}
                  className="group block h-full rounded-xl border border-border/40 bg-card p-6 transition-all hover:border-gold/40 hover:bg-card/80"
                >
                  <div className="text-3xl mb-3">{tool.emoji}</div>
                  <h3 className="font-heading text-lg font-bold mb-2 text-foreground group-hover:text-gold transition-colors">
                    {tool.title}
                  </h3>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {tool.shortPitch}
                  </p>
                  <div className="mt-4 flex items-center gap-1 text-xs font-medium text-gold opacity-0 transition-opacity group-hover:opacity-100">
                    Deschide
                    <ArrowRight className="h-3 w-3" />
                  </div>
                </Link>
              </ScrollReveal>
            ))}
          </div>
        </section>

        {/* Calculators grid */}
        <section>
          <ScrollReveal>
            <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
              <h2 className="font-heading text-2xl font-bold text-[#FAF8F2]">
                Calculatoare
              </h2>
              <Link
                href="/calculatoare"
                className="text-xs text-gold hover:underline flex items-center gap-1"
              >
                Vezi toate <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </ScrollReveal>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CALCULATORS.map((calc, i) => (
              <ScrollReveal key={calc.slug} delay={i * 0.04}>
                <Link
                  href={`/calculatoare/${calc.slug}`}
                  className="group block h-full rounded-xl border border-border/40 bg-card p-6 transition-all hover:border-gold/40 hover:bg-card/80"
                >
                  <div className="text-3xl mb-3">🧮</div>
                  <h3 className="font-heading text-lg font-bold mb-2 text-foreground group-hover:text-gold transition-colors">
                    {calc.title}
                  </h3>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {calc.desc}
                  </p>
                </Link>
              </ScrollReveal>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
