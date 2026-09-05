import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { generateMeta } from "@/lib/seo/generate-meta";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";
import { LEGAL_DOCUMENTS, getLegalDocument, legalTitle } from "@/lib/legal";
import { LegalDocumentView } from "./view";

export function generateStaticParams() {
  return LEGAL_DOCUMENTS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const doc = getLegalDocument(slug);
  if (!doc) {
    const missing = {
      ro: "Document legal",
      ru: "Юридический документ",
      en: "Legal document",
    }[locale];
    return generateMeta({ title: missing, path: "/legal", locale });
  }
  // The document titles are translated inside the legal pack itself; EN falls
  // back to RO there by design, because the Romanian text is the one that
  // legally prevails. Only the sentence around the title is written here.
  const title = legalTitle(doc, locale);
  const description = {
    ro: `${title} — EPETRECERE Legal Pack v${doc.version}. Textul oficial al documentului.`,
    ru: `${title} — EPETRECERE Legal Pack v${doc.version}. Официальный текст документа.`,
    en: `${title} — EPETRECERE Legal Pack v${doc.version}. The official document text.`,
  }[locale];
  return generateMeta({
    title,
    description,
    path: `/legal/${doc.slug}`,
    locale,
  });
}

export default async function LegalDocumentPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { slug } = await params;
  const canonical: Record<string, string> = {
    "termeni-generali": "/termeni",
    "politica-confidentialitate": "/confidentialitate",
    "politica-cookie": "/cookies",
  };
  if (canonical[slug]) redirect(canonical[slug]);
  const doc = getLegalDocument(slug);
  if (!doc) notFound();
  return <LegalDocumentView doc={doc} />;
}
