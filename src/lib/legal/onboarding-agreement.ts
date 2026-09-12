import { createHash } from "node:crypto";
import { LEGAL_PACK_VERSION, PARTNER_REQUIRED_DOCS, VENUE_REQUIRED_DOCS, getLegalDocument, type PartnerIdentity } from "@/lib/legal";
import { missingCurrentDocuments, type SignedDocumentEvidence } from "./acceptance";
import { signerMatchesIdentity, validatePartnerIdentity } from "./identity-validation";

export interface SavedOnboardingAgreement {
  subjectType: "artist" | "venue";
  acceptedAt: string;
  locale: "ro" | "ru" | "en";
  signatureName: string;
  representativeRole: string | null;
  identity: PartnerIdentity;
  documents: Array<{ id: number; title: string; copyUrl: string }>;
}

export interface OnboardingAgreementStatus {
  status: "unsigned" | "resumable" | "blocked";
  agreement: SavedOnboardingAgreement | null;
}

interface EvidenceRow extends SignedDocumentEvidence {
  id: number;
  subjectType: string;
  acceptedAt: Date | string;
  locale: string;
  signatureName: string;
  representativeRole: string | null;
  partnerType: string | null;
  representativeName: string | null;
  documentTitle: string | null;
  acceptanceSessionId?: string | null;
}

/** Only a complete, coherent, current signing session can resume onboarding.
 * Never combine separate signatures, parties or languages into a new pack.
 * The caller must scope rows to the authenticated account before using this.
 */
export function onboardingAgreementStatus(rows: EvidenceRow[], subjectType: "artist" | "venue"): OnboardingAgreementStatus {
  const required = subjectType === "venue" ? VENUE_REQUIRED_DOCS : PARTNER_REQUIRED_DOCS;
  const current = rows.filter(row => row.subjectType === subjectType &&
    required.some(slug => slug === row.documentSlug) && row.documentVersion === getLegalDocument(row.documentSlug)?.version);
  if (!current.length) return { status: "unsigned", agreement: null };

  const sessions = new Map<string, EvidenceRow[]>();
  for (const row of current) {
    const date = new Date(row.acceptedAt);
    if (row.packVersion !== LEGAL_PACK_VERSION || Number.isNaN(date.getTime())) continue;
    const key = row.acceptanceSessionId
      || JSON.stringify([date.toISOString(), row.locale, row.signatureName, row.signatureImage,
        row.partnerType, row.legalName, row.idNumber, row.legalAddress, row.representativeName, row.representativeRole]);
    sessions.set(key, [...(sessions.get(key) ?? []), row]);
  }
  const ordered = [...sessions.values()].sort((a, b) => new Date(b[0].acceptedAt).getTime() - new Date(a[0].acceptedAt).getTime());
  for (const session of ordered) {
    if (missingCurrentDocuments(session, subjectType).length) continue;
    const first = session[0];
    if (!first.signatureImage || first.signatureImage.length > 400_000 ||
      !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(first.signatureImage)) continue;
    if (first.locale !== "ro" && first.locale !== "ru" && first.locale !== "en") continue;
    if (first.partnerType !== "individual" && first.partnerType !== "sole_trader" && first.partnerType !== "company") continue;
    const identity: PartnerIdentity = {
      partnerType: first.partnerType,
      legalName: first.legalName ?? "",
      idNumber: first.idNumber,
      legalAddress: first.legalAddress,
      representativeName: first.representativeName,
    };
    // Current validation also applies when resuming a historical signing
    // attempt. The evidence remains immutable, but an old placeholder ID or
    // incomplete party must never become a registration bypass.
    if (!validatePartnerIdentity(identity).ok ||
      !signerMatchesIdentity(first.signatureName, identity)) continue;
    if (!session.every(row => Array.isArray(row.documentBlocks) &&
      row.documentBlocks.every(block => block && typeof block.text === "string") &&
      createHash("sha256").update(row.documentBlocks.map(block => block.text).join("\n")).digest("hex") === row.contentHash)) continue;
    return {
      status: "resumable",
      agreement: {
        subjectType, acceptedAt: new Date(first.acceptedAt).toISOString(), locale: first.locale,
        signatureName: first.signatureName, representativeRole: first.representativeRole,
        identity,
        documents: required.map(slug => {
          const row = session.find(item => item.documentSlug === slug)!;
          return { id: row.id, title: row.documentTitle ?? row.documentSlug, copyUrl: `/api/legal/accept/${row.id}/copy` };
        }),
      },
    };
  }
  // Existing current-version rows occupy immutable unique keys. Re-signing
  // cannot repair an incomplete/legacy pack; an administrator must review it.
  return { status: "blocked", agreement: null };
}
