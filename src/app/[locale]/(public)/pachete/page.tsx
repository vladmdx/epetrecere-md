import type { Metadata } from "next";
import Link from "@/components/shared/locale-link";
import { Check, Percent, Gift, Building2, ShieldCheck } from "lucide-react";
import { generateMetaAsync } from "@/lib/seo/generate-meta";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";
import { t as translate } from "@/i18n";

/**
 * Vendor pricing.
 *
 * This page used to advertise Basic/Pro/Premium subscriptions at 49€/129€ and
 * claim "no commissions". Both contradicted the Legal Pack v1.0:
 *   - Tariffs §1: registration and standard publication are FREE, and at
 *     launch EPETRECERE does not use Basic/Plus/Pro/Premium/Elite packages.
 *   - Tariffs §2 / Partner Agreement §11.1: partners pay 5% of confirmed
 *     orders — so "fără comisioane" was simply false.
 *
 * Rendered on the server in the visitor's language (from the URL prefix), so
 * /ru/pachete and /en/pachete are real, indexable translations rather than a
 * Romanian page that swaps text after hydration.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const tt = (k: string) => translate(`pricing.${k}`, locale);
  return generateMetaAsync({
    title: tt("metaTitle"),
    description: tt("metaDesc"),
    path: "/pachete",
    locale,
  });
}

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const tt = (k: string) => translate(`pricing.${k}`, locale);

  const included = ["inc1", "inc2", "inc3", "inc4", "inc5", "inc6"].map(tt);
  const feePoints = ["fee1", "fee2", "fee3", "fee4"].map(tt);
  const faq = [1, 2, 3, 4, 5, 6].map((i) => ({
    q: tt(`q${i}`),
    a: tt(`a${i}`),
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 lg:px-8">
      <div className="text-center">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[3px] text-gold">
          {tt("eyebrow")}
        </p>
        <h1 className="font-heading text-3xl font-bold md:text-4xl">{tt("h1")}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          {tt("sub")}
        </p>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-border/60 p-6">
          <Gift className="h-7 w-7 text-gold" />
          <h2 className="mt-4 font-heading text-xl font-bold">{tt("freeTitle")}</h2>
          <p className="mt-1 text-3xl font-bold text-gold">{tt("freeValue")}</p>
          <p className="mt-2 text-sm text-muted-foreground">{tt("freeDesc")}</p>
          <ul className="mt-5 space-y-2">
            {included.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                <span className="text-muted-foreground">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-gold/40 bg-gold/[0.04] p-6">
          <Percent className="h-7 w-7 text-gold" />
          <h2 className="mt-4 font-heading text-xl font-bold">{tt("feeTitle")}</h2>
          <p className="mt-1 text-3xl font-bold text-gold">5%</p>
          <p className="mt-2 text-sm text-muted-foreground">{tt("feeDesc")}</p>

          <div className="mt-5 space-y-3 text-sm">
            {feePoints.map((p) => (
              <div key={p} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                <span className="text-muted-foreground">{p}</span>
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-start gap-2 rounded-xl border border-border/60 bg-background/50 p-3 text-sm">
            <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <span className="text-muted-foreground">
              <strong className="text-foreground">{tt("venuesLabel")}</strong>{" "}
              {tt("venuesNote")}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
        <Link
          href="/sign-up"
          className="inline-flex h-12 items-center justify-center rounded-xl bg-gold px-8 text-sm font-semibold text-[#0D0D0D] transition hover:brightness-105"
        >
          {tt("ctaSignup")}
        </Link>
        <Link
          href="/legal/tarife"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-gold/40 px-8 text-sm font-semibold text-gold transition hover:bg-gold/10"
        >
          <ShieldCheck className="h-4 w-4" />
          {tt("ctaRead")}
        </Link>
      </div>

      <div className="mt-16">
        <h2 className="mb-6 text-center font-heading text-2xl font-bold">
          {tt("faqTitle")}
        </h2>
        <div className="space-y-3">
          {faq.map((item) => (
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
          {tt("legalNote")}{" "}
          <Link href="/legal/tarife" className="text-gold hover:underline">
            {tt("legalTariffs")}
          </Link>
          ,{" "}
          <Link href="/legal/acord-parteneri" className="text-gold hover:underline">
            {tt("legalPartner")}
          </Link>{" "}
          &{" "}
          <Link href="/legal/acord-locatii" className="text-gold hover:underline">
            {tt("legalVenue")}
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
