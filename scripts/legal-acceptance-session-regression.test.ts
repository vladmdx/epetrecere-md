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
  legalContractDeliveryOutbox,
  partnerOrganizationMembers,
  partnerOrganizations,
  users,
} from "../src/lib/db/schema";
import {
  LEGAL_PACK_VERSION,
  PARTNER_REQUIRED_DOCS,
  VENUE_REQUIRED_DOCS,
  getLegalDocument,
  legalBlocks,
} from "../src/lib/legal";
import { recordLegalAcceptancePack } from "../src/lib/legal/record-acceptance";
import { generateSignedContractPdf } from "../src/lib/legal/signed-contract-pdf";
import { canViewLegalAcceptance } from "../src/lib/legal/acceptance-access";
import { processLegalContractDelivery } from "../src/lib/legal/contract-delivery";
import {
  ensureDraftOrganization,
  OrganizationDraftUpdateError,
  saveOrganizationProfile,
} from "../src/lib/partner/onboarding";
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

const ids = {
  owner: "",
  owner2: "",
  outsider: "",
  raceOwner: "",
  concurrentOwner: "",
  org: 0,
  partialOrg: 0,
  raceOrg: 0,
  concurrentOrg: 0,
  outsiderOrg: 0,
};

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
  const [outsider] = await db
    .insert(users)
    .values({ clerkId: MARK + "outsider", email: `${MARK}outsider@example.com`, name: "Ana Externă" })
    .returning({ id: users.id });
  ids.outsider = outsider.id;
  const [raceOwner] = await db
    .insert(users)
    .values({ clerkId: MARK + "race", email: `${MARK}race@example.com`, name: IDENTITY.representativeName })
    .returning({ id: users.id });
  ids.raceOwner = raceOwner.id;
  const [concurrentOwner] = await db
    .insert(users)
    .values({ clerkId: MARK + "concurrent", email: `${MARK}concurrent@example.com`, name: IDENTITY.representativeName })
    .returning({ id: users.id });
  ids.concurrentOwner = concurrentOwner.id;

  const outsiderOrg = await ensureDraftOrganization(appUser(ids.outsider), {
    displayName: MARK + "Unrelated Org",
    type: "company",
    legalName: "Unrelated Company SRL",
    idNumber: "1003600023597",
    legalAddress: "Chișinău, str. Independentă 11",
  });
  ids.outsiderOrg = outsiderOrg.id;

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

  for (const [ownerId, suffix] of [
    [ids.raceOwner, "Race"],
    [ids.concurrentOwner, "Concurrent"],
  ] as const) {
    const [organization] = await db
      .insert(partnerOrganizations)
      .values({
        displayName: `${MARK}${suffix}`,
        type: IDENTITY.partnerType,
        status: "draft",
        legalName: IDENTITY.legalName,
        idNumber: IDENTITY.idNumber,
        legalAddress: IDENTITY.legalAddress,
      })
      .returning({ id: partnerOrganizations.id });
    await db.insert(partnerOrganizationMembers).values({
      organizationId: organization.id,
      userId: ownerId,
      role: "owner",
      isActive: true,
    });
    if (suffix === "Race") ids.raceOrg = organization.id;
    else ids.concurrentOrg = organization.id;
  }
});

