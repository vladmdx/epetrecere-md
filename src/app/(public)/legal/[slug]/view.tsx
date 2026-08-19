"use client";

import Link from "@/components/shared/locale-link";
import { useLocale } from "@/hooks/use-locale";
import { legalBlocks, legalTitle, type LegalDocument } from "@/lib/legal";

/**
 * Renders a legal document in the reader's language. The documents ship in RO
 * and RU; EN readers get RO, which is also the version that prevails in case
 * of divergence (Venue Agreement §35.4) — stated on the page so it isn't a
 * surprise.
 */
export function LegalDocumentView({ doc }: { doc: LegalDocument }) {
  const { locale } = useLocale();
  const blocks = legalBlocks(doc, locale);
  const title = legalTitle(doc, locale);
  const showsRoFallback = locale === "en";

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 lg:px-8">
      <nav className="mb-4 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-gold">
          Acasă
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
        {showsRoFallback && " · shown in Romanian (the prevailing version)"}
      </p>

      <article className="mt-8 space-y-4">
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
          ← Toate documentele legale
        </Link>
      </div>
    </div>
  );
}
