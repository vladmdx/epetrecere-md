/**
 * P0 legal pack 2.2 — session uniqueness, atomic insert, reuse, recovery.
 * Guarded disposable local DB. Run: npm run test:multihall:legal-session
 *
 * Does not UPDATE/DELETE signature rows (append-only).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";

import { db } from "../src/lib/db";
import {
  legalAcceptances,
  partnerOrganizationMembers,
  partnerOrganizations,
  users,
} from "../src/lib/db/schema";
import { LEGAL_PACK_VERSION, VENUE_REQUIRED_DOCS, getLegalDocument, legalBlocks } from "../src/lib/legal";
import { recordLegalAcceptancePack } from "../src/lib/legal/record-acceptance";
import { generateSignedContractPdf } from "../src/lib/legal/signed-contract-pdf";
import { ensureDraftOrganization, saveOrganizationProfile } from "../src/lib/partner/onboarding";
import type { AppUser } from "../src/lib/venue-access";

const MARK = `legsess_${Date.now()}_`;
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const IDENTITY = {
  partnerType: "company" as const,
  legalName: "Session Palace SRL",
  idNumber: "1003600023598",
  legalAddress: "Chișinău, str. București 10",
  representativeName: "Ion Popescu",
};

const ids = { owner: "", owner2: "", org: 0, partialOrg: 0 };

function flagOn() {
  process.env.FEATURE_MULTI_HALL = "1";
}
function appUser(id: string): AppUser {
  return { id, role: "user", isGlobalAdmin: false };
}

async function signInput(userId: string, organizationId: number) {
  return {
    userId,
    subjectType: "venue" as const,
    artistId: null,
    venueId: null,
    organizationId,
    locale: "ro" as const,
    signatureName: IDENTITY.representativeName,
    signatureImage: PNG,
    identity: IDENTITY,
    ipAddress: null,
    userAgent: null,
    deviceSummary: null,
    email: `${MARK}owner@example.com`,
    phone: "+37369111111",
    slugs: VENUE_REQUIRED_DOCS,
  };
}

before(async () => {
  flagOn();
  const [owner] = await db
    .insert(users)
    .values({ clerkId: MARK + "owner", email: `${MARK}owner@example.com`, name: IDENTITY.representativeName })
    .returning({ id: users.id });
  ids.owner = owner.id;
  const [owner2] = await db
    .insert(users)
    .values({ clerkId: MARK + "owner2", email: `${MARK}owner2@example.com`, name: IDENTITY.representativeName })
    .returning({ id: users.id });
  ids.owner2 = owner2.id;

  const org = await ensureDraftOrganization(appUser(ids.owner), {
    displayName: MARK + "Org",
    type: "company",
    legalName: IDENTITY.legalName,
    idNumber: IDENTITY.idNumber,
    legalAddress: IDENTITY.legalAddress,
  });
  ids.org = org.id;
  const saved = await saveOrganizationProfile(ids.org, {
    type: "company",
    legalName: IDENTITY.legalName,
    idNumber: IDENTITY.idNumber,
    legalAddress: IDENTITY.legalAddress,
  });
  assert.equal(saved.ok, true);

  await db.insert(partnerOrganizationMembers).values({
    organizationId: ids.org,
    userId: ids.owner2,
    role: "owner",
    isActive: true,
  });
});

after(async () => {
  const orgIds = [ids.org, ids.partialOrg].filter(Boolean);
  if (orgIds.length) {
    await db.delete(partnerOrganizationMembers).where(inArray(partnerOrganizationMembers.organizationId, orgIds));
    await db.delete(partnerOrganizations).where(inArray(partnerOrganizations.id, orgIds));
  }
  await db.delete(users).where(inArray(users.id, [ids.owner, ids.owner2].filter(Boolean)));
});

test("2.1 pack with reguli-marketplace 1.0 can still sign a complete 2.2 session", async () => {
  const acceptedAt = new Date("2026-01-01T10:00:00Z");
  const oldSession = randomUUID();
  for (const slug of VENUE_REQUIRED_DOCS) {
    const doc = getLegalDocument(slug);
    assert.ok(doc);
    await db.insert(legalAcceptances).values({
      userId: ids.owner,
      subjectType: "venue",
      organizationId: ids.org,
      documentSlug: slug,
      documentVersion: slug === "reguli-marketplace" ? "1.0" : "2.1",
      packVersion: "2.1",
      locale: "ro",
      signatureName: IDENTITY.representativeName,
      signatureImage: PNG,
      partnerType: IDENTITY.partnerType,
      legalName: IDENTITY.legalName,
      idNumber: IDENTITY.idNumber,
      legalAddress: IDENTITY.legalAddress,
      representativeName: IDENTITY.representativeName,
      documentTitle: doc.title.ro,
      documentBlocks: legalBlocks(doc, "ro"),
      contentHash: "legacy-21",
      acceptedAt,
      acceptanceSessionId: oldSession,
    });
  }

  const result = await recordLegalAcceptancePack(await signInput(ids.owner, ids.org));
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error("sign 2.2");
  assert.equal(result.reused, false);
  assert.equal(result.rows.length, VENUE_REQUIRED_DOCS.length);
  assert.deepEqual(
    result.recorded.map((row) => row.slug).sort(),
    [...VENUE_REQUIRED_DOCS].sort(),
  );
  assert.ok(result.rows.every((row) => row.packVersion === LEGAL_PACK_VERSION));
  assert.equal(getLegalDocument("reguli-marketplace")?.version, "1.1");
});

test("concurrent retries reuse one complete session and do not split the pack", async () => {
  const input = await signInput(ids.owner, ids.org);
  const [a, b] = await Promise.all([
    recordLegalAcceptancePack(input),
    recordLegalAcceptancePack(input),
  ]);
  assert.equal(a.ok, true, JSON.stringify(a));
  assert.equal(b.ok, true, JSON.stringify(b));
  if (!a.ok || !b.ok) throw new Error("concurrent");
  assert.equal(a.sessionId, b.sessionId);
  const current = await db
    .select({ id: legalAcceptances.id, session: legalAcceptances.acceptanceSessionId })
    .from(legalAcceptances)
    .where(eq(legalAcceptances.organizationId, ids.org));
  const pack22 = current.filter((row) => row.session === a.sessionId);
  assert.equal(pack22.length, VENUE_REQUIRED_DOCS.length);
});

test("simulated partial 2.2 session is refused (append-only recovery)", async () => {
  const [partial] = await db
    .insert(partnerOrganizations)
    .values({
      displayName: MARK + "Partial",
      type: "company",
      status: "draft",
      legalName: IDENTITY.legalName,
      idNumber: IDENTITY.idNumber,
      legalAddress: IDENTITY.legalAddress,
    })
    .returning({ id: partnerOrganizations.id });
  ids.partialOrg = partial.id;
  await db.insert(partnerOrganizationMembers).values({
    organizationId: ids.partialOrg,
    userId: ids.owner,
    role: "owner",
    isActive: true,
  });
  const sessionId = randomUUID();
  const slug = VENUE_REQUIRED_DOCS[0];
  const doc = getLegalDocument(slug);
  assert.ok(doc);
  await db.insert(legalAcceptances).values({
    userId: ids.owner,
    subjectType: "venue",
    organizationId: ids.partialOrg,
    documentSlug: slug,
    documentVersion: doc.version,
    packVersion: LEGAL_PACK_VERSION,
    locale: "ro",
    signatureName: IDENTITY.representativeName,
    signatureImage: PNG,
    partnerType: IDENTITY.partnerType,
    legalName: IDENTITY.legalName,
    idNumber: IDENTITY.idNumber,
    legalAddress: IDENTITY.legalAddress,
    representativeName: IDENTITY.representativeName,
    documentTitle: doc.title.ro,
    documentBlocks: legalBlocks(doc, "ro"),
    contentHash: "partial",
    acceptedAt: new Date(),
    acceptanceSessionId: sessionId,
  });
  const result = await recordLegalAcceptancePack(await signInput(ids.owner, ids.partialOrg));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "PACK_SESSION_INCOMPLETE");
});

test("second organization owner reuses the complete session; PDF has every document", async () => {
  const result = await recordLegalAcceptancePack(await signInput(ids.owner2, ids.org));
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error("owner2");
  assert.equal(result.reused, true);
  assert.equal(result.rows.length, VENUE_REQUIRED_DOCS.length);
  const pdf = await generateSignedContractPdf(result.rows);
  assert.ok(pdf.byteLength > 1000);
  assert.deepEqual(
    result.recorded.map((row) => row.slug).sort(),
    [...VENUE_REQUIRED_DOCS].sort(),
  );
});

test("artist + organizationId is rejected", async () => {
  const result = await recordLegalAcceptancePack({
    ...(await signInput(ids.owner, ids.org)),
    subjectType: "artist",
    slugs: ["acord-parteneri", "termeni-generali", "politica-confidentialitate", "reguli-marketplace", "tarife"],
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "ORGANIZATION_SUBJECT_REQUIRED");
});
