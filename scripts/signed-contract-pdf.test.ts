import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import {
  LEGAL_PACK_VERSION,
  VENUE_REQUIRED_DOCS,
  getLegalDocument,
  legalBlocksFor,
  legalTitle,
} from "../src/lib/legal";
import {
  generateSignedContractPdf,
  SignedContractPdfError,
  signedContractPdfFilename,
  signedContractSessionKey,
  type SignedContractEvidence,
} from "../src/lib/legal/signed-contract-pdf";
import {
  LEGAL_PACK_MANIFEST_VARIANTS,
  legalPackManifest,
} from "../src/lib/legal/pack-manifest";

const ACCEPTED_AT = "2026-09-11T07:10:53.000Z";
const SESSION_ID = "00000000-0000-4000-8000-000000000099";

async function fixtureRows(): Promise<SignedContractEvidence[]> {
  const signature = await sharp(Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="420" height="140" viewBox="0 0 420 140">
      <rect width="420" height="140" fill="white"/>
      <path d="M18 104 C68 28 72 125 119 62 S160 117 203 66 S245 102 292 53 C320 29 342 97 402 34"
        fill="none" stroke="#111827" stroke-width="7" stroke-linecap="round"/>
    </svg>`)).png().toBuffer();
  const signatureImage = `data:image/png;base64,${signature.toString("base64")}`;
  return VENUE_REQUIRED_DOCS.map((slug, index) => {
    const document = getLegalDocument(slug);
    assert.ok(document);
    const identity = {
      partnerType: "company" as const,
      legalName: "S.R.L. «Локация Sărbătoare»",
      idNumber: "1000000000001",
      legalAddress: "mun. Chișinău, str. Independenței 10",
      representativeName: "Ирина Ștefan",
      representativeRole: "Administrator / Директор",
      email: "contract.fixture@example.invalid",
      phone: "+37360000000",
    };
    const documentBlocks = legalBlocksFor(document, "ru", identity);
    return {
      id: 9001 + index,
      userId: "00000000-0000-4000-8000-000000000001",
      organizationId: 99,
      acceptanceSessionId: SESSION_ID,
      subjectType: "venue",
      documentSlug: slug,
      documentVersion: document.version,
      packVersion: LEGAL_PACK_VERSION,
      locale: "ru",
      signatureName: identity.representativeName,
      signatureImage,
      representativeRole: identity.representativeRole,
      partnerType: identity.partnerType,
      legalName: identity.legalName,
      idNumber: identity.idNumber,
      legalAddress: identity.legalAddress,
      representativeName: identity.representativeName,
      documentTitle: legalTitle(document, "ru"),
      documentBlocks,
      deviceSummary: "Safari 17 on macOS",
      acceptedAt: ACCEPTED_AT,
      ipAddress: "192.0.2.10",
      userAgent: "QA fixture; no production device data",
      email: identity.email,
      phone: identity.phone,
      contentHash: createHash("sha256")
        .update(documentBlocks.map((block) => block.text).join("\n"))
        .digest("hex"),
    };
  });
}

test("full signed venue pack is one readable multi-page PDF with cover and certificate", async () => {
  const rows = await fixtureRows();
  const bytes = await generateSignedContractPdf([...rows].reverse());
  if (process.env.SIGNED_CONTRACT_PDF_OUTPUT) {
    await writeFile(process.env.SIGNED_CONTRACT_PDF_OUTPUT, bytes);
  }
  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString("ascii"), "%PDF-");
  const document = await PDFDocument.load(bytes);
  assert.ok(document.getPageCount() > rows.length + 1, "long legal text must paginate beyond one page per document");
  assert.match(document.getTitle() ?? "", /EP-2026-009001/);
  assert.equal(document.getCreationDate()?.toISOString(), ACCEPTED_AT);
  assert.equal(signedContractPdfFilename(rows[0]), "epetrecere-contract-sala-9001.pdf");
});

test("a PDF never mixes signing sessions or renders a modified frozen snapshot", async () => {
  const rows = await fixtureRows();
  assert.notEqual(
    signedContractSessionKey(rows[0]),
    signedContractSessionKey({
      ...rows[0],
      acceptanceSessionId: "00000000-0000-4000-8000-000000000100",
    }),
  );
  await assert.rejects(
    () => generateSignedContractPdf([
      rows[0],
      {
        ...rows[1],
        acceptanceSessionId: "00000000-0000-4000-8000-000000000100",
      },
    ]),
    (error: unknown) => error instanceof SignedContractPdfError && error.code === "incomplete_session",
  );
  await assert.rejects(
    () => generateSignedContractPdf([
      rows[0],
      { ...rows[1], organizationId: 100 },
      ...rows.slice(2),
    ]),
    (error: unknown) =>
      error instanceof SignedContractPdfError && error.code === "incomplete_session",
  );
  await assert.rejects(
    () => generateSignedContractPdf([
      rows[0],
      { ...rows[1], acceptedAt: "2026-09-10T07:10:54.000Z" },
      ...rows.slice(2),
    ]),
    (error: unknown) =>
      error instanceof SignedContractPdfError && error.code === "incomplete_session",
  );
  await assert.rejects(
    () => generateSignedContractPdf(rows.slice(0, -1)),
    (error: unknown) =>
      error instanceof SignedContractPdfError && error.code === "incomplete_session",
  );
  await assert.rejects(
    () => generateSignedContractPdf([
      { ...rows[0], documentBlocks: [{ type: "p", text: "modified" }] },
      ...rows.slice(1),
    ]),
    (error: unknown) => error instanceof SignedContractPdfError && error.code === "invalid_snapshot",
  );
});

test("historical pack 1.0 uses its own venue manifest and still renders", async () => {
  const current = await fixtureRows();
  const manifest = legalPackManifest("1.0", "venue");
  assert.ok(manifest);
  const bySlug = new Map(current.map((row) => [row.documentSlug, row]));
  const historical = manifest.map((document, index) => ({
    ...bySlug.get(document.slug)!,
    id: 9101 + index,
    acceptanceSessionId: "00000000-0000-4000-8000-000000000101",
    packVersion: "1.0",
    documentVersion: document.version,
  }));
  assert.equal(historical.length, 5);
  assert.equal(historical.some((row) => row.documentSlug === "acord-parteneri"), false);
  const pdf = await generateSignedContractPdf([...historical].reverse());
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString("ascii"), "%PDF-");
  await assert.rejects(
    () => generateSignedContractPdf([
      { ...historical[0], documentVersion: "9.9" },
      ...historical.slice(1),
    ]),
    (error: unknown) =>
      error instanceof SignedContractPdfError && error.code === "incomplete_session",
  );
});

test("an early pack 2.2 document-version combination still renders exactly", async () => {
  const current = await fixtureRows();
  const earlyManifest = LEGAL_PACK_MANIFEST_VARIANTS["2.2"].venue[0];
  const bySlug = new Map(current.map((row) => [row.documentSlug, row]));
  const historical = earlyManifest.map((document, index) => ({
    ...bySlug.get(document.slug)!,
    id: 9201 + index,
    acceptanceSessionId: "00000000-0000-4000-8000-000000000102",
    packVersion: "2.2",
    documentVersion: document.version,
  }));
  const pdf = await generateSignedContractPdf([...historical].reverse());
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString("ascii"), "%PDF-");

  const hybrid = historical.map((row) =>
    row.documentSlug === "politica-confidentialitate"
      ? { ...row, documentVersion: "1.3" }
      : row,
  );
  await assert.rejects(
    () => generateSignedContractPdf(hybrid),
    (error: unknown) =>
      error instanceof SignedContractPdfError && error.code === "incomplete_session",
  );
});
