/**
 * ADR 0028 / Phase 2 — authorization regression for the org → venue → hall
 * membership resolver (src/lib/venue-access.ts).
 *
 * Runs against a real database (uses DATABASE_URL). Creates two isolated
 * organizations plus a legacy single-venue account, exercises the pure
 * authorizers, and asserts the IDOR guarantees from the master document:
 *   - a member of organization A can act on A's venue/hall;
 *   - a member of A is denied (403) on B's venue and on a forged hall id from B;
 *   - a legacy venues.user_id owner still works;
 *   - a global admin bypasses;
 *   - role thresholds (owner > admin > manager > staff) are honoured.
 *
 * Run: DATABASE_URL=... npx tsx --test scripts/venue-multihall-access-regression.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/lib/db";
import {
  users,
  venues,
  venueHalls,
  partnerOrganizations,
  partnerOrganizationMembers,
} from "../src/lib/db/schema";
import {
  authorizeVenueAccess,
  authorizeHallAccess,
  type AppUser,
} from "../src/lib/venue-access";

const MARK = "mh_test_";
const ids = {
  userA: "", userB: "", userL: "", staffA: "", admin: "",
  orgA: 0, orgB: 0,
  venueA: 0, venueB: 0, venueL: 0,
  hallA: 0, hallB: 0,
};

function appUser(id: string, role = "user"): AppUser {
  return { id, role, isGlobalAdmin: role === "admin" || role === "super_admin" };
}

async function mkUser(clerk: string, role: "user" | "admin" = "user") {
  const [u] = await db
    .insert(users)
    .values({ clerkId: MARK + clerk, email: `${MARK}${clerk}@example.com`, role })
    .returning({ id: users.id });
  return u.id;
}

before(async () => {
  ids.userA = await mkUser("ownerA");
  ids.userB = await mkUser("ownerB");
  ids.userL = await mkUser("ownerL");
  ids.staffA = await mkUser("staffA");
  ids.admin = await mkUser("admin", "admin");

  const [oa] = await db.insert(partnerOrganizations).values({ displayName: MARK + "A" }).returning({ id: partnerOrganizations.id });
  const [ob] = await db.insert(partnerOrganizations).values({ displayName: MARK + "B" }).returning({ id: partnerOrganizations.id });
  ids.orgA = oa.id; ids.orgB = ob.id;

  await db.insert(partnerOrganizationMembers).values([
    { organizationId: ids.orgA, userId: ids.userA, role: "owner" },
    { organizationId: ids.orgA, userId: ids.staffA, role: "staff" },
    { organizationId: ids.orgB, userId: ids.userB, role: "owner" },
  ]);

  const [va] = await db.insert(venues).values({ nameRo: MARK + "A", slug: MARK + "venue-a", organizationId: ids.orgA }).returning({ id: venues.id });
  const [vb] = await db.insert(venues).values({ nameRo: MARK + "B", slug: MARK + "venue-b", organizationId: ids.orgB }).returning({ id: venues.id });
  // Legacy account: user_id set, no organization.
  const [vl] = await db.insert(venues).values({ nameRo: MARK + "L", slug: MARK + "venue-l", userId: ids.userL }).returning({ id: venues.id });
  ids.venueA = va.id; ids.venueB = vb.id; ids.venueL = vl.id;

  const [ha] = await db.insert(venueHalls).values({ venueId: ids.venueA, slug: "principal", nameRo: "Sala A" }).returning({ id: venueHalls.id });
  const [hb] = await db.insert(venueHalls).values({ venueId: ids.venueB, slug: "principal", nameRo: "Sala B" }).returning({ id: venueHalls.id });
  ids.hallA = ha.id; ids.hallB = hb.id;
});

after(async () => {
  await db.delete(venueHalls).where(inArray(venueHalls.id, [ids.hallA, ids.hallB].filter(Boolean)));
  await db.delete(partnerOrganizationMembers).where(inArray(partnerOrganizationMembers.organizationId, [ids.orgA, ids.orgB].filter(Boolean)));
  await db.delete(venues).where(inArray(venues.id, [ids.venueA, ids.venueB, ids.venueL].filter(Boolean)));
  await db.delete(partnerOrganizations).where(inArray(partnerOrganizations.id, [ids.orgA, ids.orgB].filter(Boolean)));
  await db.delete(users).where(inArray(users.id, [ids.userA, ids.userB, ids.userL, ids.staffA, ids.admin].filter(Boolean)));
});

test("member of org A can act on A's own venue", async () => {
  const r = await authorizeVenueAccess(appUser(ids.userA), ids.venueA, "manager");
  assert.equal(r.ok, true);
  if (r.ok) { assert.equal(r.organizationId, ids.orgA); assert.equal(r.viaLegacy, false); assert.equal(r.viaAdmin, false); }
});

test("member of org A is DENIED on org B's venue (IDOR)", async () => {
  const r = await authorizeVenueAccess(appUser(ids.userA), ids.venueB, "staff");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 403);
});

test("forged hall id from org B is DENIED for a member of org A (IDOR)", async () => {
  const r = await authorizeHallAccess(appUser(ids.userA), ids.hallB, "staff");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 403);
});

test("member of org A can act on A's own hall", async () => {
  const r = await authorizeHallAccess(appUser(ids.userA), ids.hallA, "manager");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.hallId, ids.hallA);
});

test("legacy venues.user_id owner still works", async () => {
  const r = await authorizeVenueAccess(appUser(ids.userL), ids.venueL, "owner");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.viaLegacy, true);
});

test("a different user cannot reach a legacy venue", async () => {
  const r = await authorizeVenueAccess(appUser(ids.userA), ids.venueL, "staff");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 403);
});

test("global admin bypasses to any venue", async () => {
  const r = await authorizeVenueAccess(appUser(ids.admin, "admin"), ids.venueB, "owner");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.viaAdmin, true);
});

test("role threshold: staff passes 'staff' but fails 'manager'", async () => {
  const okStaff = await authorizeVenueAccess(appUser(ids.staffA), ids.venueA, "staff");
  assert.equal(okStaff.ok, true);
  const denied = await authorizeVenueAccess(appUser(ids.staffA), ids.venueA, "manager");
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.status, 403);
});

test("missing venue and hall return 404", async () => {
  const v = await authorizeVenueAccess(appUser(ids.userA), 999999, "staff");
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.status, 404);
  const h = await authorizeHallAccess(appUser(ids.userA), 999999, "staff");
  assert.equal(h.ok, false);
  if (!h.ok) assert.equal(h.status, 404);
});
