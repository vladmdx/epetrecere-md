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

/**
 * Current pack version, shown next to acceptance records.
 *
 * Bumped to 2.0 when `acord-parteneri` was replaced: the old text was a
 * 31-article agreement, the new one the 23-section "Condiții de colaborare"
 * that covers partners and venues alike. Signatures already collected attest
 * to the 1.0 text and its hash and stay valid for it — the version on the row
 * is what says which document a person actually signed.
 */
export const LEGAL_PACK_VERSION = "2.0";

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
  // Venues sign the same conditions as partners — §9 of that document is
  // written for them, and the fixed-fee table in §11.3 applies only to them.
  // `acord-locatii` stays alongside it for the venue-specific terms.
  "acord-parteneri",
  "acord-locatii",
  "termeni-generali",
  "politica-confidentialitate",
  "reguli-marketplace",
  "tarife",
] as const;

/* ────────────────────────────────────────────────────────────────────────
 * Naming the other party
 *
 * The agreement ends with "Anexa 4. Rechizitele Operatorului" — EPETRECERE's
 * own registered details. There was no counterpart for the Partner, so the
 * document a partner signed named only one of its two parties and read as
 * generic terms rather than as their contract. This appends the matching
 * annex, built from what they entered, so what is on screen when they sign is
 * the whole agreement with both sides identified.
 *
 * The fields come from §5: an individual gives identification data (§5.2), a
 * sole trader a name, an identification number, an address and a
 * representative (§5.3), a legal entity its official name, IDNO, registered
 * office and administrator (§5.4).
 * ──────────────────────────────────────────────────────────────────────── */

export type PartnerType = "individual" | "sole_trader" | "company";

export interface PartnerIdentity {
  partnerType: PartnerType;
  /** Full legal name, or the registered name of the entity. */
  legalName: string;
  /** IDNP for an individual, IDNO otherwise. */
  idNumber?: string | null;
  legalAddress?: string | null;
  representativeName?: string | null;
  representativeRole?: string | null;
  email?: string | null;
  phone?: string | null;
}

const PARTNER_ANNEX_TITLE: Record<LegalLocale, string> = {
  ro: "Anexa 5. Rechizitele Partenerului",
  ru: "Приложение 5. Реквизиты Партнёра",
  en: "Annex 5. Partner details",
};

const PARTNER_TYPE_LABEL: Record<LegalLocale, Record<PartnerType, string>> = {
  ro: {
    individual: "Persoană fizică",
    sole_trader: "Întreprinzător individual",
    company: "Persoană juridică",
  },
  ru: {
    individual: "Физическое лицо",
    sole_trader: "Индивидуальный предприниматель",
    company: "Юридическое лицо",
  },
  en: {
    individual: "Individual",
    sole_trader: "Sole trader",
    company: "Legal entity",
  },
};

const FIELD_LABEL: Record<LegalLocale, Record<string, string>> = {
  ro: {
    partnerType: "Calitatea Partenerului",
    legalName: "Denumire / Nume și prenume",
    idNumber: "IDNO / IDNP",
    legalAddress: "Sediu / Domiciliu",
    representativeName: "Reprezentant",
    representativeRole: "Funcția reprezentantului",
    email: "E-mail",
    phone: "Telefon",
  },
  ru: {
    partnerType: "Статус Партнёра",
    legalName: "Наименование / Ф.И.О.",
    idNumber: "IDNO / IDNP",
    legalAddress: "Юридический адрес / место жительства",
    representativeName: "Представитель",
    representativeRole: "Должность представителя",
    email: "Эл. почта",
    phone: "Телефон",
  },
  en: {
    partnerType: "Partner status",
    legalName: "Name / Legal name",
    idNumber: "IDNO / IDNP",
    legalAddress: "Registered office / Domicile",
    representativeName: "Representative",
    representativeRole: "Representative's role",
    email: "Email",
    phone: "Phone",
  },
};

function normLocale(locale: string): LegalLocale {
  return (["ro", "ru", "en"].includes(locale) ? locale : "ro") as LegalLocale;
}

/** The Partner annex as blocks, in the same shape as the rest of the document. */
export function partnerAnnexBlocks(
  partner: PartnerIdentity,
  locale: string,
): LegalBlock[] {
  const l = normLocale(locale);
  const label = FIELD_LABEL[l];
  const rows: Array<[string, string | null | undefined]> = [
    [label.partnerType, PARTNER_TYPE_LABEL[l][partner.partnerType]],
    [label.legalName, partner.legalName],
    [label.idNumber, partner.idNumber],
    [label.legalAddress, partner.legalAddress],
    [label.representativeName, partner.representativeName],
    [label.representativeRole, partner.representativeRole],
    [label.email, partner.email],
    [label.phone, partner.phone],
  ];
  return [
    { type: "h2", text: PARTNER_ANNEX_TITLE[l] },
    ...rows
      .filter(([, v]) => !!v && String(v).trim().length > 0)
      .map(([k, v]) => ({ type: "p" as const, text: `${k}: ${String(v).trim()}` })),
  ];
}

/**
 * The document as the partner should see it before signing: the full text,
 * followed by their own details. Falls back to the plain document when no
 * identity is supplied, so every existing caller keeps working.
 */
export function legalBlocksFor(
  doc: LegalDocument,
  locale: string,
  partner?: PartnerIdentity | null,
): LegalBlock[] {
  const base = legalBlocks(doc, locale);
  if (!partner || !partner.legalName?.trim()) return base;
  return [...base, ...partnerAnnexBlocks(partner, locale)];
}
