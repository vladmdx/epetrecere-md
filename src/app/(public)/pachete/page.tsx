import type { Metadata } from "next";
import Link from "next/link";
import { Check, Star, Zap, Crown } from "lucide-react";
import { generateMeta } from "@/lib/seo/generate-meta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = generateMeta({
  title: "Pachete pentru furnizori",
  description:
    "Alege pachetul potrivit pentru profilul tău pe ePetrecere.md — Basic, Pro sau Premium. Listează-ți serviciile, primești cereri directe și crești vânzările.",
  path: "/pachete",
});

interface Tier {
  id: "basic" | "pro" | "premium";
  name: string;
  tagline: string;
  priceLabel: string;
  priceNote: string;
  highlight?: boolean;
  icon: typeof Star;
  features: string[];
  cta: string;
}

const tiers: Tier[] = [
  {
    id: "basic",
    name: "Basic",
    tagline: "Începe gratuit, vizibilitate de bază",
    priceLabel: "Gratuit",
    priceNote: "pentru totdeauna",
    icon: Star,
    features: [
      "Profil public complet (foto, descriere, contact)",
      "Listare în catalogul public",
      "Până la 5 fotografii în galerie",
      "1 pachet de servicii",
      "Primești cereri de ofertă",
      "Notificări email",
    ],
    cta: "Începe gratuit",
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Cel mai popular pentru profesioniști",
    priceLabel: "49€",
    priceNote: "pe lună",
    highlight: true,
    icon: Zap,
    features: [
      "Tot din Basic",
      "Galerie nelimitată (foto + video)",
      "Pachete nelimitate cu prețuri",
      "Calendar de disponibilitate sincronizat",
      "Badge „Verificat” pe profil",
      "Răspuns automat la cereri",
      "Prioritate în rezultate de căutare",
      "Statistici detaliate (vizualizări, conversii)",
      "Chat direct cu clienții",
    ],
    cta: "Aplică pentru Pro",
  },
  {
    id: "premium",
    name: "Premium",
    tagline: "Maximum expunere și suport dedicat",
    priceLabel: "129€",
    priceNote: "pe lună",
    icon: Crown,
    features: [
      "Tot din Pro",
      "Badge „Premium” auriu pe profil",
      "Poziție featured pe homepage",
      "Listare prioritară în categoria ta",
      "AI Assistant pentru descrieri & răspunsuri",
      "Rapoarte lunare personalizate",
      "Suport dedicat (manager de cont)",
      "Campanii de promovare pe social media",
      "Integrare calendar Google/Apple",
    ],
    cta: "Vreau Premium",
  },
];

const faqs = [
  {
    q: "Pot schimba pachetul oricând?",
    a: "Da, poți face upgrade sau downgrade oricând din panoul vendor. Schimbarea intră în vigoare imediat, iar diferența se prorată pentru luna curentă.",
  },
  {
    q: "Ce se întâmplă dacă anulez?",
    a: "Profilul tău rămâne activ pe planul Basic. Nu pierzi datele, galeria sau cererile primite — doar funcționalitățile Pro/Premium se dezactivează.",
  },
  {
    q: "Există comisioane pentru rezervări?",
    a: "Nu. Pe ePetrecere.md plătești doar abonamentul lunar. Toate cererile și rezervările ajung direct la tine, fără comision pentru platformă.",
  },
  {
    q: "Ce include „poziție featured” din Premium?",
    a: "Profilul tău apare pe homepage în secțiunea „Artiști recomandați” timp de minim 7 zile pe lună, rotativ cu alți Premium din categoria ta.",
  },
];

export default function PacketsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
      {/* Hero */}
      <div className="mx-auto max-w-3xl text-center">
        <p className="mb-2 text-sm font-medium uppercase tracking-[3px] text-gold">
          Pentru furnizori
        </p>
        <h1 className="font-heading text-3xl font-bold md:text-4xl">
          Alege pachetul potrivit pentru afacerea ta
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Crește vizibilitatea, primește cereri calificate și gestionează-ți
          rezervările dintr-un singur loc. Fără comisioane — doar abonament lunar transparent.
        </p>
      </div>

      {/* Tiers */}
      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {tiers.map((tier) => {
          const Icon = tier.icon;
          return (
            <div
              key={tier.id}
              className={`relative flex flex-col rounded-2xl border p-6 ${
                tier.highlight
                  ? "border-gold bg-gradient-to-b from-gold/10 to-transparent shadow-lg"
                  : "border-border/40 bg-card"
              }`}
            >
              {tier.highlight && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gold text-background">
                  Cel mai popular
                </Badge>
              )}
              <div className="flex items-center gap-2">
                <Icon
                  className={`h-5 w-5 ${
                    tier.highlight ? "text-gold" : "text-muted-foreground"
                  }`}
                />
                <h3 className="font-heading text-xl font-bold">{tier.name}</h3>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{tier.tagline}</p>
              <div className="mt-6">
                <span className="font-accent text-4xl font-semibold">
                  {tier.priceLabel}
                </span>
                <span className="ml-2 text-sm text-muted-foreground">
                  {tier.priceNote}
                </span>
              </div>
              <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check
                      className={`mt-0.5 h-4 w-4 shrink-0 ${
                        tier.highlight ? "text-gold" : "text-success"
                      }`}
                    />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={`/contact?subject=${tier.id}`}
                className={`mt-6 inline-flex w-full items-center justify-center rounded-lg px-4 py-2 text-sm font-medium ${
                  tier.highlight
                    ? "bg-gold text-background hover:bg-gold-dark"
                    : "border border-border bg-background hover:bg-muted"
                }`}
              >
                {tier.cta}
              </Link>
            </div>
          );
        })}
      </div>

      {/* Comparison note */}
      <div className="mt-10 rounded-xl border border-gold/20 bg-gold/5 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Toate pachetele includ:</strong>{" "}
          SSL & backup automat · GDPR compliant · support în română & rusă ·
          actualizări lunare · garanție 14 zile money-back pe Pro și Premium
        </p>
      </div>

      {/* FAQ */}
      <div className="mt-16">
        <h2 className="text-center font-heading text-2xl font-bold">
          Întrebări frecvente
        </h2>
        <div className="mx-auto mt-8 grid max-w-4xl gap-4 md:grid-cols-2">
          {faqs.map((faq) => (
            <div
              key={faq.q}
              className="rounded-xl border border-border/40 bg-card p-5"
            >
              <h3 className="font-medium">{faq.q}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="mt-16 rounded-2xl bg-gradient-to-br from-gold/20 via-gold/5 to-transparent p-8 text-center md:p-12">
        <h2 className="font-heading text-2xl font-bold md:text-3xl">
          Gata să începi?
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Creează-ți profilul în 5 minute și începi să primești cereri în aceeași zi.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/sign-up?role=vendor"
            className="inline-flex items-center justify-center rounded-lg bg-gold px-4 py-2 text-sm font-medium text-background hover:bg-gold-dark"
          >
            Creează profil gratuit
          </Link>
          <Link
            href="/contact"
            className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Vorbește cu noi
          </Link>
        </div>
      </div>
    </div>
  );
}