after(async () => {
  // Signatures are append-only and keep organization_id. Do not delete orgs
  // or users that still appear on evidence rows.
  const orgIds = [ids.org, ids.partialOrg, ids.raceOrg, ids.concurrentOrg, ids.outsiderOrg].filter(Boolean);
  if (orgIds.length) {
    await db.delete(partnerOrganizationMembers).where(inArray(partnerOrganizationMembers.organizationId, orgIds));
  }
  if (ids.outsiderOrg) {
    await db.delete(partnerOrganizations).where(eq(partnerOrganizations.id, ids.outsiderOrg));
  }
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

test("organization create/update path cannot mutate signed legal identity", async () => {
  await assert.rejects(
    () => ensureDraftOrganization(appUser(ids.owner), {
      displayName: MARK + "Org",
      type: IDENTITY.partnerType,
      legalName: IDENTITY.legalName,
      idNumber: IDENTITY.idNumber,
      legalAddress: "Chișinău, str. Mutată 99",
    }),
    (error: unknown) =>
      error instanceof OrganizationDraftUpdateError &&
      error.code === "LEGAL_HOLDER_CHANGE_REQUIRES_NEW_ORGANIZATION" &&
      error.status === 409,
  );
  const [organization] = await db
    .select({ legalAddress: partnerOrganizations.legalAddress })
    .from(partnerOrganizations)
    .where(eq(partnerOrganizations.id, ids.org));
  assert.equal(organization.legalAddress, IDENTITY.legalAddress);
});

test("signing and organization POST-style update share one legal-scope lock", async () => {
  const signing = recordLegalAcceptancePack(await signInput(ids.raceOwner, ids.raceOrg));
  const editing = ensureDraftOrganization(appUser(ids.raceOwner), {
    displayName: MARK + "Race",
    type: IDENTITY.partnerType,
    legalName: IDENTITY.legalName,
    idNumber: IDENTITY.idNumber,
    legalAddress: "Chișinău, str. Cursa 77",
  }).then(
    () => ({ ok: true as const }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  const [signed, edited] = await Promise.all([signing, editing]);
  const [organization] = await db
    .select({ legalAddress: partnerOrganizations.legalAddress })
    .from(partnerOrganizations)
    .where(eq(partnerOrganizations.id, ids.raceOrg));
  const rows = await db
    .select()
    .from(legalAcceptances)
    .where(eq(legalAcceptances.organizationId, ids.raceOrg));

  if (signed.ok) {
    assert.equal(edited.ok, false);
    assert.ok(
      !edited.ok && edited.error instanceof OrganizationDraftUpdateError,
      "the losing update must return the legal-holder conflict",
    );
    assert.equal(organization.legalAddress, IDENTITY.legalAddress);
    assert.equal(rows.length, VENUE_REQUIRED_DOCS.length);
  } else {
    assert.equal(signed.code, "IDENTITY_MISMATCH");
    assert.equal(edited.ok, true);
    assert.equal(organization.legalAddress, "Chișinău, str. Cursa 77");
    assert.equal(rows.length, 0);
  }
});

test("two concurrent first attempts create one complete canonical session", async () => {
  const input = await signInput(ids.concurrentOwner, ids.concurrentOrg);
  const [a, b] = await Promise.all([
    recordLegalAcceptancePack(input),
    recordLegalAcceptancePack(input),
  ]);
  assert.equal(a.ok, true, JSON.stringify(a));
  assert.equal(b.ok, true, JSON.stringify(b));
  if (!a.ok || !b.ok) throw new Error("concurrent");
  assert.equal(a.sessionId, b.sessionId);
  assert.deepEqual([a.reused, b.reused].sort(), [false, true]);
  const current = await db
    .select({ id: legalAcceptances.id, session: legalAcceptances.acceptanceSessionId })
    .from(legalAcceptances)
    .where(eq(legalAcceptances.organizationId, ids.concurrentOrg));
  const pack22 = current.filter((row) => row.session === a.sessionId);
  assert.equal(pack22.length, VENUE_REQUIRED_DOCS.length);
});

test("a partial 2.2 attempt stays append-only while a complete session recovers it", async () => {
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
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error("partial recovery");
  assert.equal(result.reused, false);
  assert.notEqual(result.sessionId, sessionId);
  assert.equal(result.rows.length, VENUE_REQUIRED_DOCS.length);
  const evidence = await db
    .select({ sessionId: legalAcceptances.acceptanceSessionId })
    .from(legalAcceptances)
    .where(eq(legalAcceptances.organizationId, ids.partialOrg));
  assert.ok(evidence.some((row) => row.sessionId === sessionId), "partial evidence must remain");
  assert.equal(
    evidence.filter((row) => row.sessionId === result.sessionId).length,
    VENUE_REQUIRED_DOCS.length,
  );
  const jobs = await db
    .select({ sessionId: legalContractDeliveryOutbox.acceptanceSessionId })
    .from(legalContractDeliveryOutbox)
    .where(inArray(legalContractDeliveryOutbox.acceptanceSessionId, [sessionId, result.sessionId]));
  assert.deepEqual(jobs, [{ sessionId: result.sessionId }]);
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

  const anchor = result.rows[0]!;
  assert.equal(await canViewLegalAcceptance(appUser(ids.owner2), anchor), true);
  assert.equal(await canViewLegalAcceptance(appUser(ids.outsider), anchor), false);
});

test("failed PDF delivery remains durable and succeeds exactly once on retry", async () => {
  const [anchor] = await db
    .select()
    .from(legalAcceptances)
    .where(eq(legalAcceptances.organizationId, ids.concurrentOrg))
    .limit(1);
  assert.ok(anchor);
  await db
    .update(legalContractDeliveryOutbox)
    .set({
      status: "pending",
      attempts: 0,
      lockedAt: null,
      leaseToken: null,
      deliveredAt: null,
      lastError: null,
    })
    .where(eq(legalContractDeliveryOutbox.acceptanceSessionId, anchor.acceptanceSessionId));

  let renders = 0;
  const sent: Array<{
    to: string;
    attachments?: Array<{ contentType?: string }>;
    idempotencyKey?: string;
  }> = [];
  let releaseRender!: () => void;
  let markRenderStarted!: () => void;
  const renderGate = new Promise<void>((resolve) => { releaseRender = resolve; });
  const renderStarted = new Promise<void>((resolve) => { markRenderStarted = resolve; });
  const dependencies = {
    generatePdf: async (rows: Parameters<typeof generateSignedContractPdf>[0]) => {
      renders += 1;
      if (renders === 1) throw new Error("simulated_pdf_failure");
      markRenderStarted();
      await renderGate;
      return generateSignedContractPdf(rows);
    },
    getAdminRecipients: async () => [{ id: ids.outsider, email: `${MARK}admin@example.com` }],
    sendEmail: async (input: (typeof sent)[number]) => {
      sent.push(input);
      return { data: { id: `mail-${sent.length}` }, error: null };
    },
  };

  await assert.rejects(
    () => processLegalContractDelivery(anchor.acceptanceSessionId, dependencies),
    /simulated_pdf_failure/,
  );
  const [failed] = await db
    .select()
    .from(legalContractDeliveryOutbox)
    .where(eq(legalContractDeliveryOutbox.acceptanceSessionId, anchor.acceptanceSessionId));
  assert.equal(failed.status, "failed");
  assert.equal(failed.attempts, 1);
  assert.equal(failed.leaseToken, null);
  assert.equal(sent.length, 0, "never send a permanent PNG-only fallback");

  const retry = processLegalContractDelivery(anchor.acceptanceSessionId, dependencies);
  await renderStarted;
  assert.equal(
    await processLegalContractDelivery(anchor.acceptanceSessionId, dependencies),
    "busy",
    "a concurrent retry must not acquire the same durable job",
  );
  releaseRender();
  assert.equal(await retry, "delivered");
  assert.equal(sent.length, 2, "signer and admin each receive the complete PDF");
  assert.ok(sent.every((mail) => mail.attachments?.length === 1));
  assert.ok(sent.every((mail) => mail.attachments?.[0]?.contentType === "application/pdf"));
  assert.equal(new Set(sent.map((mail) => mail.idempotencyKey)).size, sent.length);
  assert.equal(
    await processLegalContractDelivery(anchor.acceptanceSessionId, dependencies),
    "already_delivered",
  );
  assert.equal(sent.length, 2, "delivered jobs do not send again");
});

test("artist + organizationId is rejected", async () => {
  const result = await recordLegalAcceptancePack({
    ...(await signInput(ids.owner, ids.org)),
    subjectType: "artist",
    slugs: PARTNER_REQUIRED_DOCS,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "ORGANIZATION_SUBJECT_REQUIRED");
});

test("FEATURE_MULTI_HALL off preserves legacy user-scoped artist signing", async () => {
  process.env.FEATURE_MULTI_HALL = "0";
  try {
    const result = await recordLegalAcceptancePack({
      ...(await signInput(ids.outsider, 0)),
      subjectType: "artist",
      organizationId: null,
      slugs: PARTNER_REQUIRED_DOCS,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    if (result.ok) {
      assert.equal(result.rows.length, PARTNER_REQUIRED_DOCS.length);
      assert.ok(result.rows.every((row) => row.organizationId === null));
    }
  } finally {
    flagOn();
  }
});
