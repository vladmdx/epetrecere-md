/**
 * Atomic venue-image reorder regression coverage.
 * Guarded disposable local PostgreSQL only. Run with:
 *   npx tsx scripts/run-guarded-db-test.ts scripts/venue-image-reorder-atomic-regression.test.ts
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "../src/lib/db";
import {
  partnerOrganizationMembers,
  partnerOrganizations,
  users,
  venueHalls,
  venueImages,
  venues,
} from "../src/lib/db/schema";
import {
  createVenueImage,
  deleteVenueImage,
  reorderVenueImages,
  updateVenueImage,
} from "../src/lib/partner/venue-image-writes";
import { acquireLegalScopeLocks } from "../src/lib/booking/advisory-locks";

const MARK = `image_reorder_atomic_${Date.now()}_${randomUUID().slice(0, 8)}`;
const originalMultiHallFlag = process.env.FEATURE_MULTI_HALL;

let venueId = 0;
let otherVenueId = 0;
let hallId = 0;
let actorUserId = "";
let otherOwnerUserId = "";
let organizationId = 0;
let actorMembershipId = 0;
let activeTrigger: { trigger: string; fn: string } | null = null;

type ImageRow = { id: number; sortOrder: number | null };

async function insertImages(
  targetVenueId: number,
  orders: number[],
  targetHallId: number | null = null,
): Promise<ImageRow[]> {
  return db
    .insert(venueImages)
    .values(orders.map((sortOrder, index) => ({
      venueId: targetVenueId,
      hallId: targetHallId,
      url: `https://example.com/${MARK}-${targetVenueId}-${randomUUID()}-${index}.jpg`,
      sortOrder,
    })))
    .returning({ id: venueImages.id, sortOrder: venueImages.sortOrder });
}

async function imageState(ids: number[]): Promise<ImageRow[]> {
  return db
    .select({ id: venueImages.id, sortOrder: venueImages.sortOrder })
    .from(venueImages)
    .where(inArray(venueImages.id, ids))
    .orderBy(asc(venueImages.id));
}

async function installUpdateTrigger(body: string) {
  const suffix = randomUUID().replaceAll("-", "");
  const trigger = `qa_venue_image_reorder_${suffix}`;
  const fn = `qa_venue_image_reorder_${suffix}`;
  await db.execute(sql.raw(`
    CREATE FUNCTION "${fn}"() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      ${body}
    END
    $$
  `));
  await db.execute(sql.raw(`
    CREATE TRIGGER "${trigger}"
    BEFORE UPDATE OF sort_order ON venue_images
    FOR EACH ROW EXECUTE FUNCTION "${fn}"()
  `));
  activeTrigger = { trigger, fn };
}

async function installInsertTrigger(body: string) {
  const suffix = randomUUID().replaceAll("-", "");
  const trigger = `qa_venue_image_insert_${suffix}`;
  const fn = `qa_venue_image_insert_${suffix}`;
  await db.execute(sql.raw(`
    CREATE FUNCTION "${fn}"() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      ${body}
    END
    $$
  `));
  await db.execute(sql.raw(`
    CREATE TRIGGER "${trigger}"
    BEFORE INSERT ON venue_images
    FOR EACH ROW EXECUTE FUNCTION "${fn}"()
  `));
  activeTrigger = { trigger, fn };
}

async function dropUpdateTrigger() {
  if (!activeTrigger) return;
  const { trigger, fn } = activeTrigger;
  activeTrigger = null;
  await db.execute(sql.raw(`DROP TRIGGER IF EXISTS "${trigger}" ON venue_images`));
  await db.execute(sql.raw(`DROP FUNCTION IF EXISTS "${fn}"()`));
}

describe("atomic venue-image reorder", { concurrency: false }, () => {
  before(async () => {
    process.env.FEATURE_MULTI_HALL = "1";
    const [actor, otherOwner] = await db
      .insert(users)
      .values([
        {
          clerkId: `${MARK}-actor`,
          email: `${MARK}-actor@example.com`,
          name: "Image reorder actor",
        },
        {
          clerkId: `${MARK}-other-owner`,
          email: `${MARK}-other-owner@example.com`,
          name: "Other image owner",
        },
      ])
      .returning({ id: users.id });
    actorUserId = actor.id;
    otherOwnerUserId = otherOwner.id;
    const [organization] = await db
      .insert(partnerOrganizations)
      .values({ displayName: `${MARK} organization`, status: "active" })
      .returning({ id: partnerOrganizations.id });
    organizationId = organization.id;
    const memberships = await db
      .insert(partnerOrganizationMembers)
      .values([
        {
          organizationId,
          userId: otherOwnerUserId,
          role: "owner",
          isActive: true,
        },
        {
          organizationId,
          userId: actorUserId,
          role: "admin",
          isActive: true,
        },
      ])
      .returning({ id: partnerOrganizationMembers.id, userId: partnerOrganizationMembers.userId });
    actorMembershipId = memberships.find((row) => row.userId === actorUserId)!.id;
    const [venue] = await db
      .insert(venues)
      .values({
        nameRo: `${MARK} venue`,
        slug: `${MARK}-venue`,
        userId: actorUserId,
        organizationId,
      })
      .returning({ id: venues.id });
    const [otherVenue] = await db
      .insert(venues)
      .values({ nameRo: `${MARK} other`, slug: `${MARK}-other`, userId: otherOwnerUserId })
      .returning({ id: venues.id });
    venueId = venue.id;
    otherVenueId = otherVenue.id;
    const [hall] = await db
      .insert(venueHalls)
      .values({
        venueId,
        slug: `${MARK}-hall`,
        nameRo: "Grand",
        status: "active",
      })
      .returning({ id: venueHalls.id });
    hallId = hall.id;
  });

  after(async () => {
    await dropUpdateTrigger();
    await db.delete(venueImages).where(inArray(venueImages.venueId, [venueId, otherVenueId]));
    await db.delete(venueHalls).where(eq(venueHalls.venueId, venueId));
    await db.delete(venues).where(inArray(venues.id, [venueId, otherVenueId]));
    await db
      .delete(partnerOrganizationMembers)
      .where(eq(partnerOrganizationMembers.organizationId, organizationId));
    await db.delete(partnerOrganizations).where(eq(partnerOrganizations.id, organizationId));
    await db.delete(users).where(inArray(users.id, [actorUserId, otherOwnerUserId]));
    if (originalMultiHallFlag === undefined) {
      delete process.env.FEATURE_MULTI_HALL;
    } else {
      process.env.FEATURE_MULTI_HALL = originalMultiHallFlag;
    }
  });

  test("happy reorder persists every requested sort order", async () => {
    process.env.FEATURE_MULTI_HALL = "1";
    const images = await insertImages(venueId, [10, 20, 30]);
    const requested = [
      { id: images[2]!.id, sortOrder: 0 },
      { id: images[0]!.id, sortOrder: 1 },
      { id: images[1]!.id, sortOrder: 2 },
    ];

    assert.deepEqual(await reorderVenueImages(actorUserId, venueId, requested), { ok: true });
    const actual = new Map((await imageState(images.map((row) => row.id))).map(
      (row) => [row.id, row.sortOrder],
    ));
    assert.deepEqual(
      requested.map((row) => actual.get(row.id)),
      requested.map((row) => row.sortOrder),
    );
  });

  test("a committed membership revoke wins before the image write re-authorizes", async () => {
    process.env.FEATURE_MULTI_HALL = "1";
    const deniedUrl = `https://example.com/${MARK}-revoked-write.jpg`;
    let signalRevoked!: () => void;
    let releaseRevocation!: () => void;
    const revoked = new Promise<void>((resolve) => { signalRevoked = resolve; });
    const mayCommit = new Promise<void>((resolve) => { releaseRevocation = resolve; });

    const revoking = db.transaction(async (tx) => {
      await acquireLegalScopeLocks(tx, {
        userIds: [actorUserId],
        organizationIds: [organizationId],
      });
      await tx
        .update(partnerOrganizationMembers)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(partnerOrganizationMembers.id, actorMembershipId));
      signalRevoked();
      await mayCommit;
    });
    await revoked;

    const writing = createVenueImage(actorUserId, {
      venueId,
      url: deniedUrl,
      isCover: false,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    releaseRevocation();
    await revoking;

    const result = await writing;
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.code, "FORBIDDEN");
    }
    const deniedRows = await db
      .select({ id: venueImages.id })
      .from(venueImages)
      .where(eq(venueImages.url, deniedUrl));
    assert.equal(deniedRows.length, 0);
    await db
      .update(partnerOrganizationMembers)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(partnerOrganizationMembers.id, actorMembershipId));
  });

  test("a concurrent direct organization suspension is observed under row lock", async () => {
    process.env.FEATURE_MULTI_HALL = "1";
    const deniedUrl = `https://example.com/${MARK}-suspended-write.jpg`;
    let signalSuspended!: () => void;
    let releaseSuspension!: () => void;
    const suspended = new Promise<void>((resolve) => { signalSuspended = resolve; });
    const mayCommit = new Promise<void>((resolve) => { releaseSuspension = resolve; });

    const suspending = db.transaction(async (tx) => {
      await tx
        .update(partnerOrganizations)
        .set({ status: "suspended", updatedAt: new Date() })
        .where(eq(partnerOrganizations.id, organizationId));
      signalSuspended();
      await mayCommit;
    });
    await suspended;

    const writing = createVenueImage(actorUserId, {
      venueId,
      url: deniedUrl,
      isCover: false,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    releaseSuspension();
    await suspending;
    const result = await writing;
    await db
      .update(partnerOrganizations)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(partnerOrganizations.id, organizationId));

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.code, "FORBIDDEN");
    }
    const deniedRows = await db
      .select({ id: venueImages.id })
      .from(venueImages)
      .where(eq(venueImages.url, deniedUrl));
    assert.equal(deniedRows.length, 0);
  });

  test("a suppressed cover insert rolls back the previous cover reset", async () => {
    process.env.FEATURE_MULTI_HALL = "1";
    const [cover, sibling] = await insertImages(venueId, [41, 42]);
    await db
      .update(venueImages)
      .set({ isCover: true })
      .where(eq(venueImages.id, cover.id));
    const deniedUrl = `https://example.com/${MARK}-suppressed-cover.jpg`;
    await installInsertTrigger(`
      IF NEW.url = '${deniedUrl}' THEN
        RETURN NULL;
      END IF;
      RETURN NEW;
    `);

    try {
      const result = await createVenueImage(actorUserId, {
        venueId,
        url: deniedUrl,
        isCover: true,
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.status, 409);
        assert.equal(result.code, "IMAGE_CREATE_CONFLICT");
      }
    } finally {
      await dropUpdateTrigger();
    }

    const rows = await db
      .select({ id: venueImages.id, isCover: venueImages.isCover })
      .from(venueImages)
      .where(inArray(venueImages.id, [cover.id, sibling.id]))
      .orderBy(asc(venueImages.id));
    assert.equal(rows.find((row) => row.id === cover.id)?.isCover, true);
    assert.equal(rows.find((row) => row.id === sibling.id)?.isCover, false);
    const deniedRows = await db
      .select({ id: venueImages.id })
      .from(venueImages)
      .where(eq(venueImages.url, deniedUrl));
    assert.equal(deniedRows.length, 0);
  });

  test("generic gallery creation rejects every concrete Hall scope", async () => {
    process.env.FEATURE_MULTI_HALL = "1";
    const [foreignHall] = await db
      .insert(venueHalls)
      .values({
        venueId: otherVenueId,
        slug: `${MARK}-foreign-hall`,
        nameRo: "Foreign hall",
        status: "active",
      })
      .returning({ id: venueHalls.id });
    const result = await createVenueImage(actorUserId, {
      venueId,
      hallId: foreignHall.id,
      url: `https://example.com/${MARK}-forged-hall.jpg`,
      isCover: false,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 400);
      assert.equal(result.code, "HALL_IMAGES_USE_HALL_PATCH");
    }
  });

  test("generic update/delete cannot bypass Hall moderation", async () => {
    process.env.FEATURE_MULTI_HALL = "1";
    const rejectedCreate = await createVenueImage(actorUserId, {
      venueId,
      hallId,
      url: `https://example.com/${MARK}-hall-create-rejected.jpg`,
      isCover: false,
    });
    assert.equal(rejectedCreate.ok, false);
    if (!rejectedCreate.ok) {
      assert.equal(rejectedCreate.status, 400);
      assert.equal(rejectedCreate.code, "HALL_IMAGES_USE_HALL_PATCH");
    }

    const [hallImage] = await insertImages(venueId, [91], hallId);
    const rejectedUpdate = await updateVenueImage(actorUserId, hallImage.id, {
      altRo: "Fotografie neverificată",
    });
    assert.equal(rejectedUpdate.ok, false);
    if (!rejectedUpdate.ok) {
      assert.equal(rejectedUpdate.status, 400);
      assert.equal(rejectedUpdate.code, "HALL_IMAGES_USE_HALL_PATCH");
    }
    const rejectedDelete = await deleteVenueImage(actorUserId, hallImage.id);
    assert.equal(rejectedDelete.ok, false);
    if (!rejectedDelete.ok) {
      assert.equal(rejectedDelete.status, 400);
      assert.equal(rejectedDelete.code, "HALL_IMAGES_USE_HALL_PATCH");
    }
    assert.deepEqual(await imageState([hallImage.id]), [hallImage]);
  });

  test("duplicate, foreign, and missing IDs are rejected without any writes", async () => {
    process.env.FEATURE_MULTI_HALL = "1";
    const own = await insertImages(venueId, [101, 102]);
    const [foreign] = await insertImages(otherVenueId, [201]);
    const [removed] = await insertImages(venueId, [301]);
    await db.delete(venueImages).where(eq(venueImages.id, removed.id));
    const trackedIds = [...own.map((row) => row.id), foreign.id];
    const beforeState = await imageState(trackedIds);

    const duplicate = await reorderVenueImages(actorUserId, venueId, [
      { id: own[0]!.id, sortOrder: 1 },
      { id: own[0]!.id, sortOrder: 2 },
    ]);
    assert.equal(duplicate.ok, false);
    if (!duplicate.ok) assert.equal(duplicate.status, 400);

    const mixed = await reorderVenueImages(actorUserId, venueId, [
      { id: own[0]!.id, sortOrder: 3 },
      { id: foreign.id, sortOrder: 4 },
    ]);
    assert.equal(mixed.ok, false);
    if (!mixed.ok) assert.equal(mixed.status, 409);

    const missing = await reorderVenueImages(actorUserId, venueId, [
      { id: own[1]!.id, sortOrder: 5 },
      { id: removed.id, sortOrder: 6 },
    ]);
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.status, 409);

    assert.deepEqual(await imageState(trackedIds), beforeState);
  });

  test("generic reorder rejects Hall images regardless of feature flag", async () => {
    const [general] = await insertImages(venueId, [401]);
    const [hall] = await insertImages(venueId, [402], hallId);
    const ids = [general.id, hall.id];
    const beforeState = await imageState(ids);

    delete process.env.FEATURE_MULTI_HALL;
    const blocked = await reorderVenueImages(actorUserId, venueId, [
      { id: general.id, sortOrder: 7 },
      { id: hall.id, sortOrder: 8 },
    ]);
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.equal(blocked.status, 400);
      assert.equal(blocked.code, "HALL_IMAGES_USE_HALL_PATCH");
    }
    assert.deepEqual(await imageState(ids), beforeState);
    process.env.FEATURE_MULTI_HALL = "1";
  });

  test("generic delete rejects the locked Hall image row", async () => {
    process.env.FEATURE_MULTI_HALL = "1";
    const [hallImage] = await insertImages(venueId, [451], hallId);
    delete process.env.FEATURE_MULTI_HALL;
    try {
      const result = await deleteVenueImage(actorUserId, hallImage.id);
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.status, 400);
        assert.equal(result.code, "HALL_IMAGES_USE_HALL_PATCH");
      }
      assert.deepEqual(await imageState([hallImage.id]), [hallImage]);
    } finally {
      process.env.FEATURE_MULTI_HALL = "1";
    }
  });

  test("a concurrent disappearance fails preflight without reordering survivors", async () => {
    process.env.FEATURE_MULTI_HALL = "1";
    const [survivor, disappearing] = await insertImages(venueId, [501, 502]);
    let signalDeleteStarted!: () => void;
    let allowDeleteCommit!: () => void;
    const deleteStarted = new Promise<void>((resolve) => { signalDeleteStarted = resolve; });
    const mayCommit = new Promise<void>((resolve) => { allowDeleteCommit = resolve; });

    const deleting = db.transaction(async (tx) => {
      const deleted = await tx
        .delete(venueImages)
        .where(eq(venueImages.id, disappearing.id))
        .returning({ id: venueImages.id });
      assert.deepEqual(deleted, [{ id: disappearing.id }]);
      signalDeleteStarted();
      await mayCommit;
    });
    await deleteStarted;

    const reordering = reorderVenueImages(actorUserId, venueId, [
      { id: survivor.id, sortOrder: 1 },
      { id: disappearing.id, sortOrder: 2 },
    ]);
    await new Promise<void>((resolve) => setImmediate(resolve));
    allowDeleteCommit();
    await deleting;

    const result = await reordering;
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 409);
    assert.deepEqual(await imageState([survivor.id]), [survivor]);
  });

  test("an injected update error rolls back earlier image updates", async () => {
    process.env.FEATURE_MULTI_HALL = "1";
    const [first, failing] = await insertImages(venueId, [601, 602]);
    const beforeState = await imageState([first.id, failing.id]);
    await installUpdateTrigger(`
      IF OLD.id = ${failing.id} THEN
        RAISE EXCEPTION 'forced_venue_image_reorder_failure';
      END IF;
      RETURN NEW;
    `);

    try {
      await assert.rejects(
        reorderVenueImages(actorUserId, venueId, [
          { id: first.id, sortOrder: 1 },
          { id: failing.id, sortOrder: 2 },
        ]),
        /forced_venue_image_reorder_failure/,
      );
    } finally {
      await dropUpdateTrigger();
    }
    assert.deepEqual(await imageState([first.id, failing.id]), beforeState);
  });

  test("a suppressed update is detected by affected-row count and rolls back", async () => {
    process.env.FEATURE_MULTI_HALL = "1";
    const [first, suppressed] = await insertImages(venueId, [701, 702]);
    const beforeState = await imageState([first.id, suppressed.id]);
    await installUpdateTrigger(`
      IF OLD.id = ${suppressed.id} THEN
        RETURN NULL;
      END IF;
      RETURN NEW;
    `);

    try {
      const result = await reorderVenueImages(actorUserId, venueId, [
        { id: first.id, sortOrder: 1 },
        { id: suppressed.id, sortOrder: 2 },
      ]);
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.status, 409);
        assert.equal(result.code, "REORDER_CONFLICT");
      }
    } finally {
      await dropUpdateTrigger();
    }
    assert.deepEqual(await imageState([first.id, suppressed.id]), beforeState);
  });
});
