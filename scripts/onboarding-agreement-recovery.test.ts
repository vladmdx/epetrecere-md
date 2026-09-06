import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  LEGAL_PACK_VERSION,
  PARTNER_REQUIRED_DOCS,
  VENUE_REQUIRED_DOCS,
  getLegalDocument,
  legalBlocksFor,
  legalTitle,
  type LegalLocale,
  type PartnerIdentity,
} from "../src/lib/legal";
import { onboardingAgreementStatus } from "../src/lib/legal/onboarding-agreement";

type SubjectType = "artist" | "venue";
type EvidenceRow = Parameters<typeof onboardingAgreementStatus>[0][number];

const ACCEPTED_AT = "2026-09-05T09:30:00.000Z";
const SIGNATURE_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4J8AAAAASUVORK5CYII=";
const INDIVIDUAL: PartnerIdentity = {
  partnerType: "individual",
  legalName: "Ana  Ștefan",
  idNumber: "0001234567890",
  legalAddress: "str. Independenței 12, ap. 3, Bălți",
  representativeName: null,
};
const COMPANY: PartnerIdentity = {
  partnerType: "company",
  legalName: "SRL «Sala  de Festivități»",
  idNumber: "0009876543210",
  legalAddress: "str. Ștefan cel Mare 4, et. 2, Orhei",
  representativeName: "Ирина  Петрова",
};

function requiredDocuments(subjectType: SubjectType) {
  return subjectType === "venue" ? VENUE_REQUIRED_DOCS : PARTNER_REQUIRED_DOCS;
}

function signedRows(subjectType: SubjectType, options: {
  locale?: LegalLocale;
  identity?: PartnerIdentity;
  signatureName?: string;
  representativeRole?: string | null;
  acceptedAt?: string;
  firstId?: number;
} = {}): EvidenceRow[] {
  const locale = options.locale ?? "ro";
  const identity = options.identity ?? (subjectType === "venue" ? COMPANY : INDIVIDUAL);
  const representativeRole = options.representativeRole ?? (identity.partnerType === "individual" ? null : "Administrator / Директор");
  const signatureName = options.signatureName ?? (identity.partnerType === "individual" ? identity.legalName : identity.representativeName!);
  return requiredDocuments(subjectType).map((slug, index) => {
    const doc = getLegalDocument(slug);
    assert.ok(doc, `required document ${slug} must exist`);
    const documentBlocks = legalBlocksFor(doc, locale, { ...identity, representativeRole }).map(block => ({ ...block }));
    return {
      id: (options.firstId ?? 701) + index,
      subjectType,
      documentSlug: slug,
      documentVersion: doc.version,
      packVersion: LEGAL_PACK_VERSION,
      acceptedAt: options.acceptedAt ?? ACCEPTED_AT,
      locale,
      signatureName,
      signatureImage: SIGNATURE_IMAGE,
      representativeRole,
      partnerType: identity.partnerType,
      legalName: identity.legalName,
      idNumber: identity.idNumber ?? null,
      legalAddress: identity.legalAddress ?? null,
      representativeName: identity.representativeName ?? null,
      documentTitle: legalTitle(doc, locale),
      documentBlocks,
      contentHash: createHash("sha256").update(documentBlocks.map(block => block.text).join("\n")).digest("hex"),
    };
  });
}

function assertBlocked(rows: EvidenceRow[], subjectType: SubjectType) {
  assert.deepEqual(onboardingAgreementStatus(rows, subjectType), { status: "blocked", agreement: null });
}

