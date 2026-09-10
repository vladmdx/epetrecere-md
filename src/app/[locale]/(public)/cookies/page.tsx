import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalDocumentView } from "../legal/[slug]/view";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";
import { generateMeta } from "@/lib/seo/generate-meta";
import {
  LEGAL_PACK_VERSION,
  getLegalDocument,
  legalTitle,
} from "@/lib/legal";

const SLUG = "politica-cookie";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const doc = getLegalDocument(SLUG);
  const title = doc ? legalTitle(doc, locale) : "Politica Cookies";
  const description = {
    ro: `${title} — pachet juridic EPETRECERE v${LEGAL_PACK_VERSION}.`,
    ru: `${title} — юридический пакет EPETRECERE v${LEGAL_PACK_VERSION}.`,
    en: `${title} — EPETRECERE Legal Pack v${LEGAL_PACK_VERSION}.`,
  }[locale];
  return generateMeta({ title, description, path: "/cookies", locale });
}

export default function CookiesPage() {
  const doc = getLegalDocument(SLUG);
  if (!doc) notFound();
  return <LegalDocumentView doc={doc} />;
}
