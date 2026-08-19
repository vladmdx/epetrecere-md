/**
 * Legal Pack v1.0 — the partner/venue agreements, policies and tariffs that
 * govern the marketplace. Source of truth is the signed PDF set; the JSON here
 * is a faithful text extraction rendered as web pages so users can read (and
 * accept) them without downloading anything.
 *
 * Documents exist in RO and RU. EN falls back to RO, which is also the version
 * that legally prevails (Venue Agreement §35.4).
 */

import raw from "@/content/legal/documents.json";

export type LegalLocale = "ro" | "ru" | "en";

export interface LegalBlock {
  type: "h2" | "p";
  text: string;
}

export interface LegalDocument {
  slug: string;
  version: string;
  order: number;
  title: Record<LegalLocale, string>;
  blocks: Record<LegalLocale, LegalBlock[]>;
}

export const LEGAL_DOCUMENTS = raw as unknown as LegalDocument[];

/** Current pack version, shown next to acceptance records. */
export const LEGAL_PACK_VERSION = "1.0";

export function getLegalDocument(slug: string): LegalDocument | null {
  return LEGAL_DOCUMENTS.find((d) => d.slug === slug) ?? null;
}

export function legalBlocks(doc: LegalDocument, locale: string): LegalBlock[] {
  const l = (["ro", "ru", "en"].includes(locale) ? locale : "ro") as LegalLocale;
  return doc.blocks[l]?.length ? doc.blocks[l] : doc.blocks.ro;
}

export function legalTitle(doc: LegalDocument, locale: string): string {
  const l = (["ro", "ru", "en"].includes(locale) ? locale : "ro") as LegalLocale;
  return doc.title[l] || doc.title.ro;
}

/** The documents a vendor must accept when registering. */
export const PARTNER_REQUIRED_DOCS = [
  "acord-parteneri",
  "termeni-generali",
  "politica-confidentialitate",
  "reguli-marketplace",
  "tarife",
] as const;

export const VENUE_REQUIRED_DOCS = [
  "acord-locatii",
  "termeni-generali",
  "politica-confidentialitate",
  "reguli-marketplace",
  "tarife",
] as const;
