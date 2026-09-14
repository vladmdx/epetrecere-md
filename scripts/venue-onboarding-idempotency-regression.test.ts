/**
 * Lost-response/retry regression coverage for explicit venue creation.
 * Guarded disposable local PostgreSQL only.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "../src/lib/db";
import {
  partnerOrganizationMembers,
  partnerOrganizations,
  users,
  venueImages,
  venues,
} from "../src/lib/db/schema";
import { saveVenueDraft } from "../src/lib/partner/onboarding";
import type { AppUser } from "../src/lib/venue-access";

const mark = `venue_create_idempotency_${Date.now()}_${randomUUID().slice(0, 8)}`;
const originalFlag = process.env.FEATURE_MULTI_HALL;
let ownerId = "";
let organizationId = 0;
let competingOwnerId = "";
let competingOrganizationId = 0;

function appUser(id = ownerId): AppUser {
  return { id, role: "user", isGlobalAdmin: false };
}

function payload(
  createRequestId: string,
  name = `${mark} Local`,
  targetOrganizationId = organizationId,
) {
  return {
    organizationId: targetOrganizationId,
    createIntent: true,
    createRequestId,
    name,
    phone: "+37369000123",
    city: "Chișinău",
    address: "str. Test 32",
    descriptionRo: `${mark} descriere română`,
    descriptionRu: `${mark} русское описание`,
    descriptionEn: `${mark} English description`,
    imageUrls: [`https://example.com/${mark}.jpg`],
  };
}

before(async () => {
  process.env.FEATURE_MULTI_HALL = "1";
  const rawColumns = await db.execute(sql<{ present: boolean }>`SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name='venues'
        AND column_name='onboarding_submission_id'
    ) AS present`);
  const [column] = rawColumns as unknown as Array<{ present: boolean }>;
  assert.equal(column?.present, true, "apply guarded migration 0032 before this test");

  const [owner] = await db
    .insert(users)
    .values({ clerkId: `${mark}_owner`, email: `${mark}@example.invalid`, name: "M32 Owner" })
    .returning({ id: users.id });
  ownerId = owner.id;
  const [organization] = await db
    .insert(partnerOrganizations)
    .values({ displayName: `${mark} Org`, status: "draft" })
    .returning({ id: partnerOrganizations.id });
  organizationId = organization.id;
  await db.insert(partnerOrganizationMembers).values({
    organizationId,
    userId: ownerId,
    role: "owner",
    isActive: true,
  });

  const [competingOwner] = await db
    .insert(users)
    .values({
      clerkId: `${mark}_competing_owner`,
      email: `${mark}_competing@example.invalid`,
      name: "M32 Competing Owner",
    })
    .returning({ id: users.id });
  competingOwnerId = competingOwner.id;
  const [competingOrganization] = await db
    .insert(partnerOrganizations)
    .values({ displayName: `${mark} Competing Org`, status: "draft" })
    .returning({ id: partnerOrganizations.id });
  competingOrganizationId = competingOrganization.id;
  await db.insert(partnerOrganizationMembers).values({
    organizationId: competingOrganizationId,
    userId: competingOwnerId,
    role: "owner",
    isActive: true,
  });
});

after(async () => {
  const organizationIds = [organizationId, competingOrganizationId].filter(Boolean);
  if (organizationIds.length) {
    const venueRows = await db
      .select({ id: venues.id })
      .from(venues)
      .where(inArray(venues.organizationId, organizationIds));
    const venueIds = venueRows.map((row) => row.id);
    if (venueIds.length) {
      await db.delete(venueImages).where(inArray(venueImages.venueId, venueIds));
      await db.delete(venues).where(inArray(venues.id, venueIds));
    }
  }
  if (organizationIds.length) {
    await db
      .delete(partnerOrganizationMembers)
      .where(inArray(partnerOrganizationMembers.organizationId, organizationIds));
    await db
      .delete(partnerOrganizations)
      .where(inArray(partnerOrganizations.id, organizationIds));
  }
  const ownerIds = [ownerId, competingOwnerId].filter(Boolean);
  if (ownerIds.length) await db.delete(users).where(inArray(users.id, ownerIds));
  if (originalFlag === undefined) delete process.env.FEATURE_MULTI_HALL;
  else process.env.FEATURE_MULTI_HALL = originalFlag;
});

test("concurrent retry and a later lost-response retry resolve to one venue", async () => {
  const key = randomUUID();
  const [first, concurrent] = await Promise.all([
    saveVenueDraft(appUser(), payload(key)),
    saveVenueDraft(appUser(), payload(key)),
  ]);
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(concurrent.ok, true, JSON.stringify(concurrent));
  if (!first.ok || !concurrent.ok) return;
  assert.equal(concurrent.venue.id, first.venue.id);
  const retry = await saveVenueDraft(appUser(), payload(key));
  assert.equal(retry.ok, true, JSON.stringify(retry));
  if (retry.ok) assert.equal(retry.venue.id, first.venue.id);

  const rows = await db
    .select({
      id: venues.id,
      submissionId: venues.onboardingSubmissionId,
      submissionHash: venues.onboardingSubmissionHash,
      descriptionRo: venues.descriptionRo,
      descriptionRu: venues.descriptionRu,
      descriptionEn: venues.descriptionEn,
    })
    .from(venues)
    .where(and(
      eq(venues.organizationId, organizationId),
      eq(venues.onboardingSubmissionId, key),
    ));
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.id, first.venue.id);
  assert.match(rows[0]?.submissionHash ?? "", /^[a-f0-9]{64}$/);
  assert.equal(rows[0]?.descriptionRo, `${mark} descriere română`);
  assert.equal(rows[0]?.descriptionRu, `${mark} русское описание`);
  assert.equal(rows[0]?.descriptionEn, `${mark} English description`);

  const images = await db
    .select({ id: venueImages.id })
    .from(venueImages)
    .where(eq(venueImages.venueId, first.venue.id));
  assert.equal(images.length, 1, "the transaction must not replay image writes");
});

test("the same key with different normalized input is rejected", async () => {
  const key = randomUUID();
  const first = await saveVenueDraft(appUser(), payload(key, `${mark} Original`));
  assert.equal(first.ok, true, JSON.stringify(first));
  if (!first.ok) return;
  const conflict = await saveVenueDraft(appUser(), payload(key, `${mark} Different`));
  assert.equal(conflict.ok, false);
  if (!conflict.ok) {
    assert.equal(conflict.status, 409);
    assert.equal("code" in conflict ? conflict.code : null, "IDEMPOTENCY_KEY_REUSED");
  }
  const [unchanged] = await db
    .select({ name: venues.nameRo })
    .from(venues)
    .where(eq(venues.id, first.venue.id));
  assert.equal(unchanged?.name, `${mark} Original`);
});

test("a new request key creates exactly one additional venue", async () => {
  const first = await saveVenueDraft(appUser(), payload(randomUUID(), `${mark} One`));
  const second = await saveVenueDraft(appUser(), payload(randomUUID(), `${mark} Two`));
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(second.ok, true, JSON.stringify(second));
  if (!first.ok || !second.ok) return;
  assert.notEqual(first.venue.id, second.venue.id);
});

test("two organizations creating the same venue name concurrently receive distinct slugs", async () => {
  const name = `${mark} Shared concurrent venue`;
  const [first, second] = await Promise.all([
    saveVenueDraft(appUser(ownerId), payload(randomUUID(), name, organizationId)),
    saveVenueDraft(
      appUser(competingOwnerId),
      payload(randomUUID(), name, competingOrganizationId),
    ),
  ]);
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(second.ok, true, JSON.stringify(second));
  if (!first.ok || !second.ok) return;
  assert.notEqual(first.venue.id, second.venue.id);
  assert.notEqual(first.venue.slug, second.venue.slug);
  assert.equal(first.venue.nameRo, name);
  assert.equal(second.venue.nameRo, name);
  assert.equal(first.venue.userId, null);
  assert.equal(second.venue.userId, null);
});
