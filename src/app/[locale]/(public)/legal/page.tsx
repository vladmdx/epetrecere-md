import type { Metadata } from "next";
import Link from "@/components/shared/locale-link";
import { FileText } from "lucide-react";
import { generateMetaAsync } from "@/lib/seo/generate-meta";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";
import { LEGAL_DOCUMENTS, LEGAL_PACK_VERSION } from "@/lib/legal";
import { legalTitle } from "@/lib/legal";
import { t } from "@/i18n";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const meta = {
    ro: {
      title: "Documente legale",
      description:
        "Acordurile, politicile și tarifele care guvernează platforma ePetrecere.md.",
    },
    ru: {
      title: "Юридические документы",
      description:
        "Договоры, политики и тарифы, которые регулируют работу платформы ePetrecere.md.",
    },
    en: {
      title: "Legal Documents",
      description:
        "The agreements, policies and tariffs that govern the ePetrecere.md platform.",
    },
  }[locale];
  return generateMetaAsync({
    title: meta.title,
    description: meta.description,
    path: "/legal",
    locale,
  });
}

export default async function LegalIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 lg:px-8">
      <nav className="mb-4 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-gold">
          {t("nav.home", locale)}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{t("legal.indexTitle", locale)}</span>
      </nav>

      <h1 className="font-heading text-3xl font-bold md:text-4xl">
        {t("legal.indexTitle", locale)}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        EPETRECERE Legal Pack v{LEGAL_PACK_VERSION} — {t("legal.availableIn", locale)}
      </p>

      <ul className="mt-8 space-y-2">
        {LEGAL_DOCUMENTS.map((doc) => (
          <li key={doc.slug}>
            <Link
              href={`/legal/${doc.slug}`}
              className="flex items-center gap-3 rounded-xl border border-border/60 p-4 transition-colors hover:border-gold/40 hover:bg-gold/5"
            >
              <FileText className="h-5 w-5 shrink-0 text-gold" />
              <span className="flex-1 font-medium">{legalTitle(doc, locale)}</span>
              <span className="text-xs text-muted-foreground">v{doc.version}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
