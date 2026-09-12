/**
 * ADR 0028 / Phase 2 — authorization regression for the org → venue → hall
 * membership resolver (src/lib/venue-access.ts).
 *
 * Runs against a marker-verified disposable local E2E database. Covers:
 *   - member of org A acts on A; denied on B and on a forged hall id from B;
 *   - #1 a DISABLED, DELETED or DEMOTED membership does NOT recover owner access
 *     through the legacy venues.user_id column when the venue has an org;
 *   - #11 the behaviour is switchable: with MULTI_HALL off the resolver uses the
 *     legacy owner chain only (current production behaviour);
 *   - legacy (org-less) venues, global-admin bypass, role thresholds, 404s.
 *
 * #10 test safety: refuses every non-loopback or unmarked database and never
 * touches real catalog rows — it creates and deletes isolated fixtures.
 *
 * Run: npm run test:multihall:access
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";

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
  authorizeVenueCapability,
  authorizeHallAccess,
  getVenueOwnerRecipients,
  type AppUser,
} from "../src/lib/venue-access";
import { eq, and } from "drizzle-orm";
import {
  getVenueIcalTokenForUser,
  verifyVenueIcalToken,
} from "../src/lib/calendar/ical-token";

const MARK = "mh_test_";
const ids = {
  userA: "", userB: "", userL: "", staffA: "", orgAdminA: "", admin: "",
  orgA: 0, orgB: 0,
  venueA: 0, venueB: 0, venueL: 0,
  hallA: 0, hallB: 0,
};

function appUser(id: string, role = "user"): AppUser {
  return { id, role, isGlobalAdmin: role === "admin" || role === "super_admin" };
}
function flag(on: boolean) {
  if (on) process.env.FEATURE_MULTI_HALL = "1";
  else delete process.env.FEATURE_MULTI_HALL;
}
async function mkUser(clerk: string, role: "user" | "admin" = "user") {
  const [u] = await db.insert(users)
    .values({ clerkId: MARK + clerk, email: `${MARK}${clerk}@example.com`, role })
    .returning({ id: users.id });
  return u.id;
}
async function setMembership(userId: string, orgId: number, role: "owner" | "admin" | "manager" | "staff", active: boolean) {
  await db.update(partnerOrganizationMembers)
    .set({ role, isActive: active })
    .where(and(eq(partnerOrganizationMembers.userId, userId), eq(partnerOrganizationMembers.organizationId, orgId)));
}

before(async () => {
  flag(true); // membership model on for the bulk of the suite
  ids.userA = await mkUser("ownerA");
  ids.userB = await mkUser("ownerB");
  ids.userL = await mkUser("ownerL");
  ids.staffA = await mkUser("staffA");
  ids.orgAdminA = await mkUser("orgAdminA");
  ids.admin = await mkUser("admin", "admin");

  const [oa] = await db.insert(partnerOrganizations).values({ displayName: MARK + "A" }).returning({ id: partnerOrganizations.id });
  const [ob] = await db.insert(partnerOrganizations).values({ displayName: MARK + "B" }).returning({ id: partnerOrganizations.id });
  ids.orgA = oa.id; ids.orgB = ob.id;

  await db.insert(partnerOrganizationMembers).values([
    { organizationId: ids.orgA, userId: ids.userA, role: "owner" },
    { organizationId: ids.orgA, userId: ids.staffA, role: "staff" },
    { organizationId: ids.orgA, userId: ids.orgAdminA, role: "admin" },
    { organizationId: ids.orgB, userId: ids.userB, role: "owner" },
  ]);

  // venueA has BOTH an org AND a legacy user_id = userA, so we can prove that a
  // disabled/removed/demoted membership is not rescued by the legacy column.
  const [va] = await db.insert(venues).values({ nameRo: MARK + "A", slug: MARK + "venue-a", organizationId: ids.orgA, userId: ids.userA }).returning({ id: venues.id });
  const [vb] = await db.insert(venues).values({ nameRo: MARK + "B", slug: MARK + "venue-b", organizationId: ids.orgB, userId: ids.userB }).returning({ id: venues.id });
  const [vl] = await db.insert(venues).values({ nameRo: MARK + "L", slug: MARK + "venue-l", userId: ids.userL }).returning({ id: venues.id }); // org-less legacy
  ids.venueA = va.id; ids.venueB = vb.id; ids.venueL = vl.id;

  const [ha] = await db.insert(venueHalls).values({ venueId: ids.venueA, slug: "principal", nameRo: "Sala A" }).returning({ id: venueHalls.id });
  const [hb] = await db.insert(venueHalls).values({ venueId: ids.venueB, slug: "principal", nameRo: "Sala B" }).returning({ id: venueHalls.id });
  ids.hallA = ha.id; ids.hallB = hb.id;
});

after(async () => {
  flag(false);
  await db.delete(venueHalls).where(inArray(venueHalls.id, [ids.hallA, ids.hallB].filter(Boolean)));
  await db.delete(partnerOrganizationMembers).where(inArray(partnerOrganizationMembers.organizationId, [ids.orgA, ids.orgB].filter(Boolean)));
  await db.delete(venues).where(inArray(venues.id, [ids.venueA, ids.venueB, ids.venueL].filter(Boolean)));
  await db.delete(partnerOrganizations).where(inArray(partnerOrganizations.id, [ids.orgA, ids.orgB].filter(Boolean)));
  await db.delete(users).where(inArray(users.id, [ids.userA, ids.userB, ids.userL, ids.staffA, ids.orgAdminA, ids.admin].filter(Boolean)));
});

test("[flag on] owner member can act on own venue", async () => {
  flag(true);
  const r = await authorizeVenueAccess(appUser(ids.userA), ids.venueA, "manager");
  assert.equal(r.ok, true);
  if (r.ok) { assert.equal(r.viaLegacy, false); assert.equal(r.viaAdmin, false); }
});

test("[flag on] cross-org access is denied (IDOR)", async () => {
  flag(true);
  const r = await authorizeVenueAccess(appUser(ids.userA), ids.venueB, "staff");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 403);
});

test("[flag on] forged hall id from another org is denied (IDOR)", async () => {
  flag(true);
  const r = await authorizeHallAccess(appUser(ids.userA), ids.hallB, "staff");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 403);
});

test("[#1] DISABLED membership does not recover owner access via legacy user_id", async () => {
  flag(true);
  await setMembership(ids.userA, ids.orgA, "owner", false); // deactivate
  const r = await authorizeVenueAccess(appUser(ids.userA), ids.venueA, "staff");
  assert.equal(r.ok, false, "disabled member must be denied even though venue.user_id === user");
  if (!r.ok) assert.equal(r.status, 403);
  await setMembership(ids.userA, ids.orgA, "owner", true); // restore
});

test("[#1] DELETED membership does not recover owner access via legacy user_id", async () => {
  flag(true);
  await db.delete(partnerOrganizationMembers).where(and(eq(partnerOrganizationMembers.userId, ids.userA), eq(partnerOrganizationMembers.organizationId, ids.orgA)));
  const r = await authorizeVenueAccess(appUser(ids.userA), ids.venueA, "staff");
  assert.equal(r.ok, false, "removed member must be denied even though venue.user_id === user");
  if (!r.ok) assert.equal(r.status, 403);
  await db.insert(partnerOrganizationMembers).values({ organizationId: ids.orgA, userId: ids.userA, role: "owner" }); // restore
});

test("[#1] DEMOTED member cannot perform owner-level actions", async () => {
  flag(true);
  await setMembership(ids.userA, ids.orgA, "staff", true); // demote
  const ownerLevel = await authorizeVenueAccess(appUser(ids.userA), ids.venueA, "owner");
  assert.equal(ownerLevel.ok, false);
  if (!ownerLevel.ok) assert.equal(ownerLevel.status, 403);
  const staffLevel = await authorizeVenueAccess(appUser(ids.userA), ids.venueA, "staff");
  assert.equal(staffLevel.ok, true);
  await setMembership(ids.userA, ids.orgA, "owner", true); // restore
});

test("[#11 flag off] resolver uses legacy owner chain only (switchable)", async () => {
  flag(false);
  // Legacy owner still works (current production behaviour)…
  const legacy = await authorizeVenueAccess(appUser(ids.userA), ids.venueA, "owner");
  assert.equal(legacy.ok, true);
  if (legacy.ok) assert.equal(legacy.viaLegacy, true);
  // …but a pure member with no legacy user_id is ignored while the flag is off.
  const memberOnly = await authorizeVenueAccess(appUser(ids.staffA), ids.venueA, "staff");
  assert.equal(memberOnly.ok, false);
  flag(true);
});

test("[flag on] role threshold: staff passes 'staff', fails 'manager'", async () => {
  flag(true);
  const okStaff = await authorizeVenueAccess(appUser(ids.staffA), ids.venueA, "staff");
  assert.equal(okStaff.ok, true);
  const denied = await authorizeVenueAccess(appUser(ids.staffA), ids.venueA, "manager");
  assert.equal(denied.ok, false);
});

test("capability matrix keeps profile/financial actions owner-admin only", async () => {
  flag(true);
  assert.equal((await authorizeVenueCapability(appUser(ids.orgAdminA), ids.venueA, "manage_profile")).ok, true);
  assert.equal((await authorizeVenueCapability(appUser(ids.staffA), ids.venueA, "manage_profile")).ok, false);
  assert.equal((await authorizeVenueCapability(appUser(ids.staffA), ids.venueA, "manage_financials")).ok, false);
  assert.equal((await authorizeVenueCapability(appUser(ids.staffA), ids.venueA, "view_private")).ok, true);
});

test("suspended organization denies members and owner notifications", async () => {
  flag(true);
  await db.update(partnerOrganizations).set({ status: "suspended" }).where(eq(partnerOrganizations.id, ids.orgA));
  assert.equal((await authorizeVenueAccess(appUser(ids.userA), ids.venueA, "staff")).ok, false);
  assert.deepEqual(await getVenueOwnerRecipients(ids.venueA), []);
  await db.update(partnerOrganizations).set({ status: "active" }).where(eq(partnerOrganizations.id, ids.orgA));
});

test("owner notifications include active owner/admin, never staff", async () => {
  flag(true);
  const recipients = await getVenueOwnerRecipients(ids.venueA);
  assert.deepEqual(
    new Set(recipients.map((recipient) => recipient.userId)),
    new Set([ids.userA, ids.orgAdminA]),
  );
});

test("venue iCal token is revoked with membership access", async () => {
  flag(true);
  process.env.ICAL_SECRET = "cp4-local-test-secret-at-least-32-bytes";
  const token = await getVenueIcalTokenForUser(ids.venueA, ids.userA);
  assert.ok(token);
  assert.equal(await verifyVenueIcalToken(ids.venueA, token), true);
  await setMembership(ids.userA, ids.orgA, "owner", false);
  assert.equal(await verifyVenueIcalToken(ids.venueA, token), false);
  await setMembership(ids.userA, ids.orgA, "owner", true);
});

test("[flag on] legacy org-less venue works via user_id fallback", async () => {
  flag(true);
  const r = await authorizeVenueAccess(appUser(ids.userL), ids.venueL, "owner");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.viaLegacy, true);
});

test("global admin bypasses to any venue", async () => {
  flag(true);
  const r = await authorizeVenueAccess(appUser(ids.admin, "admin"), ids.venueB, "owner");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.viaAdmin, true);
});

test("missing venue and hall return 404", async () => {
  flag(true);
  const v = await authorizeVenueAccess(appUser(ids.userA), 999999, "staff");
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.status, 404);
  const h = await authorizeHallAccess(appUser(ids.userA), 999999, "staff");
  assert.equal(h.ok, false);
  if (!h.ok) assert.equal(h.status, 404);
});
