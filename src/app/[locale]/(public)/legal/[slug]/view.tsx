"use client";

import Link from "@/components/shared/locale-link";
import { useLocale } from "@/hooks/use-locale";
import { legalBlocks, legalTitle, type LegalDocument } from "@/lib/legal";

/**
 * Renders the published language, or explicitly identifies the Romanian
 * fallback. Legal text is never passed through the legacy UI translator.
 */
export function LegalDocumentView({ doc }: { doc: LegalDocument }) {
  const { locale, t } = useLocale();
  const blocks = legalBlocks(doc, locale);
  const title = legalTitle(doc, locale);
  const isTranslation = locale !== "ro" && Boolean(doc.blocks[locale]?.length);
  const isRomanianFallback = locale !== "ro" && !isTranslation;
  const prevailingNote = {
    ro: "",
    ru: " · перевод; преобладает румынский текст",
    en: " · translation; the Romanian text prevails",
  }[locale];

  return (
    <div data-no-auto-translate translate="no" className="mx-auto max-w-3xl px-4 py-12 lg:px-8">
      <nav className="mb-4 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-gold">
          {t("nav.home")}
        </Link>
        <span className="mx-2">/</span>
        <Link href="/legal" className="hover:text-gold">
          Legal
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{title}</span>
      </nav>

      <h1 className="font-heading text-3xl font-bold md:text-4xl">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        EPETRECERE Legal Pack v{doc.version}
        {isTranslation && prevailingNote}
      </p>
      {isRomanianFallback && <p className="mt-2 text-sm text-muted-foreground">
        {locale === "ru"
          ? "Этот документ опубликован на румынском языке. Перевод пока недоступен. Ниже показан опубликованный текст без автоматического перевода."
          : "This document is published in Romanian. A translation is not yet available. The published text is shown below without automatic translation."}
      </p>}

      <article lang={isRomanianFallback ? "ro" : locale} className="mt-8 space-y-4">
        {blocks.map((b, i) =>
          b.type === "h2" ? (
            <h2
              key={i}
              className="pt-4 font-heading text-lg font-bold text-foreground"
            >
              {b.text}
            </h2>
          ) : (
            <p key={i} className="text-sm leading-relaxed text-muted-foreground">
              {b.text}
            </p>
          ),
        )}
      </article>

      <div className="mt-10 border-t border-border/60 pt-6 text-xs text-muted-foreground">
        <Link href="/legal" className="hover:text-gold">
          {locale === "ru" ? "← Все юридические документы" : locale === "en" ? "← All legal documents" : "← Toate documentele legale"}
        </Link>
      </div>
    </div>
  );
}
