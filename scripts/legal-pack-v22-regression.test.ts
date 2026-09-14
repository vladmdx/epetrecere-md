import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  LEGAL_PACK_VERSION,
  PARTNER_REQUIRED_DOCS,
  VENUE_REQUIRED_DOCS,
  REQUIRED_DOCUMENT_VERSIONS_THIS_PACK,
  getLegalDocument,
  legalBlocks,
} from "../src/lib/legal";
import { acceptanceSchema } from "../src/lib/legal/acceptance";
import {
  LEGAL_PACK_MANIFESTS,
  LEGAL_PACK_MANIFEST_VARIANTS,
  legalEvidenceMatchesManifest,
} from "../src/lib/legal/pack-manifest";

function text(slug: string, locale: "ro" | "ru" | "en" = "ro") {
  const document = getLegalDocument(slug);
  assert.ok(document, `missing ${slug}`);
  return legalBlocks(document, locale).map((block) => block.text).join("\n");
}

test("legal pack 2.2 separates pack and document versions", () => {
  assert.equal(LEGAL_PACK_VERSION, "2.2");
  assert.equal(getLegalDocument("acord-parteneri")?.version, "2.2");
  assert.equal(getLegalDocument("acord-locatii")?.version, "2.2");
  assert.equal(getLegalDocument("termeni-generali")?.version, "2.2");
  assert.equal(getLegalDocument("politica-confidentialitate")?.version, "1.3");
  assert.equal(getLegalDocument("politica-cookie")?.version, "1.2");
  assert.equal(getLegalDocument("tarife")?.version, "2.2");
  assert.equal(getLegalDocument("index-legal")?.version, "2.2");
  assert.equal(getLegalDocument("reguli-marketplace")?.version, "1.1");
  for (const [slug, version] of Object.entries(REQUIRED_DOCUMENT_VERSIONS_THIS_PACK)) {
    assert.equal(getLegalDocument(slug)?.version, version, slug);
  }

  const source = readFileSync("src/content/legal/documents.json", "utf8");
  assert.doesNotMatch(source, /Legal Pack v(?:1\.0|2\.0|2\.1)/);
});

