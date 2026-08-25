import type { Metadata } from "next";
import Link from "@/components/shared/locale-link";
import { generateMetaAsync } from "@/lib/seo/generate-meta";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";
import { t } from "@/i18n";

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

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 lg:px-8">
      <nav className="mb-4 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-gold">{t("nav.home", locale)}</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{t("terms.breadcrumb", locale)}</span>
      </nav>

      <h1 className="font-heading text-3xl font-bold md:text-4xl">
        {t("terms.title", locale)}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("terms.updated", locale)}</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="font-heading text-xl font-semibold text-foreground">{t("terms.s1.title", locale)}</h2>
          <p className="mt-2">{t("terms.s1.body", locale)}</p>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold text-foreground">{t("terms.s2.title", locale)}</h2>
          <p className="mt-2">{t("terms.s2.body", locale)}</p>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold text-foreground">{t("terms.s3.title", locale)}</h2>
          <p className="mt-2">{t("terms.s3.body", locale)}</p>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold text-foreground">{t("terms.s4.title", locale)}</h2>
          <p className="mt-2">{t("terms.s4.body", locale)}</p>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold text-foreground">{t("terms.s5.title", locale)}</h2>
          <p className="mt-2">{t("terms.s5.body", locale)}</p>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold text-foreground">{t("terms.s6.title", locale)}</h2>
          <p className="mt-2">{t("terms.s6.body", locale)}</p>
        </section>


        <section>
          <h2 className="font-heading text-xl font-semibold text-foreground">{t("terms.s7.title", locale)}</h2>
          <p className="mt-2">
            {t("terms.s7.body", locale)}{" "}
            {t("terms.s7.docs", locale)}{" "}
            <a href="/legal" className="text-gold underline">
              /legal
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold text-foreground">{t("terms.s8.title", locale)}</h2>
          <p className="mt-2">
            {t("terms.questions", locale)}{" "}
            <a href="mailto:legal@epetrecere.md" className="text-gold underline">
              legal@epetrecere.md
            </a>
          </p>
        </section>
      </div>
    
      <div className="mt-8 rounded-xl border border-gold/30 bg-gold/5 p-4 text-sm">
        <p className="font-semibold">{t("legal.packet.title", locale)}</p>
        <p className="mt-1 text-muted-foreground">
          {t("legal.packet.body", locale)}{" "}
          <Link href="/legal" className="text-gold hover:underline">{t("legal.docsTitle", locale)}</Link>.
        </p>
      </div>
    </div>
  );
}
