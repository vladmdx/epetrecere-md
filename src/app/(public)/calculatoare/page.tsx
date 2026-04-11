import type { Metadata } from "next";
import Link from "next/link";
import { generateMeta } from "@/lib/seo/generate-meta";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { Calculator, Wallet, Users, Wine, Utensils, Heart, Gift, ArrowRight } from "lucide-react";

// M3 — Calculators index. Entry point for all event planning tools.

export const metadata: Metadata = generateMeta({
  title: "Calculatoare pentru evenimente — Buget, invitați, băuturi, meniu | ePetrecere.md",
  description:
    "Calculează bugetul nunții, numărul de invitați și mese, cantitățile de băuturi și meniul pentru evenimentul tău. Estimări gratuite bazate pe prețuri reale din Moldova.",
  path: "/calculatoare",
});

const CALCULATORS = [
  {
    slug: "dar-nunta",
    title: "Cât să dau dar la nuntă?",
    description:
      "Calculează suma potrivită pentru dar în funcție de relație, tipul sălii și orașul unde este nunta. Sugestii reale pentru Moldova.",
    icon: Gift,
    color: "text-gold",
    highlights: ["Minimum / Tipic / Generos", "Adulți + copii", "Relație + zonă"],
  },
  {
    slug: "nunta",
    title: "Calculator Cost Nuntă",
    description:
      "Estimare completă nuntă Moldova — sală, rochie, inele, foto-video, muzică, decor și lună de miere.",
    icon: Heart,
    color: "text-rose-500",
    highlights: ["13 categorii cu intervale reale", "Preț pe invitat", "Top 5 categorii ca pondere"],
  },
  {
    slug: "buget",
    title: "Calculator Buget Eveniment",
    description:
      "Estimează costul total al nunții, botezului sau cumătriei — meniu, artiști, decor și toate extraurile.",
    icon: Wallet,
    color: "text-emerald-500",
    highlights: ["Costuri pentru 12+ categorii", "Interval minim–maxim", "Preț pe persoană"],
  },
  {
    slug: "invitati",
    title: "Calculator Invitați & Mese",
    description:
      "Câte mese îți trebuie, câte băi, cât personal de servire și câte locuri de parcare pentru numărul tău de invitați.",
    icon: Users,
    color: "text-blue-500",
    highlights: ["Mese și locuri", "Rata de absențe", "Personal & parcare"],
  },
  {
    slug: "alcool",
    title: "Calculator Băuturi",
    description:
      "Câte sticle de vin, vodcă, coniac, șampanie, bere și apă îți trebuie pentru evenimentul tău.",
    icon: Wine,
    color: "text-rose-500",
    highlights: ["Norme Moldova", "Cost total estimat", "Scalare după durată"],
  },
  {
    slug: "meniu",
    title: "Calculator Meniu",
    description:
      "Cantitățile de mâncare pe porții — aperitive reci, fel principal, tort, fructe, zeamă și late-night.",
    icon: Utensils,
    color: "text-amber-500",
    highlights: ["Grame pe invitat", "Kilograme totale", "Cost bulk"],
  },
];

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://epetrecere.md";

export default function CalculatorsIndexPage() {
  const breadcrumbs = [
    { name: "Acasă", url: "/" },
    { name: "Calculatoare", url: "/calculatoare" },
  ];

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Calculatoare pentru evenimente",
    numberOfItems: CALCULATORS.length,
    itemListElement: CALCULATORS.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${BASE_URL}/calculatoare/${c.slug}`,
      name: c.title,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(breadcrumbs)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }}
      />

      <div className="mx-auto max-w-5xl px-4 py-12 lg:px-8">
        <nav className="mb-4 text-xs text-muted-foreground">
          <Link href="/" className="hover:text-gold">Acasă</Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">Calculatoare</span>
        </nav>

        <header className="mb-10 text-center">
          <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/10">
            <Calculator className="h-8 w-8 text-gold" />
          </div>
          <h1 className="font-heading text-3xl font-bold md:text-4xl">
            Calculatoare pentru evenimente
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
            Planifică-ți bugetul, cantitățile și logistica înainte de a contacta
            vendorii. Toate estimările sunt bazate pe prețuri reale din Moldova,
            actualizate în 2025.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          {CALCULATORS.map((c) => {
            const Icon = c.icon;
            return (
              <Link
                key={c.slug}
                href={`/calculatoare/${c.slug}`}
                className="group relative overflow-hidden rounded-2xl border border-border/40 bg-card p-6 transition-all hover:border-gold/40 hover:shadow-lg"
              >
                <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-muted ${c.color}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <h2 className="mb-2 font-heading text-xl font-semibold group-hover:text-gold">
                  {c.title}
                </h2>
                <p className="mb-4 text-sm text-muted-foreground">{c.description}</p>
                <ul className="mb-4 space-y-1">
                  {c.highlights.map((h) => (
                    <li key={h} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="h-1 w-1 rounded-full bg-gold" />
                      {h}
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-1 text-sm font-medium text-gold">
                  Deschide calculatorul
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            );
          })}
        </div>

        <div className="mt-12 rounded-2xl border border-gold/20 bg-gold/5 p-6 text-center">
          <h3 className="mb-2 font-heading text-lg font-semibold">
            Gata cu calculele? Găsește vendorii potriviți.
          </h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Folosește planificatorul nostru și primești rezultate personalizate în mai puțin de un minut.
          </p>
          <Link
            href="/planifica"
            className="inline-flex items-center gap-2 rounded-lg bg-gold px-6 py-2.5 text-sm font-medium text-background hover:bg-gold-dark"
          >
            Planifică evenimentul
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </>
  );
}
