/** Guarded disposable local PostgreSQL only. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { eq, inArray, sql } from "drizzle-orm";

import { db } from "../src/lib/db";
import {
  artists,
  partnerOrganizationMembers,
  partnerOrganizations,
  users,
} from "../src/lib/db/schema";
import {
  bootstrapDraftOrganization,
  createDraftOrganization,
  OrganizationDraftUpdateError,
  saveOrganizationProfile,
} from "../src/lib/partner/onboarding";
import type { AppUser } from "../src/lib/venue-access";

const mark = `org_creation_idem_${Date.now()}_${randomUUID().slice(0, 8)}`;
const userIds: string[] = [];
const organizationIds: number[] = [];

function appUser(id: string): AppUser {
  return { id, role: "user", isGlobalAdmin: false };
}

async function createUser(suffix: string): Promise<string> {
  const [user] = await db.insert(users).values({
    clerkId: `${mark}_${suffix}`,
    email: `${mark}_${suffix}@example.invalid`,
    name: `Organization ${suffix}`,
  }).returning({ id: users.id });
  userIds.push(user.id);
  return user.id;
}

function payload(requestId: string, displayName = `${mark} Organization`) {
  return {
    organizationCreateRequestId: requestId,
    type: "company" as const,
    displayName,
    legalName: `${mark} SRL`,
    billingPhone: "+373 69 000 123",
  };
}

before(async () => {
  const raw = await db.execute(sql<{ present: boolean }>`SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'partner_organizations'
      AND column_name = 'creation_request_id'
  ) AS present`);
  const [row] = raw as unknown as Array<{ present: boolean }>;
  assert.equal(row?.present, true, "apply guarded migration 0032 before this test");
});

after(async () => {
  if (organizationIds.length) {
    await db.delete(partnerOrganizationMembers).where(
      inArray(partnerOrganizationMembers.organizationId, organizationIds),
    );
    await db.delete(partnerOrganizations).where(inArray(partnerOrganizations.id, organizationIds));
  }
  if (userIds.length) await db.delete(artists).where(inArray(artists.userId, userIds));
  if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
});

test("artist identity cannot bypass the role picker to create a venue organization", async () => {
  const roleOnlyId = await createUser("artist-role-only");
  await db.update(users).set({ role: "artist" }).where(eq(users.id, roleOnlyId));
  await assert.rejects(
    () => createDraftOrganization(
      { ...appUser(roleOnlyId), role: "artist" },
      payload(randomUUID(), `${mark} Forbidden by role`),
    ),
    (error: unknown) => error instanceof OrganizationDraftUpdateError
      && error.code === "ROLE_CONFLICT" && error.status === 409,
  );

  const profileOnlyId = await createUser("artist-profile-only");
  await db.insert(artists).values({
    userId: profileOnlyId,
    nameRo: `${mark} Artist`,
    slug: `${mark}-artist-profile-only`,
  });
  await assert.rejects(
    () => createDraftOrganization(
      appUser(profileOnlyId),
      payload(randomUUID(), `${mark} Forbidden by profile`),
    ),
    (error: unknown) => error instanceof OrganizationDraftUpdateError
      && error.code === "ROLE_CONFLICT" && error.status === 409,
  );

  const editorId = await createUser("editor-role");
  await db.update(users).set({ role: "editor" }).where(eq(users.id, editorId));
  await assert.rejects(
    () => createDraftOrganization(
      { ...appUser(editorId), role: "editor" },
      payload(randomUUID(), `${mark} Forbidden editor`),
    ),
    (error: unknown) => error instanceof OrganizationDraftUpdateError
      && error.code === "PRIVILEGED_ROLE_LOCKED" && error.status === 409,
  );
});

test("same actor/key replays the original create after mutable profile edits", async () => {
  const ownerId = await createUser("replay");
  const key = randomUUID();
  const first = await createDraftOrganization(appUser(ownerId), payload(key));
  organizationIds.push(first.id);

  const saved = await saveOrganizationProfile(appUser(ownerId), first.id, {
    displayName: `${mark} Edited later`,
  });
  assert.equal(saved.ok, true, JSON.stringify(saved));

  const replay = await createDraftOrganization(appUser(ownerId), payload(key));
  assert.equal(replay.id, first.id);
  assert.equal(replay.displayName, `${mark} Edited later`);
  assert.equal(replay.creationRequestHash, first.creationRequestHash);

  await assert.rejects(
    () => createDraftOrganization(appUser(ownerId), payload(key, `${mark} Different original`)),
    (error: unknown) => error instanceof OrganizationDraftUpdateError &&
      error.code === "IDEMPOTENCY_KEY_REUSED" && error.status === 409,
  );

  await db
    .update(partnerOrganizations)
    .set({ status: "suspended", updatedAt: new Date() })
    .where(eq(partnerOrganizations.id, first.id));
  await assert.rejects(
    () => createDraftOrganization(appUser(ownerId), payload(key)),
    (error: unknown) => error instanceof OrganizationDraftUpdateError &&
      error.code === "FORBIDDEN" && error.status === 403,
  );
});

test("concurrent retry is one organization; a new key creates another", async () => {
  const ownerId = await createUser("concurrent");
  const key = randomUUID();
  const [first, second] = await Promise.all([
    createDraftOrganization(appUser(ownerId), payload(key, `${mark} Concurrent`)),
    createDraftOrganization(appUser(ownerId), payload(key, `${mark} Concurrent`)),
  ]);
  organizationIds.push(first.id);
  assert.equal(first.id, second.id);

  const distinct = await createDraftOrganization(
    appUser(ownerId),
    payload(randomUUID(), `${mark} Distinct`),
  );
  organizationIds.push(distinct.id);
  assert.notEqual(distinct.id, first.id);

  const memberships = await db.select({ organizationId: partnerOrganizationMembers.organizationId })
    .from(partnerOrganizationMembers)
    .where(eq(partnerOrganizationMembers.userId, ownerId));
  assert.deepEqual(
    memberships.map((row) => row.organizationId).sort((a, b) => a - b),
    [first.id, distinct.id].sort((a, b) => a - b),
  );
});

test("actor/key metadata never replaces live owner authorization", async () => {
  const ownerId = await createUser("revoked-owner");
  const key = randomUUID();
  const organization = await createDraftOrganization(
    appUser(ownerId),
    payload(key, `${mark} Revoked owner`),
  );
  organizationIds.push(organization.id);

  await db.update(partnerOrganizationMembers)
    .set({ role: "staff", updatedAt: new Date() })
    .where(eq(partnerOrganizationMembers.organizationId, organization.id));

  await assert.rejects(
    () => createDraftOrganization(
      appUser(ownerId),
      payload(key, `${mark} Revoked owner`),
    ),
    (error: unknown) => error instanceof OrganizationDraftUpdateError
      && error.code === "FORBIDDEN" && error.status === 403,
  );
});

test("bootstrap creates zero, resumes one unchanged, and refuses more than one", async () => {
  const ownerId = await createUser("bootstrap");
  const first = await bootstrapDraftOrganization(appUser(ownerId), {
    displayName: `${mark} Bootstrap original`,
    type: "company",
  });
  organizationIds.push(first.id);
  const resumed = await bootstrapDraftOrganization(appUser(ownerId), {
    displayName: `${mark} Must not patch`,
    type: "individual",
  });
  assert.equal(resumed.id, first.id);
  assert.equal(resumed.displayName, `${mark} Bootstrap original`);
  assert.equal(resumed.type, "company");

  const second = await createDraftOrganization(
    appUser(ownerId),
    payload(randomUUID(), `${mark} Second draft`),
  );
  organizationIds.push(second.id);
  await assert.rejects(
    () => bootstrapDraftOrganization(appUser(ownerId)),
    (error: unknown) => error instanceof OrganizationDraftUpdateError &&
      error.code === "ORGANIZATION_SELECTION_REQUIRED" && error.status === 409,
  );
});
