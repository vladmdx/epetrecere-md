/**
 * ADR 0028 / Correction Pass 3 — schema & delete-safety regression (DB-level).
 *
 * Proves the CP3 structural guarantees against a real, LOCAL database:
 *   - #3 NULL-FK bypass is closed (hall_id without venue_id is rejected);
 *   - #3 deleting an organization that still owns venues is RESTRICTed;
 *   - #3 deleting a client keeps the booking + commission (client_user_id SET
 *     NULL), never 503 / never losing financial evidence;
 *   - #3 deleting a hall keeps historical bookings (hall_id SET NULL, venue_id
 *     preserved) but is RESTRICTed when the hall still has schedule blocks
 *     (hall blocks are never silently turned into whole-venue blocks).
 *
 * Safety: refuses any non-local database unless ALLOW_NONLOCAL_TEST_DB=1.
 * Run: DATABASE_URL=postgres://…localhost… npx tsx --test scripts/venue-multihall-schema-regression.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const DB_URL = process.env.DATABASE_URL ?? "";
const isLocal = /@(localhost|127\.0\.0\.1|::1)[:/]/.test(DB_URL) || /host=(localhost|127\.0\.0\.1)/.test(DB_URL);
if (!isLocal && process.env.ALLOW_NONLOCAL_TEST_DB !== "1") {
  throw new Error("Refusing to run destructive tests against a non-local database.");
}
if (/epetrecere\.md|prod/i.test(DB_URL)) throw new Error("Refusing: looks like production.");

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../src/lib/db";
import {
  users, venues, venueHalls, bookingRequests, commissions,
  venueScheduleBlocks, partnerOrganizations, partnerOrganizationMembers,
} from "../src/lib/db/schema";

// drizzle wraps the driver error as "Failed query: …"; the real Postgres
// message (constraint name, "violates …") is on `.cause`. Match either.
function rejectsWith(re: RegExp) {
  return (err: unknown) => {
    const e = err as { message?: string; cause?: { message?: string } };
    return re.test(e.message ?? "") || re.test(e.cause?.message ?? "");
  };
}

const MARK = "cp3_schema_";
const ids = { user: "", client: "", org: 0, venue: 0, hall: 0 };

before(async () => {
  const [u] = await db.insert(users).values({ clerkId: MARK + "owner", email: `${MARK}owner@example.com` }).returning({ id: users.id });
  const [c] = await db.insert(users).values({ clerkId: MARK + "client", email: `${MARK}client@example.com` }).returning({ id: users.id });
  ids.user = u.id; ids.client = c.id;
  const [o] = await db.insert(partnerOrganizations).values({ displayName: MARK + "org" }).returning({ id: partnerOrganizations.id });
  ids.org = o.id;
  await db.insert(partnerOrganizationMembers).values({ organizationId: ids.org, userId: ids.user, role: "owner" });
  const [v] = await db.insert(venues).values({ nameRo: MARK + "v", slug: MARK + "v-" + Date.now(), organizationId: ids.org, userId: ids.user }).returning({ id: venues.id });
  ids.venue = v.id;
  const [h] = await db.insert(venueHalls).values({ venueId: ids.venue, slug: "principal", nameRo: "H" }).returning({ id: venueHalls.id });
  ids.hall = h.id;
});

after(async () => {
  await db.delete(commissions).where(eq(commissions.venueId, ids.venue));
  await db.delete(venueScheduleBlocks).where(eq(venueScheduleBlocks.venueId, ids.venue));
  await db.delete(bookingRequests).where(eq(bookingRequests.venueId, ids.venue));
  await db.delete(venueHalls).where(eq(venueHalls.venueId, ids.venue));
  await db.delete(partnerOrganizationMembers).where(eq(partnerOrganizationMembers.organizationId, ids.org));
  await db.delete(venues).where(eq(venues.id, ids.venue));
  await db.delete(partnerOrganizations).where(eq(partnerOrganizations.id, ids.org));
  await db.delete(users).where(inArray(users.id, [ids.user, ids.client].filter(Boolean)));
});

test("[#3] hall_id without venue_id is rejected (CHECK)", async () => {
  await assert.rejects(
    db.execute(sql`INSERT INTO booking_requests (client_name, client_phone, event_date, hall_id, venue_id)
                   VALUES ('x','+3730', CURRENT_DATE, ${ids.hall}, NULL)`),
    rejectsWith(/hall_requires_venue|violates check/i),
  );
});

test("[#3] deleting an organization that owns a venue is RESTRICTed", async () => {
  await assert.rejects(
    db.delete(partnerOrganizations).where(eq(partnerOrganizations.id, ids.org)),
    rejectsWith(/violates foreign key|still referenced/i),
  );
});

test("[#3] deleting a client keeps the booking + commission (anonymized)", async () => {
  const [b] = await db.insert(bookingRequests).values({
    venueId: ids.venue, hallId: ids.hall, clientUserId: ids.client,
    clientName: "Client", clientPhone: "+3730", eventDate: "2027-01-01", status: "completed",
  }).returning({ id: bookingRequests.id });
  await db.insert(commissions).values({
    bookingRequestId: b.id, vendorType: "venue", venueId: ids.venue, baseAmount: 1000, amount: 50, status: "pending",
  });
  // Anonymize (as the route does) then delete the user; must not throw.
  await db.update(bookingRequests).set({ clientName: "(cont șters)", clientEmail: null }).where(eq(bookingRequests.clientUserId, ids.client));
  await db.delete(users).where(eq(users.id, ids.client));
  ids.client = ""; // consumed
  const [keptBooking] = await db.select({ id: bookingRequests.id, clientUserId: bookingRequests.clientUserId }).from(bookingRequests).where(eq(bookingRequests.id, b.id));
  assert.ok(keptBooking, "booking retained");
  assert.equal(keptBooking.clientUserId, null, "client link nulled");
  const [keptComm] = await db.select({ id: commissions.id }).from(commissions).where(eq(commissions.bookingRequestId, b.id));
  assert.ok(keptComm, "commission retained (financial evidence)");
});

test("[#3] deleting a hall keeps historical bookings (hall_id SET NULL, venue_id kept)", async () => {
  const [b] = await db.insert(bookingRequests).values({
    venueId: ids.venue, hallId: ids.hall, clientName: "C2", clientPhone: "+3730", eventDate: "2027-02-02", status: "completed",
  }).returning({ id: bookingRequests.id });
  // Fresh hall with no schedule blocks can be deleted; booking is retained.
  const [h2] = await db.insert(venueHalls).values({ venueId: ids.venue, slug: "sala2", nameRo: "H2" }).returning({ id: venueHalls.id });
  await db.update(bookingRequests).set({ hallId: h2.id }).where(eq(bookingRequests.id, b.id));
  await db.delete(venueHalls).where(eq(venueHalls.id, h2.id));
  const [kept] = await db.select({ venueId: bookingRequests.venueId, hallId: bookingRequests.hallId }).from(bookingRequests).where(eq(bookingRequests.id, b.id));
  assert.equal(kept.venueId, ids.venue, "venue_id preserved");
  assert.equal(kept.hallId, null, "hall_id set null");
});

test("[#3] deleting a hall that still has a schedule block is RESTRICTed (archive instead)", async () => {
  const [h3] = await db.insert(venueHalls).values({ venueId: ids.venue, slug: "sala3", nameRo: "H3" }).returning({ id: venueHalls.id });
  await db.insert(venueScheduleBlocks).values({
    venueId: ids.venue, hallId: h3.id,
    startsAt: new Date("2027-03-01T10:00:00Z"), endsAt: new Date("2027-03-01T12:00:00Z"), kind: "maintenance",
  });
  await assert.rejects(
    db.delete(venueHalls).where(eq(venueHalls.id, h3.id)),
    rejectsWith(/violates foreign key|still referenced/i),
  );
  // cleanup this sub-fixture
  await db.delete(venueScheduleBlocks).where(eq(venueScheduleBlocks.hallId, h3.id));
  await db.delete(venueHalls).where(eq(venueHalls.id, h3.id));
});