test("pack manifests preserve historical subject topology and exact versions", () => {
  assert.deepEqual(
    LEGAL_PACK_MANIFESTS[LEGAL_PACK_VERSION].artist.map((document) => document.slug),
    PARTNER_REQUIRED_DOCS,
  );
  assert.deepEqual(
    LEGAL_PACK_MANIFESTS[LEGAL_PACK_VERSION].venue.map((document) => document.slug),
    VENUE_REQUIRED_DOCS,
  );
  assert.equal(LEGAL_PACK_MANIFESTS["1.0"].venue.length, 5);
  assert.equal(
    LEGAL_PACK_MANIFESTS["1.0"].venue.map((document) => String(document.slug))
      .includes("acord-parteneri"),
    false,
  );
  assert.equal(LEGAL_PACK_MANIFESTS["2.0"].venue.length, 6);
  assert.equal(
    LEGAL_PACK_MANIFESTS["2.1"].artist.find(
      (document) => document.slug === "politica-confidentialitate",
    )?.version,
    "1.1",
  );
  assert.equal(
    legalEvidenceMatchesManifest(
      "2.1",
      "artist",
      LEGAL_PACK_MANIFESTS["2.1"].artist.map((document) => ({
        documentSlug: document.slug,
        documentVersion: document.version,
      })),
    ),
    true,
  );
  for (const packVersion of ["2.1", "2.2"] as const) {
    assert.equal(LEGAL_PACK_MANIFEST_VARIANTS[packVersion].venue.length, 2);
    for (const manifest of LEGAL_PACK_MANIFEST_VARIANTS[packVersion].venue) {
      assert.equal(
        legalEvidenceMatchesManifest(
          packVersion,
          "venue",
          manifest.map((document) => ({
            documentSlug: document.slug,
            documentVersion: document.version,
          })),
        ),
        true,
      );
    }
  }
  assert.equal(
    LEGAL_PACK_MANIFEST_VARIANTS["2.1"].artist[0].find(
      (document) => document.slug === "politica-confidentialitate",
    )?.version,
    "1.0",
  );
  assert.deepEqual(
    LEGAL_PACK_MANIFEST_VARIANTS["2.2"].artist[0]
      .filter((document) => [
        "termeni-generali",
        "politica-confidentialitate",
        "reguli-marketplace",
      ].includes(document.slug))
      .map((document) => document.version),
    ["2.0", "1.2", "1.0"],
  );
  assert.equal(
    legalEvidenceMatchesManifest("2.1", "artist", [
      {
        documentSlug: LEGAL_PACK_MANIFESTS["2.1"].artist[0].slug,
        documentVersion: "9.9",
      },
      ...LEGAL_PACK_MANIFESTS["2.1"].artist.slice(1).map((document) => ({
        documentSlug: document.slug,
        documentVersion: document.version,
      })),
    ]),
    false,
  );
  assert.equal(legalEvidenceMatchesManifest("9.9", "artist", []), false);

  for (const path of [
    "src/components/vendor/signed-documents-card.tsx",
    "src/components/vendor/organization-dashboard.tsx",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /legalEvidenceMatchesManifest/);
    assert.doesNotMatch(source, /packVersion\s*!==\s*["']1\.0["']\s*\?\s*6\s*:\s*5/);
  }
});

test("artist acceptance rejects an organization scope before route authorization", () => {
  const parsed = acceptanceSchema.safeParse({
    subjectType: "artist",
    organizationId: 1,
    accepted: true,
    packVersion: LEGAL_PACK_VERSION,
    signatureName: "Ana Popescu",
    signatureImage:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    locale: "ro",
    documents: PARTNER_REQUIRED_DOCS,
    identity: {
      partnerType: "individual",
      legalName: "Ana Popescu",
      idNumber: "2000000000001",
      legalAddress: "Chișinău, str. Test 1",
      representativeName: null,
    },
  });
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.ok(parsed.error.issues.some((issue) =>
      issue.path.join(".") === "organizationId" &&
      issue.message === "organization_id_is_venue_only"));
  }
});

test("general terms define booking, cancellation, complaints and explicit reacceptance", () => {
  const terms = text("termeni-generali");
  assert.match(terms, /statutul «Confirmată»/);
  assert.match(terms, /avans, arvună/);
  assert.match(terms, /support@epetrecere\.md/);
  assert.match(terms, /Simpla continuare/);
  assert.match(terms, /revizuire de către o persoană autorizată/);
  assert.match(terms, /drepturile imperative ale consumatorului/i);
});

test("venue precedence, transition date and fee rules are deterministic", () => {
  const venue = text("acord-locatii");
  const fees = text("tarife");
  assert.match(venue, /Până la 22 august 2026/);
  assert.doesNotMatch(venue, /Până la 23 august 2026/);
  assert.match(venue, /prevalează față de Condițiile de colaborare/);
  assert.match(fees, /cursul oficial EUR\/MDL publicat de Banca Națională a Moldovei/);
  assert.match(fees, /a\) Furnizorul sau Locația anulează/);
  assert.match(fees, /f\) Caz contestat/);
  assert.match(fees, /Simpla continuare a utilizării nu constituie acceptare/);
});

test("privacy notice reflects production and covers indirect data and human review", () => {
  const privacy = text("politica-confidentialitate");
  assert.match(privacy, /Supabase este configurată în regiunea eu-central-1/);
  assert.match(privacy, /nu depășește o lună/);
  assert.match(privacy, /Date obligatorii/);
  assert.match(privacy, /scoruri de risc și jurnale de moderare/);
  assert.match(privacy, /intervenție umană/);
  assert.match(privacy, /centru@datepersonale\.md/);
  assert.match(privacy, /fotografiei unui minor/);
  assert.match(privacy, /R2, Upstash, Sentry și WhatsApp nu sunt prezentate ca procesatori activi/);
});

test("canonical policy pages render the same versioned source used for signatures", () => {
  for (const path of [
    "src/app/[locale]/(public)/termeni/page.tsx",
    "src/app/[locale]/(public)/confidentialitate/page.tsx",
    "src/app/[locale]/(public)/cookies/page.tsx",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /getLegalDocument\(SLUG\)/);
    assert.match(source, /LegalDocumentView/);
    assert.doesNotMatch(source, /const copy\s*=/);
  }
});

test("artist portfolio is not mislabeled as verified customer content", () => {
  const source = readFileSync(
    "src/app/[locale]/(public)/artisti/[slug]/client.tsx",
    "utf8",
  );
  assert.match(source, /source: "portfolio" as const/);
  assert.match(source, /source: "ugc" as const/);
  assert.match(source, /moment\.source === "ugc"/);
  assert.match(source, /pkg\.price !== 0/);
  assert.match(source, /formatDuration\(pkg\.durationMinutes\)/);
  assert.doesNotMatch(source, /\.\.\.\(profilePhotoUrl \? \[profilePhotoUrl\]/);

  const ro = readFileSync("src/i18n/ro.json", "utf8");
  assert.match(ro, /"portfolioBadge": "Portofoliu"/);
  assert.match(ro, /"radius50Sub": "Zona extinsă"/);
  assert.doesNotMatch(ro, /Județul extins/);
});
