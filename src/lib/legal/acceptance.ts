import { z } from "zod/v4";
import { LEGAL_PACK_VERSION, PARTNER_REQUIRED_DOCS, VENUE_REQUIRED_DOCS, getLegalDocument } from "@/lib/legal";
import {
  isFullPersonName,
  signerMatchesIdentity,
  validatePartnerIdentity,
} from "@/lib/legal/identity-validation";

export const acceptanceSchema = z.object({
  subjectType: z.enum(["artist", "venue"]),
  organizationId: z.number().int().positive().optional(),
  accepted: z.literal(true),
  packVersion: z.literal(LEGAL_PACK_VERSION),
  signatureName: z.string().trim().max(200).refine(isFullPersonName, {
    message: "full_name_required",
  }),
  signatureImage: z.string().max(400_000).regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/),
  representativeRole: z.string().trim().max(100).optional(),
  locale: z.enum(["ro", "ru", "en"]),
  documents: z.array(z.string()).min(1).max(10),
  identity: z.object({
    partnerType: z.enum(["individual", "sole_trader", "company"]),
    legalName: z.string().trim().max(200),
    idNumber: z.string().trim().max(40),
    legalAddress: z.string().trim().max(300),
    representativeName: z.string().trim().max(200).nullable().optional(),
  }),
}).superRefine((data, ctx) => {
  if (data.subjectType === "artist" && data.organizationId !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["organizationId"],
      message: "organization_id_is_venue_only",
    });
  }
  const required = data.subjectType === "venue" ? VENUE_REQUIRED_DOCS : PARTNER_REQUIRED_DOCS;
  if (data.documents.length !== required.length || new Set(data.documents).size !== required.length ||
      required.some(slug => !data.documents.includes(slug))) {
    ctx.addIssue({ code: "custom", path: ["documents"], message: "all_current_documents_required" });
  }
  const identityValidation = validatePartnerIdentity(data.identity);
  for (const field of Object.keys(identityValidation.fields)) {
    ctx.addIssue({
      code: "custom",
      path: ["identity", field],
      message: field === "idNumber"
        ? "moldovan_id_must_have_13_digits"
        : `${field}_invalid`,
    });
  }
  if (!signerMatchesIdentity(data.signatureName, data.identity)) {
    ctx.addIssue({ code: "custom", path: ["signatureName"], message: "signer_must_match_identity" });
  }
});

export interface SignedDocumentEvidence {
  documentSlug: string;
  documentVersion: string;
  packVersion: string;
  signatureImage: string | null;
  contentHash: string | null;
  documentBlocks: unknown;
  legalName: string | null;
  idNumber: string | null;
  legalAddress: string | null;
}

export function missingCurrentDocuments(rows: SignedDocumentEvidence[], subjectType: "artist" | "venue") {
  const required = subjectType === "venue" ? VENUE_REQUIRED_DOCS : PARTNER_REQUIRED_DOCS;
  return required.filter(slug => !rows.some(r => r.documentSlug === slug &&
    r.documentVersion === getLegalDocument(slug)?.version && r.packVersion === LEGAL_PACK_VERSION &&
    Boolean(r.signatureImage && r.contentHash && r.legalName && r.idNumber && r.legalAddress) &&
    Array.isArray(r.documentBlocks) && r.documentBlocks.length > 0));
}
