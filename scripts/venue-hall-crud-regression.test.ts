/**
 * Guarded Hall CRUD/idempotency/concurrency regression.
 * Run only through scripts/run-guarded-db-test.ts against a disposable DB.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { and, eq, inArray } from "drizzle-orm";

import { acquireAvailabilityLocks } from "../src/lib/booking/advisory-locks";
import { db } from "../src/lib/db";
import {
  partnerOrganizationMembers,
  partnerOrganizations,
  users,
  venueHallMenuSets,
  venueHallSeatingOptions,
  venueHalls,
  venueImages,
  venueMenuSets,
  venues,
} from "../src/lib/db/schema";
import {
  createHallDraft,
  patchHallDraft,
} from "../src/lib/partner/hall-writes";

const MARK = `hall_crud_${Date.now()}_${randomUUID().slice(0, 8)}`;
const originalFlag = process.env.FEATURE_MULTI_HALL;

const ids = {
  owner: "",
  outsider: "",
  globalAdmin: "",
  organizationA: 0,
  organizationB: 0,
  venueA: 0,
  venueB: 0,
  menuA: 0,
  menuB: 0,
};
const createdVenueIds: number[] = [];

async function createUser(suffix: string, role: "user" | "admin" = "user") {
  const [row] = await db
    .insert(users)
    .values({
      clerkId: `${MARK}_${suffix}`,
      email: `${MARK}_${suffix}@example.invalid`,
      name: suffix,
      role,
    })
    .returning({ id: users.id });
  assert.ok(row);
  return row.id;
}

async function createVenue(organizationId: number, suffix: string) {
  const [venue] = await db
    .insert(venues)
    .values({
      organizationId,
      userId: null,
      nameRo: `${MARK} ${suffix}`,
      slug: `${MARK}-${suffix}`,
      capacityMin: null,
      capacityMax: null,
      isActive: false,
    })
    .returning({ id: venues.id });
  assert.ok(venue);
  createdVenueIds.push(venue.id);
  return venue.id;
}

function createPayload(
  venueId: number,
  requestId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    venueId,
    hallCreateRequestId: requestId,
    nameRo: "Sala identică",
    capacityMin: 20,
    capacityMax: 120,
    ...overrides,
  };
}

async function hallCountForRequest(venueId: number, requestId: string) {
  return db
    .select({ id: venueHalls.id })
    .from(venueHalls)
    .where(and(
      eq(venueHalls.venueId, venueId),
      eq(venueHalls.creationRequestId, requestId),
    ));
}

describe("transactional Hall CRUD", { concurrency: false }, () => {
  before(async () => {
    process.env.FEATURE_MULTI_HALL = "1";
    ids.owner = await createUser("owner");
    ids.outsider = await createUser("outsider");
    ids.globalAdmin = await createUser("global_admin", "admin");

    const organizations = await db
      .insert(partnerOrganizations)
      .values([
        { displayName: `${MARK} A`, status: "active" },
        { displayName: `${MARK} B`, status: "active" },
      ])
      .returning({ id: partnerOrganizations.id });
    assert.equal(organizations.length, 2);
    ids.organizationA = organizations[0]!.id;
    ids.organizationB = organizations[1]!.id;
    await db.insert(partnerOrganizationMembers).values([
      {
        organizationId: ids.organizationA,
        userId: ids.owner,
        role: "owner",
        isActive: true,
      },
      {
        organizationId: ids.organizationB,
        userId: ids.outsider,
        role: "owner",
        isActive: true,
      },
    ]);
    ids.venueA = await createVenue(ids.organizationA, "venue-a");
    ids.venueB = await createVenue(ids.organizationB, "venue-b");
    const menuSets = await db
      .insert(venueMenuSets)
      .values([
        { venueId: ids.venueA, nameRo: "Meniu A" },
        { venueId: ids.venueB, nameRo: "Meniu B" },
      ])
      .returning({ id: venueMenuSets.id, venueId: venueMenuSets.venueId });
    ids.menuA = menuSets.find((row) => row.venueId === ids.venueA)!.id;
    ids.menuB = menuSets.find((row) => row.venueId === ids.venueB)!.id;
  });

  after(async () => {
    if (createdVenueIds.length > 0) {
      await db.delete(venues).where(inArray(venues.id, createdVenueIds));
    }
    const organizationIds = [ids.organizationA, ids.organizationB].filter(Boolean);
    if (organizationIds.length > 0) {
      await db
        .delete(partnerOrganizationMembers)
        .where(inArray(partnerOrganizationMembers.organizationId, organizationIds));
      await db
        .delete(partnerOrganizations)
        .where(inArray(partnerOrganizations.id, organizationIds));
    }
    const userIds = [ids.owner, ids.outsider, ids.globalAdmin].filter(Boolean);
    if (userIds.length > 0) await db.delete(users).where(inArray(users.id, userIds));
    if (originalFlag === undefined) delete process.env.FEATURE_MULTI_HALL;
    else process.env.FEATURE_MULTI_HALL = originalFlag;
  });

  test("concurrent retry/lost response resolves one row; new keys keep same-name halls distinct", async () => {
    const venueId = await createVenue(ids.organizationA, "retry");
    const requestId = randomUUID();
    const payload = createPayload(venueId, requestId);
    const [left, right] = await Promise.all([
      createHallDraft(ids.owner, payload),
      createHallDraft(ids.owner, payload),
    ]);
    assert.equal(left.ok, true, JSON.stringify(left));
    assert.equal(right.ok, true, JSON.stringify(right));
    if (!left.ok || !right.ok) return;
    assert.equal(left.hall.id, right.hall.id);
    assert.equal((await hallCountForRequest(venueId, requestId)).length, 1);

    const conflict = await createHallDraft(ids.owner, {
      ...payload,
      capacityMax: 121,
    });
    assert.equal(conflict.ok, false, JSON.stringify(conflict));
    if (!conflict.ok) assert.equal(conflict.code, "IDEMPOTENCY_KEY_REUSED");

    const distinct = await createHallDraft(
      ids.owner,
      createPayload(venueId, randomUUID()),
    );
    assert.equal(distinct.ok, true, JSON.stringify(distinct));
    if (!distinct.ok) return;
    assert.notEqual(distinct.hall.id, left.hall.id);
    assert.equal(distinct.hall.nameRo, left.hall.nameRo);
    assert.notEqual(distinct.hall.slug, left.hall.slug);
  });

  test("PATCH preserves omitted children and explicit empty arrays clear them", async () => {
    const venueId = ids.venueA;
    const created = await createHallDraft(ids.owner, createPayload(
      venueId,
      randomUUID(),
      {
        nameRo: "Sala cu copii",
        imageUrls: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
        seating: [
          { type: "theatre", capacityMin: 20, capacityMax: 100 },
          { type: "banquet", capacityMin: 10, capacityMax: 80 },
        ],
        inheritMenu: false,
        menuSetIds: [ids.menuA],
      },
    ));
    assert.equal(created.ok, true, JSON.stringify(created));
    if (!created.ok) return;

    const scalarPatch = await patchHallDraft(ids.owner, venueId, created.hall.id, {
      descriptionRo: "Descriere nouă",
    });
    assert.equal(scalarPatch.ok, true, JSON.stringify(scalarPatch));
    assert.equal((await db.select().from(venueImages)
      .where(eq(venueImages.hallId, created.hall.id))).length, 2);
    assert.equal((await db.select().from(venueHallSeatingOptions)
      .where(eq(venueHallSeatingOptions.hallId, created.hall.id))).length, 2);
    assert.equal((await db.select().from(venueHallMenuSets)
      .where(eq(venueHallMenuSets.hallId, created.hall.id))).length, 1);

    const cleared = await patchHallDraft(ids.owner, venueId, created.hall.id, {
      imageUrls: [],
      seating: [],
      inheritMenu: true,
      menuSetIds: [],
    });
    assert.equal(cleared.ok, true, JSON.stringify(cleared));
    assert.equal((await db.select().from(venueImages)
      .where(eq(venueImages.hallId, created.hall.id))).length, 0);
    assert.equal((await db.select().from(venueHallSeatingOptions)
      .where(eq(venueHallSeatingOptions.hallId, created.hall.id))).length, 0);
    assert.equal((await db.select().from(venueHallMenuSets)
      .where(eq(venueHallMenuSets.hallId, created.hall.id))).length, 0);
  });

  test("cross-venue menu failure rolls back Hall and compatibility capacity", async () => {
    const venueId = await createVenue(ids.organizationA, "rollback");
    const requestId = randomUUID();
    const failed = await createHallDraft(ids.owner, createPayload(
      venueId,
      requestId,
      { inheritMenu: false, menuSetIds: [ids.menuB] },
    ));
    assert.equal(failed.ok, false, JSON.stringify(failed));
    if (!failed.ok) assert.equal(failed.code, "MENU_SET_VENUE_MISMATCH");
    assert.equal((await hallCountForRequest(venueId, requestId)).length, 0);
    const [venue] = await db
      .select({ capacityMin: venues.capacityMin, capacityMax: venues.capacityMax })
      .from(venues)
      .where(eq(venues.id, venueId));
    assert.equal(venue?.capacityMin, null);
    assert.equal(venue?.capacityMax, null);
  });

  test("status, IDOR, feature flag, membership, and suspended-org gates are fail closed", async () => {
    const venueId = await createVenue(ids.organizationA, "gates");
    const created = await createHallDraft(
      ids.owner,
      createPayload(venueId, randomUUID(), { nameRo: "Sala gates" }),
    );
    assert.equal(created.ok, true, JSON.stringify(created));
    if (!created.ok) return;

    const crossVenue = await patchHallDraft(
      ids.owner,
      ids.venueB,
      created.hall.id,
      { sortOrder: 3 },
    );
    assert.equal(crossVenue.ok, false);
    if (!crossVenue.ok) assert.equal(crossVenue.code, "HALL_NOT_FOUND");

    const outsider = await patchHallDraft(
      ids.outsider,
      venueId,
      created.hall.id,
      { sortOrder: 3 },
    );
    assert.equal(outsider.ok, false);
    if (!outsider.ok) assert.equal(outsider.code, "FORBIDDEN");

    for (const status of ["pending", "suspended", "archived"] as const) {
      await db.update(venueHalls).set({ status }).where(eq(venueHalls.id, created.hall.id));
      const blocked = await patchHallDraft(ids.owner, venueId, created.hall.id, {
        sortOrder: 4,
      });
      assert.equal(blocked.ok, false, `${status}: ${JSON.stringify(blocked)}`);
      if (!blocked.ok) {
        assert.equal(blocked.code, "HALL_NOT_EDITABLE");
        assert.equal(blocked.hallStatus, status);
      }
    }

    await db.update(venueHalls).set({ status: "draft" }).where(eq(venueHalls.id, created.hall.id));
    await db.update(partnerOrganizationMembers)
      .set({ isActive: false })
      .where(and(
        eq(partnerOrganizationMembers.organizationId, ids.organizationA),
        eq(partnerOrganizationMembers.userId, ids.owner),
      ));
    const revoked = await patchHallDraft(ids.owner, venueId, created.hall.id, {
      sortOrder: 5,
    });
    assert.equal(revoked.ok, false);
    if (!revoked.ok) assert.equal(revoked.code, "FORBIDDEN");
    await db.update(partnerOrganizationMembers)
      .set({ isActive: true })
      .where(and(
        eq(partnerOrganizationMembers.organizationId, ids.organizationA),
        eq(partnerOrganizationMembers.userId, ids.owner),
      ));

    await db.update(partnerOrganizations)
      .set({ status: "suspended" })
      .where(eq(partnerOrganizations.id, ids.organizationA));
    const adminBlocked = await patchHallDraft(
      ids.globalAdmin,
      venueId,
      created.hall.id,
      { sortOrder: 6 },
    );
    assert.equal(adminBlocked.ok, false);
    if (!adminBlocked.ok) assert.equal(adminBlocked.code, "ORGANIZATION_NOT_EDITABLE");
    await db.update(partnerOrganizations)
      .set({ status: "active" })
      .where(eq(partnerOrganizations.id, ids.organizationA));

    process.env.FEATURE_MULTI_HALL = "0";
    const flagBlocked = await patchHallDraft(ids.owner, venueId, created.hall.id, {
      sortOrder: 7,
    });
    assert.equal(flagBlocked.ok, false);
    if (!flagBlocked.ok) assert.equal(flagBlocked.code, "FEATURE_DISABLED");
    process.env.FEATURE_MULTI_HALL = "1";
  });

  test("active moderation and submit-first locking have deterministic status outcomes", async () => {
    const venueId = await createVenue(ids.organizationA, "status-race");
    const created = await createHallDraft(
      ids.owner,
      createPayload(venueId, randomUUID(), { nameRo: "Sala status" }),
    );
    assert.equal(created.ok, true, JSON.stringify(created));
    if (!created.ok) return;
    await db.update(venues)
      .set({ isActive: true, capacityMin: 50, capacityMax: 200 })
      .where(eq(venues.id, venueId));
    await db.update(venueHalls).set({ status: "active" })
      .where(eq(venueHalls.id, created.hall.id));

    const operational = await patchHallDraft(ids.owner, venueId, created.hall.id, {
      bufferMinutes: 45,
    });
    assert.equal(operational.ok, true, JSON.stringify(operational));
    if (operational.ok) assert.equal(operational.hall.status, "active");

    const moderated = await patchHallDraft(ids.owner, venueId, created.hall.id, {
      nameRo: "Sala status public nou",
      capacityMin: 70,
      capacityMax: 180,
    });
    assert.equal(moderated.ok, true, JSON.stringify(moderated));
    if (moderated.ok) assert.equal(moderated.hall.status, "draft");
    const [stillPublicVenue] = await db.select({
      isActive: venues.isActive,
      capacityMin: venues.capacityMin,
      capacityMax: venues.capacityMax,
    })
      .from(venues).where(eq(venues.id, venueId));
    assert.equal(stillPublicVenue?.isActive, false,
      "a venue with no remaining active Hall must not stay public");
    assert.equal(stillPublicVenue?.capacityMin, 50,
      "draft Hall values must not leak into public compatibility fields");
    assert.equal(stillPublicVenue?.capacityMax, 200);

    let release!: () => void;
    let held!: () => void;
    const lockHeld = new Promise<void>((resolve) => { held = resolve; });
    const releaseLock = new Promise<void>((resolve) => { release = resolve; });
    const submitWinner = db.transaction(async (tx) => {
      await acquireAvailabilityLocks(tx, {
        venueId,
        hallIds: [created.hall.id],
        localDates: [],
        conflictGroupIds: [],
      });
      await tx.update(venueHalls).set({ status: "pending", updatedAt: new Date() })
        .where(eq(venueHalls.id, created.hall.id));
      held();
      await releaseLock;
    });
    await lockHeld;
    const edit = patchHallDraft(ids.owner, venueId, created.hall.id, { sortOrder: 99 });
    await new Promise((resolve) => setTimeout(resolve, 30));
    release();
    await submitWinner;
    const editResult = await edit;
    assert.equal(editResult.ok, false, JSON.stringify(editResult));
    if (!editResult.ok) {
      assert.equal(editResult.code, "HALL_NOT_EDITABLE");
      assert.equal(editResult.hallStatus, "pending");
    }
  });
});