for (const subjectType of ["artist", "venue"] as const) {
  for (const locale of ["ro", "ru", "en"] as const) {
    test(`complete current ${subjectType} agreement resumes with frozen ${locale} identity and copy references`, () => {
      const rows = signedRows(subjectType, { locale });
      // A historical title must come from its signed row, not today's document lookup.
      rows[0].documentTitle += " — signed snapshot";
      const before = structuredClone(rows);
      const result = onboardingAgreementStatus([...rows].reverse(), subjectType);
      const identity = subjectType === "venue" ? COMPANY : INDIVIDUAL;
      assert.deepEqual(result, {
        status: "resumable",
        agreement: {
          subjectType,
          acceptedAt: ACCEPTED_AT,
          locale,
          signatureName: rows[0].signatureName,
          representativeRole: rows[0].representativeRole,
          identity,
          documents: rows.map(row => ({ id: row.id, title: row.documentTitle, copyUrl: `/api/legal/accept/${row.id}/copy` })),
        },
      });
      assert.deepEqual(rows, before, "recovery must not rewrite frozen evidence or its block snapshots");
    });
  }

  test(`${subjectType} without its own evidence is unsigned`, () => {
    assert.deepEqual(onboardingAgreementStatus([], subjectType), { status: "unsigned", agreement: null });
    const otherSubject = subjectType === "artist" ? "venue" : "artist";
    assert.deepEqual(onboardingAgreementStatus(signedRows(otherSubject), subjectType), { status: "unsigned", agreement: null });
  });

  test(`every current ${subjectType} document is required for recovery`, () => {
    const rows = signedRows(subjectType);
    for (let index = 0; index < rows.length; index += 1) {
      assertBlocked(rows.filter((_, rowIndex) => rowIndex !== index), subjectType);
    }
  });

  test(`duplicate ${subjectType} evidence cannot replace a missing required document`, () => {
    const rows = signedRows(subjectType);
    rows[0] = { ...rows[1], id: rows[0].id };
    assertBlocked(rows, subjectType);
  });

  const mixedFields: Array<[string, Partial<EvidenceRow>]> = [
    ["timestamp", { acceptedAt: "2026-09-05T09:30:00.001Z" }],
    ["locale", { locale: "en" }],
    ["legal name", { legalName: "Altă Persoană" }],
    ["identifier", { idNumber: "1111234567890" }],
    ["address", { legalAddress: "str. Florilor 99, Chișinău" }],
    ["party type", { partnerType: "sole_trader" }],
    ["representative", { representativeName: "Alt Reprezentant" }],
    ["representative role", { representativeRole: "Mandatar" }],
    ["typed signature", { signatureName: "Alt Semnatar" }],
    ["drawn signature", { signatureImage: SIGNATURE_IMAGE.replace("P8/x8", "P8/y8") }],
  ];
  for (const [name, change] of mixedFields) {
    test(`${subjectType} recovery cannot combine rows with mixed ${name}`, () => {
      const rows = signedRows(subjectType);
      rows[0] = { ...rows[0], ...change };
      assertBlocked(rows, subjectType);
    });
  }

  test(`${subjectType} recovery cannot borrow a shared document from the other subject`, () => {
    const rows = signedRows(subjectType);
    rows[0].subjectType = subjectType === "artist" ? "venue" : "artist";
    assertBlocked(rows, subjectType);
  });

  test(`${subjectType} partial sessions stay blocked even when their combined slugs cover the pack`, () => {
    const earlier = signedRows(subjectType);
    const later = signedRows(subjectType, { acceptedAt: "2026-09-06T09:30:00.000Z", firstId: 901 });
    assertBlocked([...earlier.slice(0, 2), ...later.slice(2)], subjectType);
  });

  test(`${subjectType} corrupt document content or hashes cannot resume`, () => {
    for (const corruptAll of [false, true]) {
      const badHash = signedRows(subjectType).map((row, index) => ({ ...row, contentHash: corruptAll || index === 0 ? "0".repeat(64) : row.contentHash }));
      assertBlocked(badHash, subjectType);
    }
    const changedContent = signedRows(subjectType);
    assert.ok(Array.isArray(changedContent[0].documentBlocks));
    changedContent[0].documentBlocks[0].text += " Altered after signing.";
    assertBlocked(changedContent, subjectType);
  });

  for (const [name, change] of [
    ["missing signature", { signatureImage: null }],
    ["malformed signature", { signatureImage: "not-a-png" }],
    ["missing hash", { contentHash: null }],
    ["missing identity", { idNumber: null }],
    ["empty blocks", { documentBlocks: [] }],
    ["missing blocks", { documentBlocks: null }],
    ["malformed block", { documentBlocks: [null] }],
    ["non-text block", { documentBlocks: [{ type: "p", text: 42 }] }],
    ["invalid timestamp", { acceptedAt: "not-a-date" }],
    ["unsupported locale", { locale: "fr" }],
    ["unknown partner type", { partnerType: "unknown" }],
    ["wrong signer", { signatureName: "Unrelated Signer" }],
  ] satisfies Array<[string, Partial<EvidenceRow>]>) {
    test(`${subjectType} coherent rows with ${name} remain blocked`, () => {
      assertBlocked(signedRows(subjectType).map(row => ({ ...row, ...change })), subjectType);
    });
  }

  test(`old ${subjectType} document versions are not reused as current acceptance`, () => {
    const oldRows = signedRows(subjectType).map(row => ({ ...row, documentVersion: "historical-version" }));
    assert.deepEqual(onboardingAgreementStatus(oldRows, subjectType), { status: "unsigned", agreement: null });
    const currentRows = signedRows(subjectType);
    assertBlocked([...currentRows.slice(1), oldRows[0]], subjectType);
  });

  test(`current ${subjectType} documents signed under an old pack cannot be reused`, () => {
    assertBlocked(signedRows(subjectType).map(row => ({ ...row, packVersion: "historical-pack" })), subjectType);
  });

  test(`${subjectType} recovery selects its newest complete coherent session`, () => {
    const older = signedRows(subjectType);
    const newest = signedRows(subjectType, { acceptedAt: "2026-09-06T09:30:00.000Z", firstId: 901, locale: "ru" });
    const result = onboardingAgreementStatus([...older, ...newest].reverse(), subjectType);
    assert.equal(result.status, "resumable");
    assert.equal(result.agreement?.acceptedAt, "2026-09-06T09:30:00.000Z");
    assert.equal(result.agreement?.locale, "ru");
    assert.deepEqual(result.agreement?.documents.map(document => document.id), newest.map(row => row.id));
  });
}

