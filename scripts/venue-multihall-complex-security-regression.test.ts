/**
 * Complex ownership, organization writes, and registration concurrency regressions.
 * Guarded disposable local PostgreSQL only.
 *
 * Run:
 *   npx tsx scripts/run-guarded-db-test.ts scripts/venue-multihall-complex-security-regression.test.ts
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "../src/lib/db";
import {
  artists,
  legalAcceptances,
  notifications,
  partnerOrganizationMembers,
  partnerOrganizations,
  users,
  venueHalls,
  venueImages,
  venues,
} from "../src/lib/db/schema";
import {
  archiveHall,
  attachVenueRoleDraftToOrganization,
  createDraftOrganization,
  OrganizationDraftUpdateError,
  saveOrganizationProfile,
  saveVenueDraft,
  submitVenueForApproval,
} from "../src/lib/partner/onboarding";
import { patchHallDraft } from "../src/lib/partner/hall-writes";
import {
  approvePartnerArtist,
  approvePartnerVenue,
  listPendingPartnerVenues,
  rejectPartnerArtist,
  rejectPartnerVenue,
} from "../src/lib/partner/registration-decision";
import {
  updateOrganizationMember,
  upsertOrganizationMember,
} from "../src/lib/partner/organization-members";
import {
  listAccessibleVenues,
  type AppUser,
} from "../src/lib/venue-access";
import {
  AVAIL_LOCK_VENUE,
  LEGAL_LOCK_ORG,
  LEGAL_LOCK_USER,
  acquireAvailabilityLocks,
  acquireLegalScopeLocks,
} from "../src/lib/booking/advisory-locks";
import {
  LEGAL_PACK_VERSION,
  PARTNER_REQUIRED_DOCS,
  VENUE_REQUIRED_DOCS,
  getLegalDocument,
  legalBlocks,
} from "../src/lib/legal";

const MARK = `complex_security_${Date.now()}_${randomUUID().slice(0, 8)}`;
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const IDENTITY = {
  partnerType: "company" as const,
  legalName: "Complex Security SRL",
  idNumber: "1003600023598",
  legalAddress: "Chișinău, str. București 10",
  representativeName: "Ion Popescu",
};
const originalFlag = process.env.FEATURE_MULTI_HALL;

const ids = {
  attacker: "",
  foreignOwner: "",
  staleMember: "",
  organizationBOwner: "",
  reviewerA: "",
  reviewerB: "",
  legacyApproveOwner: "",
  legacyRejectOwner: "",
  legacyQueueOwner: "",
  mutableAdmin: "",
  mutableMemberId: 0,
  organizationA: 0,
  organizationB: 0,
};
const createdVenueIds: number[] = [];
const createdOrganizationIds: number[] = [];

function appUser(id: string): AppUser {
  return { id, role: "user", isGlobalAdmin: false };
}

async function createUser(suffix: string) {
  const [row] = await db
    .insert(users)
    .values({
      clerkId: `${MARK}_${suffix}`,
      email: `${MARK}_${suffix}@example.invalid`,
      name: suffix,
    })
    .returning({ id: users.id });
  return row.id;
}

async function signOrganizationContract(userId: string, organizationId: number) {
  const acceptedAt = new Date();
  const acceptanceSessionId = randomUUID();
  for (const slug of VENUE_REQUIRED_DOCS) {
    const document = getLegalDocument(slug);
    assert.ok(document, `missing legal document ${slug}`);
    const blocks = legalBlocks(document, "ro");
    const contentHash = createHash("sha256")
      .update(blocks.map((block) => block.text).join("\n"))
      .digest("hex");
    await db.insert(legalAcceptances).values({
      userId,
      subjectType: "venue",
      organizationId,
      documentSlug: slug,
      documentVersion: document.version,
      packVersion: LEGAL_PACK_VERSION,
      locale: "ro",
      signatureName: IDENTITY.representativeName,
      signatureImage: PNG,
      partnerType: IDENTITY.partnerType,
      legalName: IDENTITY.legalName,
      idNumber: IDENTITY.idNumber,
      legalAddress: IDENTITY.legalAddress,
      representativeName: IDENTITY.representativeName,
      documentTitle: document.title.ro,
      documentBlocks: blocks,
      contentHash,
      acceptedAt,
      acceptanceSessionId,
    });
  }
}

async function signLegacyVenueContract(userId: string) {
  const acceptedAt = new Date();
  const acceptanceSessionId = randomUUID();
  for (const slug of VENUE_REQUIRED_DOCS) {
    const document = getLegalDocument(slug);
    assert.ok(document, `missing legal document ${slug}`);
    const blocks = legalBlocks(document, "ro");
    const contentHash = createHash("sha256")
      .update(blocks.map((block) => block.text).join("\n"))
      .digest("hex");
    await db.insert(legalAcceptances).values({
      userId,
      subjectType: "venue",
      organizationId: null,
      documentSlug: slug,
      documentVersion: document.version,
      packVersion: LEGAL_PACK_VERSION,
      locale: "ro",
      signatureName: IDENTITY.representativeName,
      signatureImage: PNG,
      partnerType: IDENTITY.partnerType,
      legalName: IDENTITY.legalName,
      idNumber: IDENTITY.idNumber,
      legalAddress: IDENTITY.legalAddress,
      representativeName: IDENTITY.representativeName,
      documentTitle: document.title.ro,
      documentBlocks: blocks,
      contentHash,
      acceptedAt,
      acceptanceSessionId,
    });
  }
}

async function signArtistContract(userId: string) {
  const acceptedAt = new Date();
  const acceptanceSessionId = randomUUID();
  for (const slug of PARTNER_REQUIRED_DOCS) {
    const document = getLegalDocument(slug);
    assert.ok(document, `missing legal document ${slug}`);
    const blocks = legalBlocks(document, "ro");
    const contentHash = createHash("sha256")
      .update(blocks.map((block) => block.text).join("\n"))
      .digest("hex");
    await db.insert(legalAcceptances).values({
      userId,
      subjectType: "artist",
      organizationId: null,
      documentSlug: slug,
      documentVersion: document.version,
      packVersion: LEGAL_PACK_VERSION,
      locale: "ro",
      signatureName: IDENTITY.representativeName,
      signatureImage: PNG,
      partnerType: IDENTITY.partnerType,
      legalName: IDENTITY.legalName,
      idNumber: IDENTITY.idNumber,
      legalAddress: IDENTITY.legalAddress,
      representativeName: IDENTITY.representativeName,
      documentTitle: document.title.ro,
      documentBlocks: blocks,
      contentHash,
      acceptedAt,
      acceptanceSessionId,
    });
  }
}

async function createIsolatedOrganization(suffix: string) {
  const [organization] = await db
    .insert(partnerOrganizations)
    .values({
      displayName: `${MARK} ${suffix}`,
      type: IDENTITY.partnerType,
      legalName: IDENTITY.legalName,
      idNumber: IDENTITY.idNumber,
      legalAddress: IDENTITY.legalAddress,
      status: "active",
    })
    .returning({ id: partnerOrganizations.id });
  createdOrganizationIds.push(organization.id);
  await db.insert(partnerOrganizationMembers).values({
    organizationId: organization.id,
    userId: ids.attacker,
    role: "owner",
    isActive: true,
  });
  await signOrganizationContract(ids.attacker, organization.id);
  return organization.id;
}

function venuePayload(organizationId: number, venueId: number, name: string) {
  return {
    organizationId,
    venueId,
    name,
    phone: "+37369000123",
    city: "Chișinău",
    address: "str. București 10",
    imageUrls: [`https://example.com/${MARK}_${venueId}.jpg`],
  };
}

async function waitingVenueLockCount(venueId: number): Promise<number> {
  const result = await db.execute(sql`
    SELECT count(*)::int AS waiting
    FROM pg_locks
    WHERE locktype = 'advisory'
      AND classid::bigint = ${AVAIL_LOCK_VENUE}
      AND objid::bigint = ${venueId}
      AND NOT granted
  `) as unknown as
    | Array<{ waiting: number }>
    | { rows: Array<{ waiting: number }> };
  const rows = Array.isArray(result) ? result : result.rows;
  return Number(rows[0]?.waiting ?? 0);
}

async function waitingUserLockCount(userId: string): Promise<number> {
  const result = await db.execute(sql`
    SELECT count(*)::int AS waiting
    FROM pg_locks
    WHERE locktype = 'advisory'
      AND classid::bigint = ${LEGAL_LOCK_USER}
      AND objid::bigint = (hashtext(${userId})::bigint & 4294967295)
      AND NOT granted
  `) as unknown as
    | Array<{ waiting: number }>
    | { rows: Array<{ waiting: number }> };
  const rows = Array.isArray(result) ? result : result.rows;
  return Number(rows[0]?.waiting ?? 0);
}

async function waitingOrganizationLockCount(organizationId: number): Promise<number> {
  const result = await db.execute(sql`
    SELECT count(*)::int AS waiting
    FROM pg_locks
    WHERE locktype = 'advisory'
      AND classid::bigint = ${LEGAL_LOCK_ORG}
      AND objid::bigint = ${organizationId}
      AND NOT granted
  `) as unknown as
    | Array<{ waiting: number }>
    | { rows: Array<{ waiting: number }> };
  const rows = Array.isArray(result) ? result : result.rows;
  return Number(rows[0]?.waiting ?? 0);
}

async function waitingRowTransactionLockCount(): Promise<number> {
  const result = await db.execute(sql`
    SELECT count(*)::int AS waiting
    FROM pg_locks
    WHERE locktype = 'transactionid'
      AND NOT granted
  `) as unknown as
    | Array<{ waiting: number }>
    | { rows: Array<{ waiting: number }> };
  const rows = Array.isArray(result) ? result : result.rows;
  return Number(rows[0]?.waiting ?? 0);
}

async function waitForVenueLockWaiters(venueId: number, minimum: number) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await waitingVenueLockCount(venueId) >= minimum) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`expected ${minimum} waiter(s) on the venue advisory lock`);
}

async function waitForLockWaiter(readCount: () => Promise<number>, label: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await readCount() >= 1) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`expected a waiter on ${label}`);
}

async function waitForUserLockWaiters(userId: string, minimum: number) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await waitingUserLockCount(userId) >= minimum) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`expected ${minimum} waiter(s) on the user advisory lock`);
}

async function waitForRowTransactionLockWaiters(minimum: number) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await waitingRowTransactionLockCount() >= minimum) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`expected ${minimum} waiter(s) on row transaction locks`);
}

async function createCompleteVenue(
  suffix: string,
  targetStatus: "draft" | "pending" = "draft",
  organizationId = ids.organizationA,
) {
  await db
    .update(partnerOrganizations)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(partnerOrganizations.id, organizationId));
  const [venue] = await db
    .insert(venues)
    .values({
      userId: null,
      organizationId,
      nameRo: `${MARK} ${suffix}`,
      slug: `${MARK}_${suffix}`.toLowerCase().replaceAll(/[^a-z0-9_]+/g, "_"),
      phone: "+37369000126",
      city: "Chișinău",
      address: "str. Test 13",
      isActive: false,
    })
    .returning({ id: venues.id });
  createdVenueIds.push(venue.id);
  await db.insert(venueImages).values({
    venueId: venue.id,
    hallId: null,
    url: `https://example.com/${MARK}_${suffix}_cover.jpg`,
    isCover: true,
  });
  const [target] = await db
    .insert(venueHalls)
    .values({
      venueId: venue.id,
      slug: "target",
      nameRo: "Target",
      status: targetStatus,
      capacityMin: 10,
      capacityMax: 50,
    })
    .returning({ id: venueHalls.id });
  const [sibling] = await db
    .insert(venueHalls)
    .values({
      venueId: venue.id,
      slug: "sibling",
      nameRo: "Sibling",
      status: "active",
      capacityMin: 10,
      capacityMax: 50,
    })
    .returning({ id: venueHalls.id });
  return { venueId: venue.id, targetHallId: target.id, siblingHallId: sibling.id };
}

async function createLegacyPendingVenue(suffix: string, ownerId: string) {
  const [venue] = await db
    .insert(venues)
    .values({
      userId: ownerId,
      organizationId: null,
      nameRo: `${MARK} ${suffix}`,
      slug: `${MARK}_${suffix}`.toLowerCase().replaceAll(/[^a-z0-9_]+/g, "_"),
      phone: "+37369000127",
      city: "Chișinău",
      address: "str. Test Legacy 14",
      isActive: false,
    })
    .returning({ id: venues.id });
  createdVenueIds.push(venue.id);
  await db.insert(venueImages).values({
    venueId: venue.id,
    hallId: null,
    url: `https://example.com/${MARK}_${suffix}_legacy_cover.jpg`,
    isCover: true,
  });
  const [hall] = await db
    .insert(venueHalls)
    .values({
      venueId: venue.id,
      slug: "principal",
      nameRo: "Sala principală",
      status: "pending",
      isLegacyDefault: true,
      capacityMin: 10,
      capacityMax: 50,
    })
    .returning({ id: venueHalls.id });
  await db
    .update(users)
    .set({ onboardingComplete: true, updatedAt: new Date() })
    .where(eq(users.id, ownerId));
  return { venueId: venue.id, hallId: hall.id };
}

async function holdVenueLock(venueId: number) {
  let releaseHolder: () => void = () => {};
  let markHeld: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    markHeld = resolve;
  });
  const release = new Promise<void>((resolve) => {
    releaseHolder = resolve;
  });
  const done = db.transaction(async (tx) => {
    await acquireAvailabilityLocks(tx, {
      venueId,
      hallIds: [],
      localDates: [],
      conflictGroupIds: [],
    });
    markHeld();
    await release;
  });
  await held;
  return { release: releaseHolder, done };
}

async function holdVenueRowLock(venueId: number) {
  let releaseHolder: () => void = () => {};
  let markHeld: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    markHeld = resolve;
  });
  const release = new Promise<void>((resolve) => {
    releaseHolder = resolve;
  });
  const done = db.transaction(async (tx) => {
    await tx
      .select({ id: venues.id })
      .from(venues)
      .where(eq(venues.id, venueId))
      .for("update");
    markHeld();
    await release;
  });
  await held;
  return { release: releaseHolder, done };
}

async function holdOrganizationLock(organizationId: number) {
  let releaseHolder: () => void = () => {};
  let markHeld: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    markHeld = resolve;
  });
  const release = new Promise<void>((resolve) => {
    releaseHolder = resolve;
  });
  const done = db.transaction(async (tx) => {
    await acquireLegalScopeLocks(tx, { organizationIds: [organizationId] });
    markHeld();
    await release;
  });
  await held;
  return { release: releaseHolder, done };
}

describe("multi-hall complex ownership and concurrency", { concurrency: false }, () => {
  before(async () => {
    process.env.FEATURE_MULTI_HALL = "1";
    ids.attacker = await createUser("attacker");
    ids.foreignOwner = await createUser("foreign_owner");
    ids.staleMember = await createUser("stale_member");
    ids.organizationBOwner = await createUser("organization_b_owner");
    ids.reviewerA = await createUser("reviewer_a");
    ids.reviewerB = await createUser("reviewer_b");
    ids.legacyApproveOwner = await createUser("legacy_approve_owner");
    ids.legacyRejectOwner = await createUser("legacy_reject_owner");
    ids.legacyQueueOwner = await createUser("legacy_queue_owner");
    ids.mutableAdmin = await createUser("mutable_admin");
    await db
      .update(users)
      .set({ role: "admin" })
      .where(inArray(users.id, [ids.reviewerA, ids.reviewerB]));

    const [organizationA] = await db
      .insert(partnerOrganizations)
      .values({
        displayName: `${MARK} Organization A`,
        type: IDENTITY.partnerType,
        legalName: IDENTITY.legalName,
        idNumber: IDENTITY.idNumber,
        legalAddress: IDENTITY.legalAddress,
        status: "draft",
      })
      .returning({ id: partnerOrganizations.id });
    ids.organizationA = organizationA.id;
    const [organizationB] = await db
      .insert(partnerOrganizations)
      .values({ displayName: `${MARK} Organization B`, status: "draft" })
      .returning({ id: partnerOrganizations.id });
    ids.organizationB = organizationB.id;

    const memberships = await db.insert(partnerOrganizationMembers).values([
      {
        organizationId: ids.organizationA,
        userId: ids.attacker,
        role: "owner",
        isActive: true,
      },
      {
        organizationId: ids.organizationB,
        userId: ids.organizationBOwner,
        role: "owner",
        isActive: true,
      },
      {
        organizationId: ids.organizationB,
        userId: ids.staleMember,
        role: "owner",
        isActive: false,
      },
      {
        organizationId: ids.organizationA,
        userId: ids.mutableAdmin,
        role: "admin",
        isActive: true,
      },
    ]).returning({
      id: partnerOrganizationMembers.id,
      userId: partnerOrganizationMembers.userId,
    });
    ids.mutableMemberId = memberships.find((row) => row.userId === ids.mutableAdmin)?.id ?? 0;
    assert.ok(ids.mutableMemberId);
    await signOrganizationContract(ids.attacker, ids.organizationA);
    await signLegacyVenueContract(ids.legacyApproveOwner);
    await signLegacyVenueContract(ids.legacyRejectOwner);
    await signLegacyVenueContract(ids.legacyQueueOwner);
  });

  after(async () => {
    const allUserIds = [
      ids.attacker,
      ids.foreignOwner,
      ids.staleMember,
      ids.organizationBOwner,
      ids.reviewerA,
      ids.reviewerB,
      ids.legacyApproveOwner,
      ids.legacyRejectOwner,
      ids.legacyQueueOwner,
      ids.mutableAdmin,
    ].filter(Boolean);
    if (allUserIds.length > 0) {
      await db.delete(notifications).where(inArray(notifications.userId, allUserIds));
    }
    if (createdVenueIds.length > 0) {
      await db.delete(venueImages).where(inArray(venueImages.venueId, createdVenueIds));
      await db.delete(venueHalls).where(inArray(venueHalls.venueId, createdVenueIds));
      await db.delete(venues).where(inArray(venues.id, createdVenueIds));
    }
    const organizationIds = [
      ids.organizationA,
      ids.organizationB,
      ...createdOrganizationIds,
    ].filter(Boolean);
    if (organizationIds.length > 0) {
      await db
        .delete(legalAcceptances)
        .where(inArray(legalAcceptances.organizationId, organizationIds));
      await db
        .delete(partnerOrganizationMembers)
        .where(inArray(partnerOrganizationMembers.organizationId, organizationIds));
      await db
        .delete(partnerOrganizations)
        .where(inArray(partnerOrganizations.id, organizationIds));
    }
    if (allUserIds.length > 0) {
      await db
        .delete(legalAcceptances)
        .where(inArray(legalAcceptances.userId, allUserIds));
    }
    if (allUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, allUserIds));
    }
    if (originalFlag === undefined) delete process.env.FEATURE_MULTI_HALL;
    else process.env.FEATURE_MULTI_HALL = originalFlag;
  });

  test("concurrent artist approve/reject has one atomic winner and one notification", async () => {
    const ownerId = await createUser("artist_decision_owner");
    await db
      .update(users)
      .set({ role: "artist", onboardingComplete: true, updatedAt: new Date() })
      .where(eq(users.id, ownerId));
    await signArtistContract(ownerId);
    const [artist] = await db
      .insert(artists)
      .values({
        userId: ownerId,
        nameRo: `${MARK} Artist concurent`,
        slug: `${MARK}_artist_concurrent`,
        email: `${MARK}_artist@example.invalid`,
        isActive: false,
      })
      .returning({ id: artists.id });

    try {
      const outcomes = await Promise.all([
        approvePartnerArtist(ids.reviewerA, artist.id),
        rejectPartnerArtist(ids.reviewerB, artist.id),
      ]);
      assert.equal(outcomes.filter((outcome) => outcome.ok).length, 1, JSON.stringify(outcomes));
      assert.equal(outcomes.filter((outcome) => !outcome.ok).length, 1, JSON.stringify(outcomes));

      const survivingArtists = await db
        .select({ isActive: artists.isActive })
        .from(artists)
        .where(eq(artists.id, artist.id));
      const [owner] = await db
        .select({ role: users.role, onboardingComplete: users.onboardingComplete })
        .from(users)
        .where(eq(users.id, ownerId));
      const decisionNotifications = await db
        .select({ type: notifications.type })
        .from(notifications)
        .where(and(
          eq(notifications.userId, ownerId),
          inArray(notifications.type, ["registration_approved", "registration_rejected"]),
        ));
      assert.equal(decisionNotifications.length, 1);
      if (survivingArtists.length === 1) {
        assert.equal(survivingArtists[0]!.isActive, true);
        assert.equal(owner.role, "artist");
        assert.equal(owner.onboardingComplete, true);
        assert.equal(decisionNotifications[0]!.type, "registration_approved");
      } else {
        assert.equal(owner.role, "user");
        assert.equal(owner.onboardingComplete, false);
        assert.equal(decisionNotifications[0]!.type, "registration_rejected");
      }
    } finally {
      await db.delete(notifications).where(eq(notifications.userId, ownerId));
      await db.delete(artists).where(eq(artists.id, artist.id));
      await db.delete(legalAcceptances).where(eq(legalAcceptances.userId, ownerId));
      await db.delete(users).where(eq(users.id, ownerId));
    }
  });

  test("a forged organization-null venueId cannot be claimed across tenants", async () => {
    const [foreignVenue] = await db
      .insert(venues)
      .values({
        userId: ids.foreignOwner,
        organizationId: null,
        nameRo: `${MARK} Foreign legacy venue`,
        slug: `${MARK}_foreign_legacy`,
        phone: "+37369000124",
        city: "Chișinău",
        address: "str. Test 11",
      })
      .returning({ id: venues.id });
    createdVenueIds.push(foreignVenue.id);

    const result = await saveVenueDraft(
      appUser(ids.attacker),
      venuePayload(ids.organizationA, foreignVenue.id, `${MARK} Claimed`),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 403);

    const [unchanged] = await db
      .select({
        userId: venues.userId,
        organizationId: venues.organizationId,
        nameRo: venues.nameRo,
      })
      .from(venues)
      .where(eq(venues.id, foreignVenue.id));
    assert.equal(unchanged.userId, ids.foreignOwner);
    assert.equal(unchanged.organizationId, null);
    assert.equal(unchanged.nameRo, `${MARK} Foreign legacy venue`);
  });

  test("onboarding venue reads expose only the caller's organization-null venue", async () => {
    const [owned, foreign] = await db
      .insert(venues)
      .values([
        {
          userId: ids.attacker,
          organizationId: null,
          nameRo: `${MARK} Read owned legacy`,
          slug: `${MARK}_read_owned_legacy`,
          phone: "+37369000135",
          city: "Chișinău",
        },
        {
          userId: ids.foreignOwner,
          organizationId: null,
          nameRo: `${MARK} Read foreign legacy`,
          slug: `${MARK}_read_foreign_legacy`,
          phone: "+37369000136",
          city: "Chișinău",
        },
      ])
      .returning({ id: venues.id });
    createdVenueIds.push(owned.id, foreign.id);

    const accessible = await listAccessibleVenues(ids.attacker);
    assert.ok(accessible.some((venue) => venue.id === owned.id));
    assert.equal(accessible.some((venue) => venue.id === foreign.id), false);
  });

  test("one explicit organization key cannot be reused with a different payload", async () => {
    const ownerId = await createUser("concurrent_org_payload_owner");
    let releaseOwner: () => void = () => {};
    let markHeld: () => void = () => {};
    const held = new Promise<void>((resolve) => { markHeld = resolve; });
    const release = new Promise<void>((resolve) => { releaseOwner = resolve; });
    const blocker = db.transaction(async (tx) => {
      await acquireLegalScopeLocks(tx, { userIds: [ownerId] });
      markHeld();
      await release;
    });
    await held;

    const requestId = randomUUID();
    const first = createDraftOrganization(appUser(ownerId), {
      organizationCreateRequestId: requestId,
      displayName: `${MARK} Concurrent organization A`,
      type: "company",
      legalName: "Concurrent A SRL",
    });
    const second = createDraftOrganization(appUser(ownerId), {
      organizationCreateRequestId: requestId,
      displayName: `${MARK} Concurrent organization B`,
      type: "company",
      legalName: "Concurrent B SRL",
    });
    try {
      await waitForUserLockWaiters(ownerId, 2);
    } finally {
      releaseOwner();
      await blocker;
    }

    const outcomes = await Promise.allSettled([first, second]);
    const fulfilled = outcomes.filter(
      (outcome): outcome is PromiseFulfilledResult<Awaited<typeof first>> =>
        outcome.status === "fulfilled",
    );
    const rejected = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult => outcome.status === "rejected",
    );
    assert.equal(fulfilled.length, 1, JSON.stringify(outcomes));
    assert.equal(rejected.length, 1, JSON.stringify(outcomes));
    assert.ok(rejected[0]?.reason instanceof OrganizationDraftUpdateError);
    assert.equal(rejected[0]?.reason.code, "IDEMPOTENCY_KEY_REUSED");
    assert.equal(rejected[0]?.reason.status, 409);

    const memberships = await db
      .select({ organizationId: partnerOrganizationMembers.organizationId })
      .from(partnerOrganizationMembers)
      .where(eq(partnerOrganizationMembers.userId, ownerId));
    assert.equal(memberships.length, 1);
    if (memberships.length) {
      await db
        .delete(partnerOrganizationMembers)
        .where(eq(partnerOrganizationMembers.userId, ownerId));
      await db
        .delete(partnerOrganizations)
        .where(eq(partnerOrganizations.id, memberships[0]!.organizationId));
    }
    await db.delete(users).where(eq(users.id, ownerId));
  });

  test("a stale org-backed user_id grants no access after membership removal", async () => {
    const [staleVenue] = await db
      .insert(venues)
      .values({
        userId: ids.staleMember,
        organizationId: ids.organizationB,
        nameRo: `${MARK} Stale organization venue`,
        slug: `${MARK}_stale_org`,
        phone: "+37369000125",
        city: "Chișinău",
        address: "str. Test 12",
      })
      .returning({ id: venues.id });
    createdVenueIds.push(staleVenue.id);

    const roleAttach = await attachVenueRoleDraftToOrganization(
      appUser(ids.staleMember),
      staleVenue.id,
      ids.organizationB,
    );
    assert.equal(roleAttach.ok, false);
    if (!roleAttach.ok) assert.equal(roleAttach.status, 403);

    const save = await saveVenueDraft(
      appUser(ids.staleMember),
      venuePayload(ids.organizationB, staleVenue.id, `${MARK} Unauthorized edit`),
    );
    assert.equal(save.ok, false);
    if (!save.ok) assert.equal(save.status, 403);

    const [unchanged] = await db
      .select({ organizationId: venues.organizationId, nameRo: venues.nameRo })
      .from(venues)
      .where(eq(venues.id, staleVenue.id));
    assert.equal(unchanged.organizationId, ids.organizationB);
    assert.equal(unchanged.nameRo, `${MARK} Stale organization venue`);
  });

  test("organization PATCH first completes before a waiting membership revocation", async () => {
    const nextName = `${MARK} Patch before revoke`;
    const holder = await holdOrganizationLock(ids.organizationA);
    const saving = saveOrganizationProfile(
      appUser(ids.mutableAdmin),
      ids.organizationA,
      { displayName: nextName },
    );
    let revoking: ReturnType<typeof updateOrganizationMember> | undefined;
    try {
      await waitForLockWaiter(
        () => waitingOrganizationLockCount(ids.organizationA),
        "organization PATCH lock",
      );
      revoking = updateOrganizationMember(
        ids.attacker,
        ids.organizationA,
        ids.mutableMemberId,
        { isActive: false },
      );
      await waitForLockWaiter(
        () => waitingUserLockCount(ids.mutableAdmin),
        "PATCH actor user lock",
      );
    } finally {
      holder.release();
      await holder.done;
    }
    assert.ok(revoking);
    const [saved, revoked] = await Promise.all([saving, revoking]);
    assert.equal(saved.ok, true, JSON.stringify(saved));
    assert.equal(revoked.ok, true, JSON.stringify(revoked));
    const [organization] = await db
      .select({ displayName: partnerOrganizations.displayName })
      .from(partnerOrganizations)
      .where(eq(partnerOrganizations.id, ids.organizationA));
    assert.equal(organization.displayName, nextName);
    const restored = await upsertOrganizationMember(
      ids.attacker,
      ids.organizationA,
      { userId: ids.mutableAdmin, role: "admin" },
    );
    assert.equal(restored.ok, true, JSON.stringify(restored));
  });

  test("membership revocation first is observed by a waiting organization PATCH", async () => {
    const [before] = await db
      .select({ displayName: partnerOrganizations.displayName })
      .from(partnerOrganizations)
      .where(eq(partnerOrganizations.id, ids.organizationA));
    let releaseMutation: () => void = () => {};
    let markHeld: () => void = () => {};
    const held = new Promise<void>((resolve) => { markHeld = resolve; });
    const release = new Promise<void>((resolve) => { releaseMutation = resolve; });
    const revocation = db.transaction(async (tx) => {
      await acquireLegalScopeLocks(tx, {
        userIds: [ids.attacker, ids.mutableAdmin],
        organizationIds: [ids.organizationA],
      });
      await tx
        .update(partnerOrganizationMembers)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(partnerOrganizationMembers.id, ids.mutableMemberId));
      markHeld();
      await release;
    });
    await held;
    const saving = saveOrganizationProfile(
      appUser(ids.mutableAdmin),
      ids.organizationA,
      { displayName: `${MARK} Forbidden after revoke` },
    );
    try {
      await waitForLockWaiter(
        () => waitingUserLockCount(ids.mutableAdmin),
        "revoked PATCH actor user lock",
      );
    } finally {
      releaseMutation();
      await revocation;
    }
    const saved = await saving;
    assert.equal(saved.ok, false, JSON.stringify(saved));
    if (!saved.ok) {
      assert.equal(saved.status, 403);
      assert.equal("code" in saved ? saved.code : null, "FORBIDDEN");
    }
    const [after] = await db
      .select({ displayName: partnerOrganizations.displayName })
      .from(partnerOrganizations)
      .where(eq(partnerOrganizations.id, ids.organizationA));
    assert.equal(after.displayName, before.displayName);
    const restored = await upsertOrganizationMember(
      ids.attacker,
      ids.organizationA,
      { userId: ids.mutableAdmin, role: "admin" },
    );
    assert.equal(restored.ok, true, JSON.stringify(restored));
  });

  test("organization PATCH first completes before a waiting membership demotion", async () => {
    const nextName = `${MARK} Patch before demote`;
    const holder = await holdOrganizationLock(ids.organizationA);
    const saving = saveOrganizationProfile(
      appUser(ids.mutableAdmin),
      ids.organizationA,
      { displayName: nextName },
    );
    let demoting: ReturnType<typeof updateOrganizationMember> | undefined;
    try {
      await waitForLockWaiter(
        () => waitingOrganizationLockCount(ids.organizationA),
        "organization PATCH lock before demotion",
      );
      demoting = updateOrganizationMember(
        ids.attacker,
        ids.organizationA,
        ids.mutableMemberId,
        { role: "manager", isActive: true },
      );
      await waitForLockWaiter(
        () => waitingUserLockCount(ids.mutableAdmin),
        "PATCH actor user lock before demotion",
      );
    } finally {
      holder.release();
      await holder.done;
    }
    assert.ok(demoting);
    const [saved, demoted] = await Promise.all([saving, demoting]);
    assert.equal(saved.ok, true, JSON.stringify(saved));
    assert.equal(demoted.ok, true, JSON.stringify(demoted));
    const [organization] = await db
      .select({ displayName: partnerOrganizations.displayName })
      .from(partnerOrganizations)
      .where(eq(partnerOrganizations.id, ids.organizationA));
    assert.equal(organization.displayName, nextName);
    const restored = await upsertOrganizationMember(
      ids.attacker,
      ids.organizationA,
      { userId: ids.mutableAdmin, role: "admin" },
    );
    assert.equal(restored.ok, true, JSON.stringify(restored));
  });

  test("membership demotion first is observed by a waiting organization PATCH", async () => {
    const [before] = await db
      .select({ displayName: partnerOrganizations.displayName })
      .from(partnerOrganizations)
      .where(eq(partnerOrganizations.id, ids.organizationA));
    let releaseMutation: () => void = () => {};
    let markHeld: () => void = () => {};
    const held = new Promise<void>((resolve) => { markHeld = resolve; });
    const release = new Promise<void>((resolve) => { releaseMutation = resolve; });
    const demotion = db.transaction(async (tx) => {
      await acquireLegalScopeLocks(tx, {
        userIds: [ids.attacker, ids.mutableAdmin],
        organizationIds: [ids.organizationA],
      });
      await tx
        .update(partnerOrganizationMembers)
        .set({ role: "manager", isActive: true, updatedAt: new Date() })
        .where(eq(partnerOrganizationMembers.id, ids.mutableMemberId));
      markHeld();
      await release;
    });
    await held;
    const saving = saveOrganizationProfile(
      appUser(ids.mutableAdmin),
      ids.organizationA,
      { displayName: `${MARK} Forbidden after demotion` },
    );
    try {
      await waitForLockWaiter(
        () => waitingUserLockCount(ids.mutableAdmin),
        "demoted PATCH actor user lock",
      );
    } finally {
      releaseMutation();
      await demotion;
    }
    const saved = await saving;
    assert.equal(saved.ok, false, JSON.stringify(saved));
    if (!saved.ok) {
      assert.equal(saved.status, 403);
      assert.equal("code" in saved ? saved.code : null, "FORBIDDEN");
    }
    const [after] = await db
      .select({ displayName: partnerOrganizations.displayName })
      .from(partnerOrganizations)
      .where(eq(partnerOrganizations.id, ids.organizationA));
    assert.equal(after.displayName, before.displayName);
    const restored = await upsertOrganizationMember(
      ids.attacker,
      ids.organizationA,
      { userId: ids.mutableAdmin, role: "admin" },
    );
    assert.equal(restored.ok, true, JSON.stringify(restored));
  });

  test("the real legacy owner can attach a stub to an authorized organization", async () => {
    const [stub] = await db
      .insert(venues)
      .values({
        userId: ids.attacker,
        organizationId: null,
        nameRo: "Sală nouă",
        slug: `${MARK}_owned_stub`,
        phone: "",
        city: "Chișinău",
      })
      .returning({ id: venues.id });
    createdVenueIds.push(stub.id);

    const attached = await attachVenueRoleDraftToOrganization(
      appUser(ids.attacker),
      stub.id,
      ids.organizationA,
    );
    assert.equal(attached.ok, true, JSON.stringify(attached));

    const saved = await saveVenueDraft(
      appUser(ids.attacker),
      venuePayload(ids.organizationA, stub.id, `${MARK} Owned venue`),
    );
    assert.equal(saved.ok, true, JSON.stringify(saved));
    const [row] = await db
      .select({ userId: venues.userId, organizationId: venues.organizationId })
      .from(venues)
      .where(eq(venues.id, stub.id));
    assert.equal(row.userId, ids.attacker);
    assert.equal(row.organizationId, ids.organizationA);
  });

  test("a legacy owner cannot attach their venue to an unmanaged organization", async () => {
    const [stub] = await db
      .insert(venues)
      .values({
        userId: ids.attacker,
        organizationId: null,
        nameRo: `${MARK} Unmanaged target stub`,
        slug: `${MARK}_unmanaged_target_stub`,
        phone: "+37369000131",
        city: "Chișinău",
      })
      .returning({ id: venues.id });
    createdVenueIds.push(stub.id);

    const result = await attachVenueRoleDraftToOrganization(
      appUser(ids.attacker),
      stub.id,
      ids.organizationB,
    );
    assert.equal(result.ok, false, JSON.stringify(result));
    if (!result.ok) assert.equal(result.status, 403);
    const [unchanged] = await db
      .select({ organizationId: venues.organizationId })
      .from(venues)
      .where(eq(venues.id, stub.id));
    assert.equal(unchanged.organizationId, null);
  });

  test("even a manager of both organizations cannot reparent an attached venue", async () => {
    const [membership] = await db
      .insert(partnerOrganizationMembers)
      .values({
        organizationId: ids.organizationB,
        userId: ids.attacker,
        role: "admin",
        isActive: true,
      })
      .returning({ id: partnerOrganizationMembers.id });
    const [attachedVenue] = await db
      .insert(venues)
      .values({
        userId: ids.attacker,
        organizationId: ids.organizationA,
        nameRo: `${MARK} Already attached`,
        slug: `${MARK}_already_attached`,
        phone: "+37369000132",
        city: "Chișinău",
      })
      .returning({ id: venues.id });
    createdVenueIds.push(attachedVenue.id);
    try {
      const result = await attachVenueRoleDraftToOrganization(
        appUser(ids.attacker),
        attachedVenue.id,
        ids.organizationB,
      );
      assert.equal(result.ok, false, JSON.stringify(result));
      if (!result.ok) assert.equal(result.status, 403);
      const [unchanged] = await db
        .select({ organizationId: venues.organizationId })
        .from(venues)
        .where(eq(venues.id, attachedVenue.id));
      assert.equal(unchanged.organizationId, ids.organizationA);
    } finally {
      await db
        .delete(partnerOrganizationMembers)
        .where(eq(partnerOrganizationMembers.id, membership.id));
    }
  });

  test("simultaneous attachment to two managed organizations has exactly one winner", async () => {
    const organizationOne = await createIsolatedOrganization("Attach race one");
    const organizationTwo = await createIsolatedOrganization("Attach race two");
    const [stub] = await db
      .insert(venues)
      .values({
        userId: ids.attacker,
        organizationId: null,
        nameRo: `${MARK} Attach race stub`,
        slug: `${MARK}_attach_race_stub`,
        phone: "+37369000137",
        city: "Chișinău",
      })
      .returning({ id: venues.id });
    createdVenueIds.push(stub.id);

    const outcomes = await Promise.all([
      attachVenueRoleDraftToOrganization(appUser(ids.attacker), stub.id, organizationOne),
      attachVenueRoleDraftToOrganization(appUser(ids.attacker), stub.id, organizationTwo),
    ]);
    assert.equal(outcomes.filter((outcome) => outcome.ok).length, 1, JSON.stringify(outcomes));
    assert.equal(outcomes.filter((outcome) => !outcome.ok).length, 1, JSON.stringify(outcomes));
    const [attached] = await db
      .select({ organizationId: venues.organizationId })
      .from(venues)
      .where(eq(venues.id, stub.id));
    assert.ok(
      attached.organizationId === organizationOne
      || attached.organizationId === organizationTwo,
    );
  });

  test("an OFF-created pending venue can attach, reopen, and resubmit after the flag turns ON", async () => {
    const ownerId = await createUser("flag_transition_owner");
    const submittingAdminId = await createUser("flag_transition_submitting_admin");
    const [organization] = await db
      .insert(partnerOrganizations)
      .values({
        displayName: `${MARK} Transition organization`,
        type: IDENTITY.partnerType,
        legalName: IDENTITY.legalName,
        idNumber: IDENTITY.idNumber,
        legalAddress: IDENTITY.legalAddress,
        status: "pending",
      })
      .returning({ id: partnerOrganizations.id });
    await db.insert(partnerOrganizationMembers).values([
      {
        organizationId: organization.id,
        userId: ownerId,
        role: "owner",
        isActive: true,
      },
      {
        organizationId: organization.id,
        userId: submittingAdminId,
        role: "admin",
        isActive: true,
      },
    ]);
    await signOrganizationContract(ownerId, organization.id);
    const [legacyVenue] = await db
      .insert(venues)
      .values({
        userId: ownerId,
        organizationId: null,
        nameRo: `${MARK} Legacy transition venue`,
        slug: `${MARK}_legacy_transition_venue`,
        phone: "+37369000129",
        city: "Chișinău",
        address: "str. Tranziție 10",
        website: "https://legacy.example.test",
        isActive: false,
      })
      .returning({ id: venues.id });
    await db.insert(venueImages).values({
      venueId: legacyVenue.id,
      hallId: null,
      url: `https://example.com/${MARK}_transition_cover.jpg`,
      isCover: true,
    });
    const [legacyHall] = await db
      .insert(venueHalls)
      .values({
        venueId: legacyVenue.id,
        slug: "principal",
        nameRo: "Sala principală",
        status: "pending",
        isLegacyDefault: true,
        capacityMin: null,
        capacityMax: null,
        pricingModel: "per_person",
        basePrice: 875,
      })
      .returning({ id: venueHalls.id });
    await db
      .update(users)
      .set({ onboardingComplete: true, updatedAt: new Date() })
      .where(eq(users.id, ownerId));

    try {
      const saved = await saveVenueDraft(appUser(ownerId), {
        organizationId: organization.id,
        venueId: legacyVenue.id,
        name: `${MARK} Legacy transition corrected`,
        phone: "+37369000129",
        city: "Chișinău",
        address: "str. Tranziție 10",
        // The recovery screen does not own these fields. Omitting them must
        // preserve the old gallery and ancillary profile values.
      });
      assert.equal(saved.ok, true, JSON.stringify(saved));

      const [attached] = await db
        .select({
          organizationId: venues.organizationId,
          website: venues.website,
        })
        .from(venues)
        .where(eq(venues.id, legacyVenue.id));
      assert.equal(attached.organizationId, organization.id);
      assert.equal(attached.website, "https://legacy.example.test");
      const preservedImages = await db
        .select({ id: venueImages.id })
        .from(venueImages)
        .where(eq(venueImages.venueId, legacyVenue.id));
      assert.equal(preservedImages.length, 1);
      const [reopenedHall] = await db
        .select({
          status: venueHalls.status,
          pricingModel: venueHalls.pricingModel,
          basePrice: venueHalls.basePrice,
        })
        .from(venueHalls)
        .where(eq(venueHalls.id, legacyHall.id));
      assert.equal(reopenedHall.status, "draft");
      assert.equal(reopenedHall.pricingModel, "per_person");
      assert.equal(reopenedHall.basePrice, 875);
      const [ownerAfterAttachment] = await db
        .select({ onboardingComplete: users.onboardingComplete })
        .from(users)
        .where(eq(users.id, ownerId));
      assert.equal(ownerAfterAttachment.onboardingComplete, false);

      const completedHall = await patchHallDraft(
        ownerId,
        legacyVenue.id,
        legacyHall.id,
        { capacityMin: 10, capacityMax: 100 },
      );
      assert.equal(completedHall.ok, true, JSON.stringify(completedHall));

      // A different authorized organization admin may submit the attached
      // legacy Venue. Both the acting admin and original legacy owner must be
      // released from onboarding; otherwise the owner remains redirect-locked.
      const submitted = await submitVenueForApproval(submittingAdminId, legacyVenue.id);
      assert.equal(submitted.ok, true, JSON.stringify(submitted));
      if (submitted.ok) assert.equal(submitted.submitted, true);
      const [[hallAfter], completedUsers] = await Promise.all([
        db
          .select({ status: venueHalls.status })
          .from(venueHalls)
          .where(eq(venueHalls.id, legacyHall.id)),
        db
          .select({ id: users.id, onboardingComplete: users.onboardingComplete })
          .from(users)
          .where(inArray(users.id, [ownerId, submittingAdminId])),
      ]);
      assert.equal(hallAfter.status, "pending");
      assert.equal(completedUsers.length, 2);
      assert.ok(completedUsers.every((user) => user.onboardingComplete));

      // Simulate a lost first attachment response: replaying the identical
      // venue save must observe, not reopen, the already-pending Hall.
      const retriedAttachment = await saveVenueDraft(appUser(ownerId), {
        organizationId: organization.id,
        venueId: legacyVenue.id,
        name: `${MARK} Legacy transition corrected`,
        phone: "+37369000129",
        city: "Chișinău",
        address: "str. Tranziție 10",
      });
      assert.equal(retriedAttachment.ok, true, JSON.stringify(retriedAttachment));
      const [[hallAfterRetry], [ownerAfterRetry], venueCopies] = await Promise.all([
        db
          .select({ status: venueHalls.status })
          .from(venueHalls)
          .where(eq(venueHalls.id, legacyHall.id)),
        db
          .select({ onboardingComplete: users.onboardingComplete })
          .from(users)
          .where(eq(users.id, ownerId)),
        db
          .select({ id: venues.id })
          .from(venues)
          .where(eq(venues.id, legacyVenue.id)),
      ]);
      assert.equal(hallAfterRetry.status, "pending");
      assert.equal(ownerAfterRetry.onboardingComplete, true);
      assert.equal(venueCopies.length, 1);

      const replay = await submitVenueForApproval(submittingAdminId, legacyVenue.id);
      assert.equal(replay.ok, true, JSON.stringify(replay));
      if (replay.ok) assert.equal(replay.submitted, false);
      const [ownerAfterIdempotentRetry] = await db
        .select({ onboardingComplete: users.onboardingComplete })
        .from(users)
        .where(eq(users.id, ownerId));
      assert.equal(ownerAfterIdempotentRetry.onboardingComplete, true);
    } finally {
      await db.delete(venueImages).where(eq(venueImages.venueId, legacyVenue.id));
      await db.delete(venueHalls).where(eq(venueHalls.venueId, legacyVenue.id));
      await db.delete(venues).where(eq(venues.id, legacyVenue.id));
      await db.delete(legalAcceptances).where(eq(legalAcceptances.organizationId, organization.id));
      await db.delete(partnerOrganizationMembers).where(eq(partnerOrganizationMembers.organizationId, organization.id));
      await db.delete(partnerOrganizations).where(eq(partnerOrganizations.id, organization.id));
      await db.delete(users).where(inArray(users.id, [ownerId, submittingAdminId]));
    }
  });

  test("an OFF-era rejected venue stays incomplete until its Hall is corrected and resubmitted", async () => {
    const ownerId = await createUser("flag_transition_rejected_owner");
    const [organization] = await db
      .insert(partnerOrganizations)
      .values({
        displayName: `${MARK} Rejected transition organization`,
        type: IDENTITY.partnerType,
        legalName: IDENTITY.legalName,
        idNumber: IDENTITY.idNumber,
        legalAddress: IDENTITY.legalAddress,
        status: "pending",
      })
      .returning({ id: partnerOrganizations.id });
    await db.insert(partnerOrganizationMembers).values({
      organizationId: organization.id,
      userId: ownerId,
      role: "owner",
      isActive: true,
    });
    await signOrganizationContract(ownerId, organization.id);
    const [legacyVenue] = await db
      .insert(venues)
      .values({
        userId: ownerId,
        organizationId: null,
        nameRo: `${MARK} Rejected transition venue`,
        slug: `${MARK}_rejected_transition_venue`,
        phone: "+37369000133",
        city: "Chișinău",
        address: "str. Tranziție 11",
        isActive: false,
      })
      .returning({ id: venues.id });
    const [image] = await db
      .insert(venueImages)
      .values({
        venueId: legacyVenue.id,
        hallId: null,
        url: `https://example.com/${MARK}_rejected_transition_cover.jpg`,
        isCover: true,
      })
      .returning({ id: venueImages.id });
    const [legacyHall] = await db
      .insert(venueHalls)
      .values({
        venueId: legacyVenue.id,
        slug: "principal",
        nameRo: "Sala principală",
        status: "rejected",
        isLegacyDefault: true,
        capacityMin: null,
        capacityMax: null,
        pricingModel: "per_person",
        basePrice: 925,
      })
      .returning({ id: venueHalls.id });
    await db
      .update(users)
      .set({ onboardingComplete: true, updatedAt: new Date() })
      .where(eq(users.id, ownerId));

    try {
      const attached = await saveVenueDraft(appUser(ownerId), {
        organizationId: organization.id,
        venueId: legacyVenue.id,
        name: `${MARK} Rejected transition venue`,
        phone: "+37369000133",
        city: "Chișinău",
        address: "str. Tranziție 11",
      });
      assert.equal(attached.ok, true, JSON.stringify(attached));
      const [[afterAttach], [ownerAfterAttach], imagesAfterAttach] = await Promise.all([
        db
          .select({
            status: venueHalls.status,
            pricingModel: venueHalls.pricingModel,
            basePrice: venueHalls.basePrice,
          })
          .from(venueHalls)
          .where(eq(venueHalls.id, legacyHall.id)),
        db
          .select({ onboardingComplete: users.onboardingComplete })
          .from(users)
          .where(eq(users.id, ownerId)),
        db
          .select({ id: venueImages.id })
          .from(venueImages)
          .where(eq(venueImages.venueId, legacyVenue.id)),
      ]);
      assert.equal(afterAttach.status, "rejected");
      assert.equal(afterAttach.pricingModel, "per_person");
      assert.equal(afterAttach.basePrice, 925);
      assert.equal(ownerAfterAttach.onboardingComplete, false);
      assert.deepEqual(imagesAfterAttach.map((row) => row.id), [image.id]);

      const corrected = await patchHallDraft(
        ownerId,
        legacyVenue.id,
        legacyHall.id,
        { capacityMin: 20, capacityMax: 140 },
      );
      assert.equal(corrected.ok, true, JSON.stringify(corrected));
      if (corrected.ok) {
        assert.equal(corrected.hall.status, "draft");
        assert.equal(corrected.hall.pricingModel, "per_person");
        assert.equal(corrected.hall.basePrice, 925);
      }

      const submitted = await submitVenueForApproval(ownerId, legacyVenue.id);
      assert.equal(submitted.ok, true, JSON.stringify(submitted));
      if (submitted.ok) assert.equal(submitted.submitted, true);
      const [[hallAfterSubmit], [ownerAfterSubmit]] = await Promise.all([
        db
          .select({ status: venueHalls.status })
          .from(venueHalls)
          .where(eq(venueHalls.id, legacyHall.id)),
        db
          .select({ onboardingComplete: users.onboardingComplete })
          .from(users)
          .where(eq(users.id, ownerId)),
      ]);
      assert.equal(hallAfterSubmit.status, "pending");
      assert.equal(ownerAfterSubmit.onboardingComplete, true);
    } finally {
      await db.delete(venueImages).where(eq(venueImages.venueId, legacyVenue.id));
      await db.delete(venueHalls).where(eq(venueHalls.venueId, legacyVenue.id));
      await db.delete(venues).where(eq(venues.id, legacyVenue.id));
      await db.delete(legalAcceptances).where(eq(legalAcceptances.organizationId, organization.id));
      await db.delete(partnerOrganizationMembers).where(eq(partnerOrganizationMembers.organizationId, organization.id));
      await db.delete(partnerOrganizations).where(eq(partnerOrganizations.id, organization.id));
      await db.delete(users).where(eq(users.id, ownerId));
    }
  });

  test("an OFF-era active venue keeps its completed state when attached", async () => {
    const ownerId = await createUser("flag_transition_active_owner");
    const [organization] = await db
      .insert(partnerOrganizations)
      .values({
        displayName: `${MARK} Active transition organization`,
        type: IDENTITY.partnerType,
        legalName: IDENTITY.legalName,
        idNumber: IDENTITY.idNumber,
        legalAddress: IDENTITY.legalAddress,
        status: "active",
      })
      .returning({ id: partnerOrganizations.id });
    await db.insert(partnerOrganizationMembers).values({
      organizationId: organization.id,
      userId: ownerId,
      role: "owner",
      isActive: true,
    });
    await signOrganizationContract(ownerId, organization.id);
    const [legacyVenue] = await db
      .insert(venues)
      .values({
        userId: ownerId,
        organizationId: null,
        nameRo: `${MARK} Active transition venue`,
        slug: `${MARK}_active_transition_venue`,
        phone: "+37369000134",
        city: "Chișinău",
        address: "str. Tranziție 12",
        isActive: true,
      })
      .returning({ id: venues.id });
    await db.insert(venueImages).values({
      venueId: legacyVenue.id,
      hallId: null,
      url: `https://example.com/${MARK}_active_transition_cover.jpg`,
      isCover: true,
    });
    const [legacyHall] = await db
      .insert(venueHalls)
      .values({
        venueId: legacyVenue.id,
        slug: "principal",
        nameRo: "Sala principală",
        status: "active",
        isLegacyDefault: true,
        capacityMin: 20,
        capacityMax: 140,
      })
      .returning({ id: venueHalls.id });
    await db
      .update(users)
      .set({ onboardingComplete: true, updatedAt: new Date() })
      .where(eq(users.id, ownerId));

    try {
      const attached = await saveVenueDraft(appUser(ownerId), {
        organizationId: organization.id,
        venueId: legacyVenue.id,
        name: `${MARK} Active transition venue`,
        phone: "+37369000134",
        city: "Chișinău",
        address: "str. Tranziție 12",
      });
      assert.equal(attached.ok, true, JSON.stringify(attached));
      const [[hallAfterAttach], [ownerAfterAttach]] = await Promise.all([
        db
          .select({ status: venueHalls.status })
          .from(venueHalls)
          .where(eq(venueHalls.id, legacyHall.id)),
        db
          .select({ onboardingComplete: users.onboardingComplete })
          .from(users)
          .where(eq(users.id, ownerId)),
      ]);
      assert.equal(hallAfterAttach.status, "active");
      assert.equal(ownerAfterAttach.onboardingComplete, true);

      const submitted = await submitVenueForApproval(ownerId, legacyVenue.id);
      assert.equal(submitted.ok, true, JSON.stringify(submitted));
      if (submitted.ok) assert.equal(submitted.submitted, false);
    } finally {
      await db.delete(venueImages).where(eq(venueImages.venueId, legacyVenue.id));
      await db.delete(venueHalls).where(eq(venueHalls.venueId, legacyVenue.id));
      await db.delete(venues).where(eq(venues.id, legacyVenue.id));
      await db.delete(legalAcceptances).where(eq(legalAcceptances.organizationId, organization.id));
      await db.delete(partnerOrganizationMembers).where(eq(partnerOrganizationMembers.organizationId, organization.id));
      await db.delete(partnerOrganizations).where(eq(partnerOrganizations.id, organization.id));
      await db.delete(users).where(eq(users.id, ownerId));
    }
  });

  test("an image xmin change invalidates a submit waiting on the venue lock", async () => {
    const item = await createCompleteVenue("image_changed_before_submit_lock");
    const holder = await holdVenueLock(item.venueId);
    const submitting = submitVenueForApproval(ids.attacker, item.venueId);
    try {
      await waitForVenueLockWaiters(item.venueId, 1);
      await db
        .update(venueImages)
        .set({
          url: `https://example.com/${MARK}_changed_while_submit_waited.jpg`,
        })
        .where(eq(venueImages.venueId, item.venueId));
    } finally {
      holder.release();
      await holder.done;
    }

    const submitted = await submitting;
    assert.equal(submitted.ok, false, JSON.stringify(submitted));
    if (!submitted.ok) assert.equal(submitted.code, "REGISTRATION_CHANGED");
    const [target] = await db
      .select({ status: venueHalls.status })
      .from(venueHalls)
      .where(eq(venueHalls.id, item.targetHallId));
    assert.equal(target.status, "draft");
  });

  test("submit/archive lock order: submit first wins and stale archive is rejected", async () => {
    const item = await createCompleteVenue("submit_first");
    const holder = await holdVenueLock(item.venueId);
    const submitting = submitVenueForApproval(ids.attacker, item.venueId);
    let archiving: ReturnType<typeof archiveHall> | undefined;
    try {
      await waitForVenueLockWaiters(item.venueId, 1);
      archiving = archiveHall(ids.attacker, item.targetHallId);
      await waitForLockWaiter(
        () => waitingUserLockCount(ids.attacker),
        "submit actor user lock",
      );
    } finally {
      holder.release();
      await holder.done;
    }
    assert.ok(archiving);
    const [submitted, archived] = await Promise.all([submitting, archiving]);
    assert.equal(submitted.ok, true, JSON.stringify(submitted));
    assert.equal(archived.ok, false, JSON.stringify(archived));
    if (!archived.ok) assert.equal(archived.code, "HALL_CHANGED");
    const [target] = await db
      .select({ status: venueHalls.status })
      .from(venueHalls)
      .where(eq(venueHalls.id, item.targetHallId));
    assert.equal(target.status, "pending");
  });

  test("submit/archive lock order: archive first wins and stale submit cannot revive it", async () => {
    const item = await createCompleteVenue("archive_first");
    const holder = await holdVenueLock(item.venueId);
    const archiving = archiveHall(ids.attacker, item.targetHallId);
    let submitting: ReturnType<typeof submitVenueForApproval> | undefined;
    try {
      await waitForVenueLockWaiters(item.venueId, 1);
      submitting = submitVenueForApproval(ids.attacker, item.venueId);
      await waitForLockWaiter(
        () => waitingUserLockCount(ids.attacker),
        "archive actor user lock",
      );
    } finally {
      holder.release();
      await holder.done;
    }
    assert.ok(submitting);
    const [archived, submitted] = await Promise.all([archiving, submitting]);
    assert.equal(archived.ok, true, JSON.stringify(archived));
    assert.equal(submitted.ok, false, JSON.stringify(submitted));
    if (!submitted.ok) assert.equal(submitted.code, "REGISTRATION_CHANGED");
    const [target] = await db
      .select({ status: venueHalls.status })
      .from(venueHalls)
      .where(eq(venueHalls.id, item.targetHallId));
    assert.equal(target.status, "archived");
  });

  test("fresh rejection beats a waiting stale submit; a later resubmit remains valid", async () => {
    const item = await createCompleteVenue("reject_before_stale_submit");
    const firstSubmit = await submitVenueForApproval(ids.attacker, item.venueId);
    assert.equal(firstSubmit.ok, true, JSON.stringify(firstSubmit));

    const holder = await holdVenueLock(item.venueId);
    const rejecting = rejectPartnerVenue(ids.reviewerA, item.venueId);
    let staleSubmit: ReturnType<typeof submitVenueForApproval> | undefined;
    try {
      await waitForVenueLockWaiters(item.venueId, 1);
      staleSubmit = submitVenueForApproval(ids.attacker, item.venueId);
      await waitForLockWaiter(
        () => waitingOrganizationLockCount(ids.organizationA),
        "organization legal lock",
      );
    } finally {
      holder.release();
      await holder.done;
    }
    assert.ok(staleSubmit);
    const [rejected, stale] = await Promise.all([rejecting, staleSubmit]);
    assert.equal(rejected.ok, true, JSON.stringify(rejected));
    assert.equal(stale.ok, false, JSON.stringify(stale));
    if (!stale.ok) assert.equal(stale.code, "REGISTRATION_CHANGED");

    const fresh = await submitVenueForApproval(ids.attacker, item.venueId);
    assert.equal(fresh.ok, true, JSON.stringify(fresh));
    const [target] = await db
      .select({ status: venueHalls.status })
      .from(venueHalls)
      .where(eq(venueHalls.id, item.targetHallId));
    assert.equal(target.status, "pending");
  });

  test("a stale admin decision cannot approve a newer resubmission", async () => {
    const item = await createCompleteVenue("stale_admin");
    const submitted = await submitVenueForApproval(ids.attacker, item.venueId);
    assert.equal(submitted.ok, true, JSON.stringify(submitted));

    let releaseAdmin: () => void = () => {};
    let markHeld: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      markHeld = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseAdmin = resolve;
    });
    const blocker = db.transaction(async (tx) => {
      await acquireLegalScopeLocks(tx, { userIds: [ids.reviewerA] });
      markHeld();
      await release;
    });
    await held;

    const staleApproval = approvePartnerVenue(ids.reviewerA, item.venueId);
    try {
      await waitForLockWaiter(
        () => waitingUserLockCount(ids.reviewerA),
        "stale reviewer user lock",
      );
      const rejected = await rejectPartnerVenue(ids.reviewerB, item.venueId);
      assert.equal(rejected.ok, true, JSON.stringify(rejected));
      const resubmitted = await submitVenueForApproval(ids.attacker, item.venueId);
      assert.equal(resubmitted.ok, true, JSON.stringify(resubmitted));
    } finally {
      releaseAdmin();
      await blocker;
    }

    const stale = await staleApproval;
    assert.equal(stale.ok, false, JSON.stringify(stale));
    if (!stale.ok) assert.equal(stale.code, "REGISTRATION_CHANGED");
    const [target] = await db
      .select({ status: venueHalls.status })
      .from(venueHalls)
      .where(eq(venueHalls.id, item.targetHallId));
    assert.equal(target.status, "pending");
  });

  test("an admin demoted before the decision transaction cannot decide", async () => {
    const item = await createCompleteVenue("demoted_reviewer");
    const submitted = await submitVenueForApproval(ids.attacker, item.venueId);
    assert.equal(submitted.ok, true, JSON.stringify(submitted));
    await db
      .update(users)
      .set({ role: "user", updatedAt: new Date() })
      .where(eq(users.id, ids.reviewerA));
    try {
      const decision = await approvePartnerVenue(ids.reviewerA, item.venueId);
      assert.equal(decision.ok, false, JSON.stringify(decision));
      if (!decision.ok) assert.equal(decision.code, "FORBIDDEN");
      const [target] = await db
        .select({ status: venueHalls.status })
        .from(venueHalls)
        .where(eq(venueHalls.id, item.targetHallId));
      assert.equal(target.status, "pending");
    } finally {
      await db
        .update(users)
        .set({ role: "admin", updatedAt: new Date() })
        .where(eq(users.id, ids.reviewerA));
    }
  });

  test("a non-cooperating role writer waits behind the decision actor row lock", async () => {
    const item = await createCompleteVenue("actor_row_lock");
    const submitted = await submitVenueForApproval(ids.attacker, item.venueId);
    assert.equal(submitted.ok, true, JSON.stringify(submitted));

    const baselineWaiters = await waitingRowTransactionLockCount();
    const holder = await holdVenueRowLock(item.venueId);
    const approving = approvePartnerVenue(ids.reviewerA, item.venueId);
    let demoting: Promise<unknown> | undefined;
    let holderReleased = false;
    try {
      // The decision has already reauthorized and locked reviewerA before it
      // reaches the venue row held above.
      await waitForRowTransactionLockWaiters(baselineWaiters + 1);
      demoting = (async () => {
        await db
          .update(users)
          .set({ role: "user", updatedAt: new Date() })
          .where(eq(users.id, ids.reviewerA));
      })();
      // The direct writer deliberately takes no advisory lock. Its second row
      // waiter proves SELECT FOR UPDATE, not cooperation, closes the race.
      await waitForRowTransactionLockWaiters(baselineWaiters + 2);
      holder.release();
      await holder.done;
      holderReleased = true;

      assert.ok(demoting);
      const [approved] = await Promise.all([approving, demoting]);
      assert.equal(approved.ok, true, JSON.stringify(approved));
      const [demoted] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, ids.reviewerA));
      assert.equal(demoted.role, "user");
    } finally {
      if (!holderReleased) {
        holder.release();
        await holder.done;
      }
      await Promise.allSettled([approving, ...(demoting ? [demoting] : [])]);
      await db
        .update(users)
        .set({ role: "admin", updatedAt: new Date() })
        .where(eq(users.id, ids.reviewerA));
    }
  });

  test("actor-first archive completes before a waiting membership revocation", async () => {
    const item = await createCompleteVenue("archive_before_revoke");
    const holder = await holdVenueLock(item.venueId);
    const archiving = archiveHall(ids.mutableAdmin, item.targetHallId);
    let revoking: ReturnType<typeof updateOrganizationMember> | undefined;
    try {
      await waitForVenueLockWaiters(item.venueId, 1);
      revoking = updateOrganizationMember(
        ids.attacker,
        ids.organizationA,
        ids.mutableMemberId,
        { isActive: false },
      );
      await waitForLockWaiter(
        () => waitingUserLockCount(ids.mutableAdmin),
        "mutable member user lock",
      );
    } finally {
      holder.release();
      await holder.done;
    }
    assert.ok(revoking);
    const [archived, revoked] = await Promise.all([archiving, revoking]);
    assert.equal(archived.ok, true, JSON.stringify(archived));
    assert.equal(revoked.ok, true, JSON.stringify(revoked));
    const restored = await upsertOrganizationMember(
      ids.attacker,
      ids.organizationA,
      { userId: ids.mutableAdmin, role: "admin" },
    );
    assert.equal(restored.ok, true, JSON.stringify(restored));
  });

  test("revocation-first is observed by archive after it waits for legal authority", async () => {
    const item = await createCompleteVenue("revoke_before_archive");
    let releaseRevocation: () => void = () => {};
    let markHeld: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      markHeld = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseRevocation = resolve;
    });
    const revocation = db.transaction(async (tx) => {
      await acquireLegalScopeLocks(tx, {
        userIds: [ids.attacker, ids.mutableAdmin],
        organizationIds: [ids.organizationA],
      });
      await tx
        .update(partnerOrganizationMembers)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(partnerOrganizationMembers.id, ids.mutableMemberId));
      markHeld();
      await release;
    });
    await held;

    const archiving = archiveHall(ids.mutableAdmin, item.targetHallId);
    try {
      await waitForLockWaiter(
        () => waitingUserLockCount(ids.mutableAdmin),
        "revoked actor user lock",
      );
    } finally {
      releaseRevocation();
      await revocation;
    }
    const archived = await archiving;
    assert.equal(archived.ok, false, JSON.stringify(archived));
    if (!archived.ok) assert.equal(archived.code, "FORBIDDEN");

    const restored = await upsertOrganizationMember(
      ids.attacker,
      ids.organizationA,
      { userId: ids.mutableAdmin, role: "admin" },
    );
    assert.equal(restored.ok, true, JSON.stringify(restored));
  });

  test("demoted or suspended actors cannot submit/archive", async () => {
    const demoted = await updateOrganizationMember(
      ids.attacker,
      ids.organizationA,
      ids.mutableMemberId,
      { role: "manager", isActive: true },
    );
    assert.equal(demoted.ok, true, JSON.stringify(demoted));
    const submitItem = await createCompleteVenue("demoted_submit");
    const submit = await submitVenueForApproval(ids.mutableAdmin, submitItem.venueId);
    assert.equal(submit.ok, false, JSON.stringify(submit));
    if (!submit.ok) assert.equal(submit.code, "FORBIDDEN");

    await upsertOrganizationMember(
      ids.attacker,
      ids.organizationA,
      { userId: ids.mutableAdmin, role: "admin" },
    );
    const archiveItem = await createCompleteVenue("suspended_archive");
    await db
      .update(partnerOrganizations)
      .set({ status: "suspended", updatedAt: new Date() })
      .where(eq(partnerOrganizations.id, ids.organizationA));
    const archived = await archiveHall(ids.mutableAdmin, archiveItem.targetHallId);
    assert.equal(archived.ok, false, JSON.stringify(archived));
    if (!archived.ok) assert.equal(archived.code, "FORBIDDEN");
    await db
      .update(partnerOrganizations)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(partnerOrganizations.id, ids.organizationA));
  });

  test("reject then approve reconciles a shared organization from pending to active", async () => {
    const organizationId = await createIsolatedOrganization("Reject then approve organization");
    const rejectedVenue = await createCompleteVenue(
      "organization_reject_then_approve_a",
      "draft",
      organizationId,
    );
    const approvedVenue = await createCompleteVenue(
      "organization_reject_then_approve_b",
      "draft",
      organizationId,
    );
    await db
      .update(partnerOrganizations)
      .set({ status: "draft", updatedAt: new Date() })
      .where(eq(partnerOrganizations.id, organizationId));

    const firstSubmission = await submitVenueForApproval(ids.attacker, rejectedVenue.venueId);
    const secondSubmission = await submitVenueForApproval(ids.attacker, approvedVenue.venueId);
    assert.equal(firstSubmission.ok, true, JSON.stringify(firstSubmission));
    assert.equal(secondSubmission.ok, true, JSON.stringify(secondSubmission));

    const rejected = await rejectPartnerVenue(ids.reviewerA, rejectedVenue.venueId);
    assert.equal(rejected.ok, true, JSON.stringify(rejected));
    const [afterRejection] = await db
      .select({ status: partnerOrganizations.status })
      .from(partnerOrganizations)
      .where(eq(partnerOrganizations.id, organizationId));
    assert.equal(
      afterRejection.status,
      "pending",
      "a pending sibling venue must keep the shared organization pending",
    );

    const approved = await approvePartnerVenue(ids.reviewerB, approvedVenue.venueId);
    assert.equal(approved.ok, true, JSON.stringify(approved));
    const [afterApproval] = await db
      .select({ status: partnerOrganizations.status })
      .from(partnerOrganizations)
      .where(eq(partnerOrganizations.id, organizationId));
    assert.equal(afterApproval.status, "active");
  });

  test("approve then reject keeps a shared organization active", async () => {
    const organizationId = await createIsolatedOrganization("Approve then reject organization");
    const approvedVenue = await createCompleteVenue(
      "organization_approve_then_reject_a",
      "draft",
      organizationId,
    );
    const rejectedVenue = await createCompleteVenue(
      "organization_approve_then_reject_b",
      "draft",
      organizationId,
    );
    await db
      .update(partnerOrganizations)
      .set({ status: "draft", updatedAt: new Date() })
      .where(eq(partnerOrganizations.id, organizationId));

    const firstSubmission = await submitVenueForApproval(ids.attacker, approvedVenue.venueId);
    const secondSubmission = await submitVenueForApproval(ids.attacker, rejectedVenue.venueId);
    assert.equal(firstSubmission.ok, true, JSON.stringify(firstSubmission));
    assert.equal(secondSubmission.ok, true, JSON.stringify(secondSubmission));

    const approved = await approvePartnerVenue(ids.reviewerA, approvedVenue.venueId);
    assert.equal(approved.ok, true, JSON.stringify(approved));
    const rejected = await rejectPartnerVenue(ids.reviewerB, rejectedVenue.venueId);
    assert.equal(rejected.ok, true, JSON.stringify(rejected));

    const [organization] = await db
      .select({ status: partnerOrganizations.status })
      .from(partnerOrganizations)
      .where(eq(partnerOrganizations.id, organizationId));
    assert.equal(
      organization.status,
      "active",
      "rejecting a pending sibling must not hide an already-approved venue",
    );
  });

  test("an active venue cannot archive its only active hall in favor of a pending hall", async () => {
    const item = await createCompleteVenue("active_with_pending_archive_guard", "pending");
    await db
      .update(venues)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(venues.id, item.venueId));

    const archived = await archiveHall(ids.attacker, item.siblingHallId);
    assert.equal(archived.ok, false, JSON.stringify(archived));
    if (!archived.ok) assert.equal(archived.code, "LAST_USABLE_HALL");

    const rejected = await rejectPartnerVenue(ids.reviewerA, item.venueId);
    assert.equal(rejected.ok, true, JSON.stringify(rejected));
    const [venue] = await db
      .select({ isActive: venues.isActive })
      .from(venues)
      .where(eq(venues.id, item.venueId));
    const halls = await db
      .select({ id: venueHalls.id, status: venueHalls.status })
      .from(venueHalls)
      .where(eq(venueHalls.venueId, item.venueId));
    assert.equal(venue.isActive, true);
    assert.equal(
      halls.find((hall) => hall.id === item.siblingHallId)?.status,
      "active",
    );
    assert.equal(
      halls.find((hall) => hall.id === item.targetHallId)?.status,
      "rejected",
    );
  });

  test("reject defensively deactivates an active venue that has no active halls", async () => {
    const item = await createCompleteVenue("corrupt_active_without_active_hall", "pending");
    await db
      .update(venues)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(venues.id, item.venueId));
    await db
      .update(venueHalls)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(venueHalls.id, item.siblingHallId));

    const archiveAttempt = await archiveHall(ids.attacker, item.targetHallId);
    assert.equal(archiveAttempt.ok, false, JSON.stringify(archiveAttempt));
    if (!archiveAttempt.ok) assert.equal(archiveAttempt.code, "LAST_USABLE_HALL");

    const rejected = await rejectPartnerVenue(ids.reviewerA, item.venueId);
    assert.equal(rejected.ok, true, JSON.stringify(rejected));
    const [venue] = await db
      .select({ isActive: venues.isActive })
      .from(venues)
      .where(eq(venues.id, item.venueId));
    const halls = await db
      .select({ status: venueHalls.status })
      .from(venueHalls)
      .where(eq(venueHalls.venueId, item.venueId));
    assert.equal(halls.some((hall) => hall.status === "active"), false);
    assert.equal(venue.isActive, false);
  });

  test("approval cannot activate a venue beneath a suspended or archived organization", async () => {
    for (const status of ["suspended", "archived"] as const) {
      const organizationId = await createIsolatedOrganization(`Blocked approval ${status}`);
      const item = await createCompleteVenue(
        `blocked_approval_${status}`,
        "pending",
        organizationId,
      );
      await db
        .update(partnerOrganizations)
        .set({ status, updatedAt: new Date() })
        .where(eq(partnerOrganizations.id, organizationId));

      const decision = await approvePartnerVenue(ids.reviewerA, item.venueId);
      assert.equal(decision.ok, false, JSON.stringify(decision));
      if (!decision.ok) assert.equal(decision.code, "ORGANIZATION_NOT_APPROVABLE");

      const [organization] = await db
        .select({ status: partnerOrganizations.status })
        .from(partnerOrganizations)
        .where(eq(partnerOrganizations.id, organizationId));
      const [venue] = await db
        .select({ isActive: venues.isActive })
        .from(venues)
        .where(eq(venues.id, item.venueId));
      const [hall] = await db
        .select({ status: venueHalls.status })
        .from(venueHalls)
        .where(eq(venueHalls.id, item.targetHallId));
      assert.equal(organization.status, status);
      assert.equal(venue.isActive, false);
      assert.equal(hall.status, "pending");
    }
  });

  test("submit rejects a complete organization venue that has zero halls", async () => {
    const item = await createCompleteVenue("zero_halls_submit");
    await db.delete(venueHalls).where(eq(venueHalls.venueId, item.venueId));

    const submitted = await submitVenueForApproval(ids.attacker, item.venueId);
    assert.equal(submitted.ok, false, JSON.stringify(submitted));
    if (!submitted.ok) {
      assert.equal(submitted.code, "ONBOARDING_INCOMPLETE");
      assert.ok(submitted.missing.some((missing) => missing.path === "halls"));
    }
  });

  test("a global admin cannot submit beneath a suspended or archived organization", async () => {
    for (const status of ["suspended", "archived"] as const) {
      const organizationId = await createIsolatedOrganization(`Blocked submit ${status}`);
      const item = await createCompleteVenue(
        `blocked_submit_${status}`,
        "draft",
        organizationId,
      );
      await db
        .update(partnerOrganizations)
        .set({ status, updatedAt: new Date() })
        .where(eq(partnerOrganizations.id, organizationId));

      const submitted = await submitVenueForApproval(ids.reviewerA, item.venueId);
      assert.equal(submitted.ok, false, JSON.stringify(submitted));
      if (!submitted.ok) {
        assert.equal(submitted.code, "ORGANIZATION_NOT_SUBMITTABLE");
      }
      const [hall] = await db
        .select({ status: venueHalls.status })
        .from(venueHalls)
        .where(eq(venueHalls.id, item.targetHallId));
      assert.equal(hall.status, "draft");
    }
  });

  test("legacy approval activates both the venue and its explicit default hall", async () => {
    const item = await createLegacyPendingVenue(
      "legacy_real_approval",
      ids.legacyApproveOwner,
    );
    process.env.FEATURE_MULTI_HALL = "0";
    try {
      const approved = await approvePartnerVenue(ids.reviewerA, item.venueId);
      assert.equal(approved.ok, true, JSON.stringify(approved));
      const [[venue], [hall]] = await Promise.all([
        db
          .select({ isActive: venues.isActive })
          .from(venues)
          .where(eq(venues.id, item.venueId)),
        db
          .select({ status: venueHalls.status })
          .from(venueHalls)
          .where(eq(venueHalls.id, item.hallId)),
      ]);
      assert.equal(venue.isActive, true);
      assert.equal(hall.status, "active");
    } finally {
      process.env.FEATURE_MULTI_HALL = "1";
    }
  });

  test("a repeated legacy rejection is NOT_PENDING and has no duplicate effect", async () => {
    const item = await createLegacyPendingVenue(
      "legacy_double_rejection",
      ids.legacyRejectOwner,
    );
    process.env.FEATURE_MULTI_HALL = "0";
    try {
      const first = await rejectPartnerVenue(ids.reviewerA, item.venueId);
      assert.equal(first.ok, true, JSON.stringify(first));
      const firstNotices = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(and(
          eq(notifications.userId, ids.legacyRejectOwner),
          eq(notifications.type, "registration_rejected"),
        ));
      assert.equal(firstNotices.length, 1);

      const retry = await rejectPartnerVenue(ids.reviewerA, item.venueId);
      assert.equal(retry.ok, false, JSON.stringify(retry));
      if (!retry.ok) assert.equal(retry.code, "NOT_PENDING");

      const [[venue], [hall], [owner], secondNotices] = await Promise.all([
        db
          .select({ isActive: venues.isActive })
          .from(venues)
          .where(eq(venues.id, item.venueId)),
        db
          .select({ status: venueHalls.status })
          .from(venueHalls)
          .where(eq(venueHalls.id, item.hallId)),
        db
          .select({ onboardingComplete: users.onboardingComplete })
          .from(users)
          .where(eq(users.id, ids.legacyRejectOwner)),
        db
          .select({ id: notifications.id })
          .from(notifications)
          .where(and(
            eq(notifications.userId, ids.legacyRejectOwner),
            eq(notifications.type, "registration_rejected"),
          )),
      ]);
      assert.equal(venue.isActive, false);
      assert.equal(hall.status, "rejected");
      assert.equal(owner.onboardingComplete, false);
      assert.equal(secondNotices.length, 1);
    } finally {
      process.env.FEATURE_MULTI_HALL = "1";
    }
  });

  test("registration queue follows the rollout model", async () => {
    const legacy = await createLegacyPendingVenue(
      "legacy_queue_flag",
      ids.legacyQueueOwner,
    );
    const organizationVenue = await createCompleteVenue(
      "organization_queue_flag",
      "pending",
    );
    try {
      process.env.FEATURE_MULTI_HALL = "0";
      const legacyQueue = await listPendingPartnerVenues();
      assert.ok(legacyQueue.some((row) => row.id === legacy.venueId));
      assert.equal(
        legacyQueue.some((row) => row.id === organizationVenue.venueId),
        false,
      );

      process.env.FEATURE_MULTI_HALL = "1";
      const multiHallQueue = await listPendingPartnerVenues();
      assert.ok(multiHallQueue.some((row) => row.id === legacy.venueId));
      assert.ok(multiHallQueue.some((row) => row.id === organizationVenue.venueId));
    } finally {
      process.env.FEATURE_MULTI_HALL = "1";
    }
  });

  test("submit exposes one stable generation and notifies each admin exactly once", async () => {
    const item = await createCompleteVenue("stable_submit_generation");
    const first = await submitVenueForApproval(ids.attacker, item.venueId);
    assert.equal(first.ok, true, JSON.stringify(first));
    if (!first.ok) assert.fail("the first submission must succeed");
    assert.equal(first.submitted, true);
    assert.ok(first.submissionKey.length > 0);

    const noticesFor = async (submissionKey: string) => {
      const rows = await db
        .select({
          id: notifications.id,
          userId: notifications.userId,
          dedupeKey: notifications.dedupeKey,
        })
        .from(notifications)
        .where(and(
          inArray(notifications.userId, [ids.reviewerA, ids.reviewerB]),
          eq(notifications.type, "venue_registered"),
        ));
      return rows
        .filter((row) => row.dedupeKey?.includes(submissionKey))
        .sort((left, right) => left.userId.localeCompare(right.userId));
    };

    const firstNotices = await noticesFor(first.submissionKey);
    assert.deepEqual(
      firstNotices.map((notice) => notice.userId),
      [ids.reviewerA, ids.reviewerB].sort(),
    );
    assert.equal(new Set(firstNotices.map((notice) => notice.dedupeKey)).size, 2);

    const retry = await submitVenueForApproval(ids.attacker, item.venueId);
    assert.equal(retry.ok, true, JSON.stringify(retry));
    if (!retry.ok) assert.fail("the pending retry must succeed as a no-op");
    assert.equal(retry.submitted, false);
    assert.equal(retry.submissionKey, first.submissionKey);
    assert.deepEqual(await noticesFor(retry.submissionKey), firstNotices);

    const approved = await approvePartnerVenue(ids.reviewerA, item.venueId);
    assert.equal(approved.ok, true, JSON.stringify(approved));
    const activeNoop = await submitVenueForApproval(ids.attacker, item.venueId);
    assert.equal(activeNoop.ok, true, JSON.stringify(activeNoop));
    if (!activeNoop.ok) assert.fail("an active venue submit must succeed as a no-op");
    assert.equal(activeNoop.submitted, false);
    assert.equal(activeNoop.submissionKey, first.submissionKey);
    assert.deepEqual(await noticesFor(activeNoop.submissionKey), firstNotices);
  });

  test("an organization pending state alone never queues or approves a sister venue", async () => {
    const pending = await createCompleteVenue("org_pending_source", "pending");
    const sister = await createCompleteVenue("org_pending_sister", "draft");
    await db
      .update(partnerOrganizations)
      .set({ status: "pending", updatedAt: new Date() })
      .where(eq(partnerOrganizations.id, ids.organizationA));

    const queue = await listPendingPartnerVenues();
    assert.ok(queue.some((row) => row.id === pending.venueId));
    assert.equal(queue.some((row) => row.id === sister.venueId), false);

    const decision = await approvePartnerVenue(ids.reviewerA, sister.venueId);
    assert.equal(decision.ok, false, JSON.stringify(decision));
    if (!decision.ok) assert.equal(decision.code, "NOT_PENDING");
    const [unchanged] = await db
      .select({ status: venueHalls.status })
      .from(venueHalls)
      .where(eq(venueHalls.id, sister.targetHallId));
    assert.equal(unchanged.status, "draft");
    await db
      .update(partnerOrganizations)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(partnerOrganizations.id, ids.organizationA));
  });
});
