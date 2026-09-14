/**
 * P0 legal pack 2.2 — session uniqueness, atomic insert, reuse, recovery.
 * Guarded disposable local DB. Run: npm run test:multihall:legal-session
 *
 * Does not UPDATE/DELETE signature rows (append-only).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";

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
import {
  LEGAL_DELIVERY_MAX_ATTEMPTS,
  legalContractRetryDelayMs,
  processLegalContractDelivery,
  retryPendingLegalContractDeliveries,
} from "../src/lib/legal/contract-delivery";
import {
  ensureDraftOrganization,
  saveOrganizationProfile,
} from "../src/lib/partner/onboarding";
import type { AppUser } from "../src/lib/venue-access";
import {
  updateOrganizationMember,
  upsertOrganizationMember,
} from "../src/lib/partner/organization-members";
import { acquireLegalScopeLock } from "../src/lib/booking/advisory-locks";

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
  admin: "",
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
  const [admin] = await db
    .insert(users)
    .values({
      clerkId: MARK + "admin",
      email: `${MARK}admin@example.com`,
      name: "Admin Contracte",
      role: "admin",
    })
    .returning({ id: users.id });
  ids.admin = admin.id;

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
  const saved = await saveOrganizationProfile(appUser(ids.owner), ids.org, {
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

test("concurrent first organization requests reuse one durable draft", async () => {
  const [user] = await db
    .insert(users)
    .values({
      clerkId: MARK + "draft-race",
      email: `${MARK}draft-race@example.invalid`,
      name: "Draft Race",
    })
    .returning({ id: users.id });
  const input = {
    displayName: MARK + "Draft race organization",
    type: "company" as const,
    legalName: "Draft Race SRL",
    idNumber: "1003600023511",
    legalAddress: "Chișinău, str. Test 11",
  };
  const [first, second] = await Promise.all([
    ensureDraftOrganization(appUser(user.id), input),
    ensureDraftOrganization(appUser(user.id), input),
  ]);
  assert.equal(first.id, second.id);
  const memberships = await db
    .select({ organizationId: partnerOrganizationMembers.organizationId })
    .from(partnerOrganizationMembers)
    .where(eq(partnerOrganizationMembers.userId, user.id));
  assert.deepEqual(memberships, [{ organizationId: first.id }]);
  await db
    .delete(partnerOrganizationMembers)
    .where(eq(partnerOrganizationMembers.userId, user.id));
  await db.delete(partnerOrganizations).where(eq(partnerOrganizations.id, first.id));
  await db.delete(users).where(eq(users.id, user.id));
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
  const update = await saveOrganizationProfile(appUser(ids.owner), ids.org, {
    displayName: MARK + "Org",
    type: IDENTITY.partnerType,
    legalName: IDENTITY.legalName,
    idNumber: IDENTITY.idNumber,
    legalAddress: "Chișinău, str. Mutată 99",
  });
  assert.equal(update.ok, false);
  if (!update.ok) {
    assert.equal(update.error, "LEGAL_HOLDER_CHANGE_REQUIRES_NEW_ORGANIZATION");
    assert.equal(update.status, 409);
  }
  const [organization] = await db
    .select({ legalAddress: partnerOrganizations.legalAddress })
    .from(partnerOrganizations)
    .where(eq(partnerOrganizations.id, ids.org));
  assert.equal(organization.legalAddress, IDENTITY.legalAddress);
});

test("signing and organization POST-style update share one legal-scope lock", async () => {
  const signing = recordLegalAcceptancePack(await signInput(ids.raceOwner, ids.raceOrg));
  const editing = saveOrganizationProfile(appUser(ids.raceOwner), ids.raceOrg, {
    displayName: MARK + "Race",
    type: IDENTITY.partnerType,
    legalName: IDENTITY.legalName,
    idNumber: IDENTITY.idNumber,
    legalAddress: "Chișinău, str. Cursa 77",
  });
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
    if (!edited.ok) {
      assert.equal(edited.error, "LEGAL_HOLDER_CHANGE_REQUIRES_NEW_ORGANIZATION");
    }
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
    .select({
      sessionId: legalContractDeliveryOutbox.acceptanceSessionId,
      channel: legalContractDeliveryOutbox.channel,
      recipientKey: legalContractDeliveryOutbox.recipientKey,
    })
    .from(legalContractDeliveryOutbox)
    .where(inArray(legalContractDeliveryOutbox.acceptanceSessionId, [sessionId, result.sessionId]));
  assert.ok(jobs.length >= 2, "signer and administrators get separate durable jobs");
  assert.ok(jobs.every((job) => job.sessionId === result.sessionId));
  assert.ok(jobs.some((job) => job.channel === "signer" && job.recipientKey === ids.owner));
  assert.ok(jobs.some((job) => job.channel === "admin" && job.recipientKey === ids.admin));
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
    .delete(legalContractDeliveryOutbox)
    .where(eq(legalContractDeliveryOutbox.acceptanceSessionId, anchor.acceptanceSessionId));
  await db.insert(legalContractDeliveryOutbox).values([
    {
      acceptanceSessionId: anchor.acceptanceSessionId,
      anchorAcceptanceId: anchor.id,
      channel: "signer",
      recipientKey: anchor.userId!,
      recipientEmail: anchor.email!,
      nextAttemptAt: new Date("2026-09-13T08:00:00.000Z"),
    },
    {
      acceptanceSessionId: anchor.acceptanceSessionId,
      anchorAcceptanceId: anchor.id,
      channel: "admin",
      recipientKey: ids.admin,
      recipientEmail: `${MARK}admin@example.com`,
      nextAttemptAt: new Date("2026-09-13T08:00:00.000Z"),
    },
  ]);

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
  let now = new Date("2026-09-13T08:00:00.000Z");
  const dependencies = {
    now: () => now,
    generatePdf: async (rows: Parameters<typeof generateSignedContractPdf>[0]) => {
      renders += 1;
      if (renders === 1) throw new Error("simulated_pdf_failure");
      markRenderStarted();
      await renderGate;
      return generateSignedContractPdf(rows);
    },
    sendEmail: async (input: (typeof sent)[number]) => {
      sent.push(input);
      return { data: { id: `mail-${sent.length}` }, error: null };
    },
  };

  await assert.rejects(
    () => processLegalContractDelivery(anchor.acceptanceSessionId, dependencies),
    /simulated_pdf_failure/,
  );
  const failed = await db
    .select()
    .from(legalContractDeliveryOutbox)
    .where(eq(legalContractDeliveryOutbox.acceptanceSessionId, anchor.acceptanceSessionId));
  assert.equal(failed.length, 2);
  assert.ok(failed.every((job) => job.status === "failed"));
  assert.ok(failed.every((job) => job.attempts === 1));
  assert.ok(failed.every((job) => job.leaseToken === null));
  assert.equal(sent.length, 0, "never send a permanent PNG-only fallback");

  now = new Date(now.getTime() + legalContractRetryDelayMs(1) + 1);
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

test("a partial recipient failure retries only that recipient", async () => {
  const [anchor] = await db
    .select()
    .from(legalAcceptances)
    .where(eq(legalAcceptances.organizationId, ids.org))
    .limit(1);
  assert.ok(anchor);
  const now0 = new Date("2026-09-13T09:00:00.000Z");
  await db
    .delete(legalContractDeliveryOutbox)
    .where(eq(legalContractDeliveryOutbox.acceptanceSessionId, anchor.acceptanceSessionId));
  await db.insert(legalContractDeliveryOutbox).values([
    {
      acceptanceSessionId: anchor.acceptanceSessionId,
      anchorAcceptanceId: anchor.id,
      channel: "signer",
      recipientKey: anchor.userId!,
      recipientEmail: "signer@example.invalid",
      nextAttemptAt: now0,
    },
    {
      acceptanceSessionId: anchor.acceptanceSessionId,
      anchorAcceptanceId: anchor.id,
      channel: "admin",
      recipientKey: "admin-ok",
      recipientEmail: "admin-ok@example.invalid",
      nextAttemptAt: now0,
    },
    {
      acceptanceSessionId: anchor.acceptanceSessionId,
      anchorAcceptanceId: anchor.id,
      channel: "admin",
      recipientKey: "admin-fail",
      recipientEmail: "admin-fail@example.invalid",
      nextAttemptAt: now0,
    },
  ]);

  let now = now0;
  let failAdmin = true;
  const sent: Array<{
    to: string;
    idempotencyKey?: string;
    attachments?: Array<{ contentType?: string }>;
  }> = [];
  const dependencies = {
    now: () => now,
    generatePdf: generateSignedContractPdf,
    sendEmail: async (message: (typeof sent)[number]) => {
      sent.push(message);
      if (message.to === "admin-fail@example.invalid" && failAdmin) {
        throw new Error("simulated_admin_failure");
      }
      return { data: { id: `mail-${sent.length}` }, error: null };
    },
  };
  await assert.rejects(
    () => processLegalContractDelivery(anchor.acceptanceSessionId, dependencies),
    /contract_delivery_partial_failure/,
  );
  const firstState = await db
    .select()
    .from(legalContractDeliveryOutbox)
    .where(eq(legalContractDeliveryOutbox.acceptanceSessionId, anchor.acceptanceSessionId));
  assert.equal(firstState.filter((job) => job.status === "delivered").length, 2);
  const failed = firstState.find((job) => job.recipientKey === "admin-fail");
  assert.equal(failed?.status, "failed");
  assert.equal(failed?.attempts, 1);
  assert.ok((failed?.nextAttemptAt.getTime() ?? 0) > now.getTime());

  failAdmin = false;
  now = new Date(now.getTime() + legalContractRetryDelayMs(1) + 1);
  assert.equal(
    await processLegalContractDelivery(anchor.acceptanceSessionId, dependencies),
    "delivered",
  );
  assert.equal(sent.filter((message) => message.to === "signer@example.invalid").length, 1);
  assert.equal(sent.filter((message) => message.to === "admin-ok@example.invalid").length, 1);
  const retried = sent.filter((message) => message.to === "admin-fail@example.invalid");
  assert.equal(retried.length, 2);
  assert.equal(retried[0]?.idempotencyKey, retried[1]?.idempotencyKey);
  assert.ok(sent.every((message) => message.attachments?.[0]?.contentType === "application/pdf"));
});

test("a poisoned recipient dead-letters without starving a healthy session", async () => {
  const [poisonJob] = await db
    .select({ anchorId: legalContractDeliveryOutbox.anchorAcceptanceId })
    .from(legalContractDeliveryOutbox)
    .innerJoin(
      legalAcceptances,
      eq(legalAcceptances.id, legalContractDeliveryOutbox.anchorAcceptanceId),
    )
    .where(eq(legalAcceptances.organizationId, ids.org))
    .limit(1);
  const [healthyJob] = await db
    .select({ anchorId: legalContractDeliveryOutbox.anchorAcceptanceId })
    .from(legalContractDeliveryOutbox)
    .innerJoin(
      legalAcceptances,
      eq(legalAcceptances.id, legalContractDeliveryOutbox.anchorAcceptanceId),
    )
    .where(eq(legalAcceptances.organizationId, ids.partialOrg))
    .limit(1);
  assert.ok(poisonJob && healthyJob);
  const [poisonAnchor] = await db
    .select()
    .from(legalAcceptances)
    .where(eq(legalAcceptances.id, poisonJob.anchorId));
  const [healthyAnchor] = await db
    .select()
    .from(legalAcceptances)
    .where(eq(legalAcceptances.id, healthyJob.anchorId));
  assert.ok(poisonAnchor && healthyAnchor);
  await db.delete(legalContractDeliveryOutbox);
  const now = new Date("2026-09-13T10:00:00.000Z");
  await db.insert(legalContractDeliveryOutbox).values([
    {
      acceptanceSessionId: poisonAnchor.acceptanceSessionId,
      anchorAcceptanceId: poisonAnchor.id,
      channel: "admin",
      recipientKey: "poison",
      recipientEmail: "poison@example.invalid",
      attempts: LEGAL_DELIVERY_MAX_ATTEMPTS - 1,
      nextAttemptAt: new Date(now.getTime() - 2_000),
      createdAt: new Date(now.getTime() - 2_000),
    },
    {
      acceptanceSessionId: healthyAnchor.acceptanceSessionId,
      anchorAcceptanceId: healthyAnchor.id,
      channel: "signer",
      recipientKey: "healthy",
      recipientEmail: "healthy@example.invalid",
      nextAttemptAt: new Date(now.getTime() - 1_000),
      createdAt: new Date(now.getTime() - 1_000),
    },
  ]);
  const sent: string[] = [];
  const dependencies = {
    now: () => now,
    generatePdf: generateSignedContractPdf,
    sendEmail: async (message: { to: string }) => {
      sent.push(message.to);
      if (message.to === "poison@example.invalid") throw new Error("permanent_failure");
      return { data: { id: "ok" }, error: null };
    },
  };
  const first = await retryPendingLegalContractDeliveries(20, dependencies);
  assert.deepEqual(first, { inspected: 2, delivered: 1, failed: 1 });
  const [poison] = await db
    .select()
    .from(legalContractDeliveryOutbox)
    .where(eq(legalContractDeliveryOutbox.recipientKey, "poison"));
  const [healthy] = await db
    .select()
    .from(legalContractDeliveryOutbox)
    .where(eq(legalContractDeliveryOutbox.recipientKey, "healthy"));
  assert.equal(poison.status, "dead_letter");
  assert.equal(poison.attempts, LEGAL_DELIVERY_MAX_ATTEMPTS);
  assert.ok(poison.deadLetteredAt);
  assert.equal(poison.leaseToken, null);
  assert.equal(healthy.status, "delivered");
  const sentBefore = sent.length;
  assert.deepEqual(
    await retryPendingLegalContractDeliveries(20, dependencies),
    { inspected: 0, delivered: 0, failed: 0 },
  );
  assert.equal(sent.length, sentBefore);
});

test("an abandoned final-attempt lease is closed as dead-letter", async () => {
  const [anchor] = await db
    .select()
    .from(legalAcceptances)
    .where(eq(legalAcceptances.organizationId, ids.org))
    .limit(1);
  assert.ok(anchor);
  await db.delete(legalContractDeliveryOutbox);
  const now = new Date("2026-09-13T12:00:00.000Z");
  await db.insert(legalContractDeliveryOutbox).values({
    acceptanceSessionId: anchor.acceptanceSessionId,
    anchorAcceptanceId: anchor.id,
    channel: "admin",
    recipientKey: "abandoned-final-attempt",
    recipientEmail: "abandoned@example.invalid",
    status: "processing",
    attempts: LEGAL_DELIVERY_MAX_ATTEMPTS,
    nextAttemptAt: new Date(now.getTime() - 60_000),
    lockedAt: new Date(now.getTime() - 6 * 60_000),
    leaseToken: randomUUID(),
  });
  let effects = 0;
  const result = await processLegalContractDelivery(anchor.acceptanceSessionId, {
    now: () => now,
    generatePdf: async () => {
      effects += 1;
      throw new Error("dead-lettered work must not render");
    },
    sendEmail: async () => {
      effects += 1;
      throw new Error("dead-lettered work must not send");
    },
  });
  assert.equal(result, "dead_lettered");
  assert.equal(effects, 0);
  const [job] = await db
    .select()
    .from(legalContractDeliveryOutbox)
    .where(eq(legalContractDeliveryOutbox.recipientKey, "abandoned-final-attempt"));
  assert.equal(job.status, "dead_letter");
  assert.ok(job.deadLetteredAt);
  assert.equal(job.leaseToken, null);
});

test("a revoke committed under the legal lock wins over a waiting signature", async () => {
  const [organization] = await db
    .insert(partnerOrganizations)
    .values({
      displayName: MARK + "Revoke race",
      type: "company",
      status: "draft",
      legalName: IDENTITY.legalName,
      idNumber: IDENTITY.idNumber,
      legalAddress: IDENTITY.legalAddress,
    })
    .returning({ id: partnerOrganizations.id });
  await db.insert(partnerOrganizationMembers).values([
    { organizationId: organization.id, userId: ids.owner, role: "owner", isActive: true },
    { organizationId: organization.id, userId: ids.owner2, role: "owner", isActive: true },
  ]);

  let release!: () => void;
  let locked!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const lockReady = new Promise<void>((resolve) => { locked = resolve; });
  const revocation = db.transaction(async (tx) => {
    await acquireLegalScopeLock(tx, { organizationId: organization.id, userId: ids.owner2 });
    await tx
      .update(partnerOrganizationMembers)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(
        eq(partnerOrganizationMembers.organizationId, organization.id),
        eq(partnerOrganizationMembers.userId, ids.owner2),
      ));
    locked();
    await gate;
  });
  await lockReady;
  const signing = recordLegalAcceptancePack(await signInput(ids.owner2, organization.id));
  release();
  await revocation;
  const result = await signing;
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "FORBIDDEN");
  const evidence = await db
    .select({ id: legalAcceptances.id })
    .from(legalAcceptances)
    .where(eq(legalAcceptances.organizationId, organization.id));
  assert.equal(evidence.length, 0);
  const restore = await updateOrganizationMember(
    ids.owner,
    organization.id,
    (await db.select({ id: partnerOrganizationMembers.id })
      .from(partnerOrganizationMembers)
      .where(and(
        eq(partnerOrganizationMembers.organizationId, organization.id),
        eq(partnerOrganizationMembers.userId, ids.owner2),
      )))[0]!.id,
    { isActive: true },
  );
  assert.equal(restore.ok, true);
  await db
    .delete(partnerOrganizationMembers)
    .where(eq(partnerOrganizationMembers.organizationId, organization.id));
  await db
    .delete(partnerOrganizations)
    .where(eq(partnerOrganizations.id, organization.id));
});

test("POST-style member upsert cannot demote the last active owner", async () => {
  const result = await upsertOrganizationMember(ids.outsider, ids.outsiderOrg, {
    userId: ids.outsider,
    role: "admin",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "LAST_ORG_OWNER_TRANSFER_REQUIRED");
  const [membership] = await db
    .select({ role: partnerOrganizationMembers.role, isActive: partnerOrganizationMembers.isActive })
    .from(partnerOrganizationMembers)
    .where(and(
      eq(partnerOrganizationMembers.organizationId, ids.outsiderOrg),
      eq(partnerOrganizationMembers.userId, ids.outsider),
    ));
  assert.deepEqual(membership, { role: "owner", isActive: true });
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

test("organization evidence cannot be linked to one artist or Venue profile", async () => {
  for (const profileLink of [{ artistId: 1 }, { venueId: 1 }]) {
    const result = await recordLegalAcceptancePack({
      ...(await signInput(ids.owner, ids.org)),
      ...profileLink,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "ORGANIZATION_PROFILE_LINK_NOT_ALLOWED");
    }
  }
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