test("timestamp representations of the same instant remain one signing session", () => {
  const rows = signedRows("artist");
  rows[0].acceptedAt = new Date(ACCEPTED_AT);
  rows[1].acceptedAt = "2026-09-05T12:30:00.000+03:00";
  assert.equal(onboardingAgreementStatus(rows, "artist").status, "resumable");
});

test("normalized signer comparison does not rewrite the exact signed name", () => {
  const rows = signedRows("artist", { signatureName: "ANA ȘTEFAN" });
  const result = onboardingAgreementStatus(rows, "artist");
  assert.equal(result.status, "resumable");
  assert.equal(result.agreement?.signatureName, "ANA ȘTEFAN");
  assert.equal(result.agreement?.identity.legalName, "Ana  Ștefan");
});

test("sole-trader recovery uses the representative as signer and preserves party details", () => {
  const identity: PartnerIdentity = { ...COMPANY, partnerType: "sole_trader", legalName: "ÎI «Irina Petrov»" };
  const rows = signedRows("artist", { identity });
  const result = onboardingAgreementStatus(rows, "artist");
  assert.equal(result.status, "resumable");
  assert.deepEqual(result.agreement?.identity, identity);
  assert.equal(result.agreement?.signatureName, identity.representativeName);
  assertBlocked(rows.map(row => ({ ...row, signatureName: identity.legalName })), "artist");
});

test("artist and venue packs from the same account remain independent", () => {
  const artist = signedRows("artist", { firstId: 1001, locale: "en" });
  const venue = signedRows("venue", { firstId: 2001, locale: "ru" });
  const together = [...venue, ...artist].reverse();
  assert.deepEqual(onboardingAgreementStatus(together, "artist"), onboardingAgreementStatus(artist, "artist"));
  assert.deepEqual(onboardingAgreementStatus(together, "venue"), onboardingAgreementStatus(venue, "venue"));
  assertBlocked([...artist.slice(1), ...venue], "artist");
  assertBlocked([...artist, ...venue.slice(1)], "venue");
});
