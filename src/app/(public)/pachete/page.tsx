import type { Metadata } from "next";
import Link from "@/components/shared/locale-link";
import { Check, Percent, Gift, Building2, ShieldCheck } from "lucide-react";
import { generateMetaAsync } from "@/lib/seo/generate-meta";

/**
 * Vendor pricing.
 *
 * This page used to advertise Basic/Pro/Premium subscriptions at 49€/129€ and
 * claim "no commissions". Both statements contradicted the Legal Pack v1.0:
 *   - Tariffs §1: registration and standard publication are FREE, and "at
 *     launch EPETRECERE does not use Basic/Plus/Pro/Premium/Elite packages".
 *   - Tariffs §2 / Partner Agreement §11.1: partners pay a 5% service fee on
 *     confirmed orders — so "fără comisioane" was simply false.
 * The page now states the model we actually operate and bill.
 */

export async function generateMetadata(): Promise<Metadata> {
  return generateMetaAsync({
  title: "Tarife pentru furnizori",
  description:
    "Înregistrarea și listarea pe ePetrecere.md sunt gratuite. Plătești doar 5% din comenzile confirmate obținute prin platformă.",
  path: "/pachete",
});
}

const INCLUDED = [
  "Profil public complet — foto, video, descriere, contact",
  "Apariție în catalog, căutare și pagini de categorie",
  "Cereri de rezervare directe de la clienți",
  "Chat cu clienții și gestionarea cererilor",
  "Calendar de disponibilitate și pachete de servicii",
  "Recenzii verificate de la clienți reali",
];

const FAQ = [
  {
    q: "Cât costă înregistrarea?",
    a: "Nimic. Înregistrarea și publicarea standard a profilului sunt gratuite (Tarife §1). Nu există pachete Basic/Pro/Premium la această etapă.",
  },
  {
    q: "Cum se calculează comisionul?",
    a: "Pentru artiști și prestatori de servicii: 5% din valoarea comenzii confirmate obținute prin platformă, inclusiv serviciile suplimentare care fac parte din comandă (Tarife §2–§3).",
  },
  {
    q: "Când apare obligația de plată?",
    a: "În momentul în care rezervarea primește statutul „Comandă confirmată” (Tarife §5). Plata se face în 10 zile calendaristice de la factură sau notificare (§7).",
  },
  {
    q: "Cât plătesc sălile și restaurantele?",
    a: "Remunerația pentru locații se stabilește separat, în funcție de tipul evenimentului, și este comunicată înainte de nașterea obligației (Tarife §4, Acord Locații §13.2). Nu se aplică comisioane ascunse.",
  },
  {
    q: "Ce se întâmplă dacă evenimentul se anulează?",
    a: "Anularea nu anulează automat remunerația, dar poate fi recalculată în funcție de inițiator, motiv și etapa executării. Dacă evenimentul nu a avut loc și menținerea remunerației ar fi nejustificată, suma se corectează (Tarife §10).",
  },
  {
    q: "Există costuri ascunse?",
    a: "Nu. În viitor pot apărea servicii opționale cu plată — publicitate, promovare, analiză — dar activarea lor nu este automată (Tarife §12).",
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 lg:px-8">
      <div className="text-center">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[3px] text-gold">
          Tarife
        </p>
        <h1 className="font-heading text-3xl font-bold md:text-4xl">
          Listezi gratuit. Plătești doar când câștigi.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          Fără abonament și fără taxă de înregistrare. Platforma reține un comision
          doar din comenzile confirmate pe care ți le aduce.
        </p>
      </div>

      {/* The two things a vendor actually pays */}
      <div className="mt-12 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-border/60 p-6">
          <Gift className="h-7 w-7 text-gold" />
          <h2 className="mt-4 font-heading text-xl font-bold">Înregistrare și listare</h2>
          <p className="mt-1 text-3xl font-bold text-gold">Gratuit</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Profil complet, apariție în catalog și cereri directe de la clienți — fără
            niciun cost recurent.
          </p>
          <ul className="mt-5 space-y-2">
            {INCLUDED.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                <span className="text-muted-foreground">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-gold/40 bg-gold/[0.04] p-6">
          <Percent className="h-7 w-7 text-gold" />
          <h2 className="mt-4 font-heading text-xl font-bold">
            Comision din comenzi confirmate
          </h2>
          <p className="mt-1 text-3xl font-bold text-gold">5%</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Pentru artiști și prestatori de servicii — 5% din valoarea comenzii
            confirmate obținute prin ePetrecere.md. Se aplică doar dacă rezervarea
            ajunge la statutul „confirmată”.
          </p>

          <div className="mt-5 space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
              <span className="text-muted-foreground">
                Baza de calcul: valoarea totală a comenzii, inclusiv serviciile
                suplimentare incluse.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
              <span className="text-muted-foreground">
                Termen de plată: 10 zile calendaristice de la factură sau notificare.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
              <span className="text-muted-foreground">
                Totul e vizibil în contul tău: rezervarea, valoarea, rata, suma și
                statusul plății.
              </span>
            </div>
          </div>

          <div className="mt-5 flex items-start gap-2 rounded-xl border border-border/60 bg-background/50 p-3 text-sm">
            <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <span className="text-muted-foreground">
              <strong className="text-foreground">Săli și restaurante:</strong>{" "}
              remunerația se stabilește separat, în funcție de tipul evenimentului, și
              îți este comunicată înainte de a deveni obligatorie.
            </span>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
        <Link
          href="/sign-up"
          className="inline-flex h-12 items-center justify-center rounded-xl bg-gold px-8 text-sm font-semibold text-[#0D0D0D] transition hover:brightness-105"
        >
          Înregistrează-te gratuit
        </Link>
        <Link
          href="/legal/tarife"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-gold/40 px-8 text-sm font-semibold text-gold transition hover:bg-gold/10"
        >
          <ShieldCheck className="h-4 w-4" />
          Citește tarifele complete
        </Link>
      </div>

      <div className="mt-16">
        <h2 className="mb-6 text-center font-heading text-2xl font-bold">
          Întrebări frecvente
        </h2>
        <div className="space-y-3">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="rounded-xl border border-border/60 p-4 [&_summary]:cursor-pointer"
            >
              <summary className="font-medium">{item.q}</summary>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {item.a}
              </p>
            </details>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Condițiile complete sunt în{" "}
          <Link href="/legal/tarife" className="text-gold hover:underline">
            Tarife
          </Link>
          ,{" "}
          <Link href="/legal/acord-parteneri" className="text-gold hover:underline">
            Acordul pentru Parteneri
          </Link>{" "}
          și{" "}
          <Link href="/legal/acord-locatii" className="text-gold hover:underline">
            Acordul cu Locațiile
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
