/**
 * Simple corrections A–E on the 6d5bec5 tree.
 * Guarded disposable local DB only.
 */
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";

import { db } from "../src/lib/db";
import {
  artists,
  bookingRequests,
  conversations,
  partnerOrganizationMembers,
  partnerOrganizations,
  users,
  venueHallConflictGroupMembers,
  venueHallConflictGroups,
  venueHalls,
  venueImages,
  venueScheduleBlocks,
  venues,
} from "../src/lib/db/schema";
import { type AppUser } from "../src/lib/venue-access";
import {
  archiveHall,
  ensureDraftOrganization,
  isUsableHallStatus,
  replaceVenueImages,
  saveVenueDraft,
} from "../src/lib/partner/onboarding";
import { approvePartnerVenue, rejectPartnerVenue } from "../src/lib/partner/registration-decision";
import { reorderVenueImages } from "../src/lib/partner/venue-image-writes";
import { evaluateVenueAvailability } from "../src/lib/booking/venue-availability";
import { canonicalVenueInterval, zonedWallTimeToUtc } from "../src/lib/booking/zoned-interval";
import { classifyVenueScheduleBlockIcal } from "../src/lib/booking/venue-schedule-block-ical";
import {
  findOrCreateConversation,
  findOrCreateConversationForBooking,
} from "../src/lib/conversations/find-or-create";
import { conversationHasExclusiveParty } from "../src/lib/conversations/party";
import { MultiHallFeatureDisabledError } from "../src/lib/partner/multi-hall-gate";
import { GET as venueIcalGet } from "../src/app/api/calendar/venue-ical/[venueId]/[token]/route";
import { getVenueIcalTokenForUser } from "../src/lib/calendar/ical-token";
import { NextRequest } from "next/server";

const MARK = `sc_${Date.now()}_`;
const PHONE = "+37369123456";
const TZ = "Europe/Chisinau";

const ids = {
  owner: "",
  reviewer: "",
  client: "",
  artistUser: "",
  org: 0,
  venue: 0,
  venue2: 0,
  hallA: 0,
  hallB: 0,
  artist: 0,
};

function flagOn() {
  process.env.FEATURE_MULTI_HALL = "1";
}
function flagOff() {
  delete process.env.FEATURE_MULTI_HALL;
}
function appUser(id: string): AppUser {
  return { id, role: "user", isGlobalAdmin: false };
}

async function mkUser(suffix: string, phone?: string) {
  const [u] = await db
    .insert(users)
    .values({
      clerkId: MARK + suffix,
      email: `${MARK}${suffix}@example.com`,
      name: suffix,
      phone,
    })
    .returning({ id: users.id });
  return u.id;
}

const venueFields = {
  phone: PHONE,
  city: "Chișinău",
  address: "str. București 10",
  imageUrls: ["https://example.com/a.jpg"],
};

describe("simple corrections A–E", { concurrency: false }, () => {
before(async () => {
  flagOn();
  // Disposable snapshots can lag schema.ts (artist_name_snapshot on 6d5bec5).
  await db.execute(sql`ALTER TABLE booking_requests ADD COLUMN IF NOT EXISTS artist_name_snapshot text`);
  ids.owner = await mkUser("owner", "+37369111111");
  ids.reviewer = await mkUser("reviewer");
  await db.update(users).set({ role: "admin" }).where(eq(users.id, ids.reviewer));
  ids.client = await mkUser("client");
  ids.artistUser = await mkUser("artist");
  const [artist] = await db
    .insert(artists)
    .values({ userId: ids.artistUser, nameRo: MARK + "DJ", slug: MARK + "dj" })
    .returning({ id: artists.id });
  ids.artist = artist.id;
});

after(async () => {
  await db.delete(conversations).where(eq(conversations.clientUserId, ids.client));
  const venueIds = [ids.venue, ids.venue2].filter(Boolean);
  if (venueIds.length) {
    await db.delete(bookingRequests).where(inArray(bookingRequests.venueId, venueIds));
    await db.delete(venueScheduleBlocks).where(inArray(venueScheduleBlocks.venueId, venueIds));
    await db.delete(venueImages).where(inArray(venueImages.venueId, venueIds));
    await db.delete(venueHallConflictGroupMembers).where(inArray(venueHallConflictGroupMembers.venueId, venueIds));
    await db.delete(venueHallConflictGroups).where(inArray(venueHallConflictGroups.venueId, venueIds));
    await db.delete(venueHalls).where(inArray(venueHalls.venueId, venueIds));
    await db.delete(venues).where(inArray(venues.id, venueIds));
  }
  await db.delete(bookingRequests).where(eq(bookingRequests.artistId, ids.artist));
  if (ids.artist) await db.delete(artists).where(eq(artists.id, ids.artist));
  if (ids.org) {
    await db.delete(partnerOrganizationMembers).where(eq(partnerOrganizationMembers.organizationId, ids.org));
  }
});

test("A: fresh role stub → save reuses venue; retry is idempotent; intent=create is second local", async () => {
  flagOn();
  const [stub] = await db
    .insert(venues)
    .values({
      userId: ids.owner,
      nameRo: "Sală nouă",
      slug: MARK + "stub",
      phone: "",
      city: "Chișinău",
      isActive: false,
      isFeatured: true,
      facilities: [],
    })
    .returning({ id: venues.id });
  const org = await ensureDraftOrganization(appUser(ids.owner), {
    displayName: MARK + "Org",
    type: "company",
  });
  ids.org = org.id;
  await db.update(venues).set({ organizationId: org.id, updatedAt: new Date() }).where(eq(venues.id, stub.id));
  ids.venue = stub.id;

  const orgs = await db.select({ id: partnerOrganizations.id }).from(partnerOrganizations).where(eq(partnerOrganizations.id, org.id));
  const memberships = await db
    .select()
    .from(partnerOrganizationMembers)
    .where(eq(partnerOrganizationMembers.organizationId, org.id));
  const ownedVenues = await db.select({ id: venues.id }).from(venues).where(eq(venues.userId, ids.owner));
  assert.equal(orgs.length, 1);
  assert.equal(ownedVenues.length, 1);
  assert.equal(memberships.length, 1);
  assert.equal(memberships[0]!.role, "owner");
  assert.equal(memberships[0]!.isActive, true);
  assert.equal(memberships[0]!.userId, ids.owner);

  const saved = await saveVenueDraft(appUser(ids.owner), {
    organizationId: org.id,
    name: MARK + "Local 1",
    ...venueFields,
  });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  if (!saved.ok) throw new Error("save");
  assert.equal(saved.venue.id, stub.id);
  const retry = await saveVenueDraft(appUser(ids.owner), {
    organizationId: org.id,
    name: MARK + "Local 1 retry",
    ...venueFields,
  });
  assert.equal(retry.ok, true);
  if (!retry.ok) throw new Error("retry");
  assert.equal(retry.venue.id, stub.id);
  const afterRetry = await db.select({ id: venues.id }).from(venues).where(eq(venues.organizationId, org.id));
  assert.equal(afterRetry.length, 1);

  const [beforeSecond] = await db.select().from(venues).where(eq(venues.id, stub.id));
  const second = await saveVenueDraft(appUser(ids.owner), {
    organizationId: org.id,
    createIntent: true,
    createRequestId: randomUUID(),
    name: MARK + "Local 2",
    phone: PHONE,
    city: "Chișinău",
    address: "str. Armenească 5",
    imageUrls: ["https://example.com/b.jpg"],
  });
  assert.equal(second.ok, true);
  if (!second.ok) throw new Error("second");
  ids.venue2 = second.venue.id;
  assert.notEqual(ids.venue2, stub.id);
  const [afterSecond] = await db.select().from(venues).where(eq(venues.id, stub.id));
  assert.equal(afterSecond.nameRo, beforeSecond.nameRo);
  assert.equal(afterSecond.address, beforeSecond.address);
  const all = await db.select({ id: venues.id }).from(venues).where(eq(venues.organizationId, org.id));
  assert.equal(all.length, 2);
});

test("A: flag OFF select-role source stays legacy JSON without org ids", () => {
  const source = readFileSync("src/app/api/auth/select-role/route.ts", "utf8");
  assert.match(source, /organizationId, venueId/);
  assert.match(source, /isMultiHallEnabled\(\)/);
  const redirect = readFileSync("src/app/[locale]/(auth)/auth-redirect/page.tsx", "utf8");
  assert.match(redirect, /organizationId=\$\{organizationId\}&venueId=\$\{venueId\}/);
  const client = readFileSync("src/app/[locale]/(vendor)/dashboard/venue-onboarding/multi-hall-client.tsx", "utf8");
  assert.match(client, /search\.get\("intent"\) === "create"/);
  assert.doesNotMatch(client, /intent"\) === "create" \|\| !presetVenue/);
});

test("B: usable hall status is only active|pending; last usable cannot archive", async () => {
  flagOn();
  const [venue] = await db
    .insert(venues)
    .values({
      nameRo: MARK + "archive-matrix",
      slug: MARK + "archive-matrix",
      organizationId: ids.org,
      phone: PHONE,
      city: "Chișinău",
      address: "str. Test 1",
    })
    .returning({ id: venues.id });
  const statuses = ["draft", "pending", "active", "rejected", "suspended", "archived"] as const;
  const halls: Record<string, number> = {};
  for (const status of statuses) {
    const [hall] = await db
      .insert(venueHalls)
      .values({
        venueId: venue.id,
        slug: status,
        nameRo: status,
        status,
        capacityMin: 10,
        capacityMax: 20,
      })
      .returning({ id: venueHalls.id });
    halls[status] = hall.id;
  }
  assert.equal(isUsableHallStatus("active"), true);
  assert.equal(isUsableHallStatus("pending"), true);
  for (const status of ["draft", "rejected", "suspended", "archived"]) {
    assert.equal(isUsableHallStatus(status), false);
  }

  assert.equal((await archiveHall(ids.owner, halls.active!)).ok, true);
  assert.equal((await archiveHall(ids.owner, halls.pending!)).ok, false);
  const lastPending = await archiveHall(ids.owner, halls.pending!);
  assert.equal(lastPending.ok, false);
  if (!lastPending.ok) assert.equal(lastPending.code, "LAST_USABLE_HALL");

  const draftOk = await archiveHall(ids.owner, halls.draft!);
  assert.equal(draftOk.ok, true, "non-usable halls can still be archived");

  const [restored] = await db
    .insert(venueHalls)
    .values({
      venueId: venue.id,
      slug: "second-active",
      nameRo: "Second",
      status: "active",
      capacityMin: 10,
      capacityMax: 20,
    })
    .returning({ id: venueHalls.id });
  const pendingNow = await archiveHall(ids.owner, halls.pending!);
  assert.equal(pendingNow.ok, true);
  const leftover = await archiveHall(ids.owner, restored.id);
  assert.equal(leftover.ok, false);
  if (!leftover.ok) assert.equal(leftover.code, "LAST_USABLE_HALL");

  await db.delete(venueHalls).where(eq(venueHalls.venueId, venue.id));
  await db.delete(venues).where(eq(venues.id, venue.id));
});

test("B: two concurrent archives of the last two usable halls: exactly one succeeds", async () => {
  flagOn();
  const [venue] = await db
    .insert(venues)
    .values({
      nameRo: MARK + "race",
      slug: MARK + "race",
      organizationId: ids.org,
      phone: PHONE,
      city: "Chișinău",
      address: "str. Race 1",
    })
    .returning({ id: venues.id });
  const [a] = await db.insert(venueHalls).values({
    venueId: venue.id, slug: "a", nameRo: "A", status: "active", capacityMin: 10, capacityMax: 20,
  }).returning({ id: venueHalls.id });
  const [b] = await db.insert(venueHalls).values({
    venueId: venue.id, slug: "b", nameRo: "B", status: "pending", capacityMin: 10, capacityMax: 20,
  }).returning({ id: venueHalls.id });
  const race = await Promise.all([
    archiveHall(ids.owner, a.id),
    archiveHall(ids.owner, b.id),
  ]);
  const ok = race.filter((item) => item.ok);
  const last = race.filter((item) =>
    !item.ok && "code" in item &&
    (item.code === "LAST_USABLE_HALL" || item.code === "HALL_CHANGED"));
  assert.equal(ok.length, 1);
  assert.equal(last.length, 1);
  const leftover = await db.select({ status: venueHalls.status }).from(venueHalls).where(eq(venueHalls.venueId, venue.id));
  assert.equal(leftover.filter((row) => row.status === "active" || row.status === "pending").length, 1);
  await db.delete(venueHalls).where(eq(venueHalls.venueId, venue.id));
  await db.delete(venues).where(eq(venues.id, venue.id));
});

test("B: archived hall block/conflict does not hit sister; sister data stays intact", async () => {
  flagOn();
  const [venue] = await db
    .insert(venues)
    .values({
      nameRo: MARK + "avail",
      slug: MARK + "avail",
      organizationId: ids.org,
      isActive: true,
      phone: PHONE,
      city: "Chișinău",
      address: "str. Avail 1",
    })
    .returning({ id: venues.id });
  const [hallA] = await db.insert(venueHalls).values({
    venueId: venue.id, slug: "grand", nameRo: "Grand", status: "active", capacityMin: 10, capacityMax: 80,
  }).returning({ id: venueHalls.id });
  const [hallB] = await db.insert(venueHalls).values({
    venueId: venue.id, slug: "garden", nameRo: "Garden", status: "active", capacityMin: 10, capacityMax: 80,
  }).returning({ id: venueHalls.id });
  ids.hallA = hallA.id;
  ids.hallB = hallB.id;
  const [group] = await db
    .insert(venueHallConflictGroups)
    .values({ venueId: venue.id, name: "AB" })
    .returning({ id: venueHallConflictGroups.id });
  await db.insert(venueHallConflictGroupMembers).values([
    { groupId: group.id, hallId: hallA.id, venueId: venue.id },
    { groupId: group.id, hallId: hallB.id, venueId: venue.id },
  ]);
  const interval = canonicalVenueInterval({
    eventDate: "2028-09-01",
    startTime: "18:00",
    endTime: "22:00",
    timezone: TZ,
  });
  const [blockA] = await db.insert(venueScheduleBlocks).values({
    venueId: venue.id,
    hallId: hallA.id,
    startsAt: interval.startsAt,
    endsAt: interval.endsAt,
    kind: "manual",
    source: "manual",
  }).returning({ id: venueScheduleBlocks.id });
  const [blockB] = await db.insert(venueScheduleBlocks).values({
    venueId: venue.id,
    hallId: hallB.id,
    startsAt: zonedWallTimeToUtc("2028-09-02", "10:00", TZ),
    endsAt: zonedWallTimeToUtc("2028-09-02", "12:00", TZ),
    kind: "manual",
    source: "manual",
  }).returning({ id: venueScheduleBlocks.id });

  const before = await evaluateVenueAvailability({
    venueId: venue.id,
    hallId: hallB.id,
    eventDate: "2028-09-01",
    startTime: "18:00",
    endTime: "22:00",
    timezone: TZ,
    mode: "owner",
  });
  assert.equal(before.available, false);
  assert.equal(before.code, "CONFLICT_GROUP");

  const archived = await archiveHall(ids.owner, hallA.id);
  assert.equal(archived.ok, true, JSON.stringify(archived));

  const after = await evaluateVenueAvailability({
    venueId: venue.id,
    hallId: hallB.id,
    eventDate: "2028-09-01",
    startTime: "18:00",
    endTime: "22:00",
    timezone: TZ,
    mode: "owner",
  });
  assert.equal(after.available, true, JSON.stringify(after));

  const sisterOwn = await evaluateVenueAvailability({
    venueId: venue.id,
    hallId: hallB.id,
    eventDate: "2028-09-02",
    startTime: "10:00",
    endTime: "12:00",
    timezone: TZ,
    mode: "owner",
  });
  assert.equal(sisterOwn.available, false);
  assert.equal(sisterOwn.code, "HALL_BLOCK");

  const leftoverBlocks = await db.select({ id: venueScheduleBlocks.id, hallId: venueScheduleBlocks.hallId })
    .from(venueScheduleBlocks)
    .where(eq(venueScheduleBlocks.venueId, venue.id));
  assert.equal(leftoverBlocks.length, 2);
  assert.ok(leftoverBlocks.some((row) => row.id === blockA.id));
  assert.ok(leftoverBlocks.some((row) => row.id === blockB.id));
  const members = await db.select().from(venueHallConflictGroupMembers).where(eq(venueHallConflictGroupMembers.groupId, group.id));
  assert.equal(members.length, 2);

  await db.delete(venueScheduleBlocks).where(eq(venueScheduleBlocks.venueId, venue.id));
  await db.delete(venueHallConflictGroupMembers).where(eq(venueHallConflictGroupMembers.groupId, group.id));
  await db.delete(venueHallConflictGroups).where(eq(venueHallConflictGroups.id, group.id));
  await db.delete(venueHalls).where(eq(venueHalls.venueId, venue.id));
  await db.delete(venues).where(eq(venues.id, venue.id));
});

test("C: iCal feed emits DATE only for local midnight-to-midnight blocks", async () => {
  flagOn();
  const [icalUser] = await db.insert(users).values({
    clerkId: MARK + "ical",
    email: `${MARK}ical@example.com`,
    name: "ical",
  }).returning({ id: users.id });
  const [venue] = await db.insert(venues).values({
    nameRo: MARK + "ical",
    slug: MARK + "ical",
    userId: icalUser.id,
    phone: PHONE,
    city: "Chișinău",
    address: "str. Ical 1",
  }).returning({ id: venues.id });
  const timed20 = intervalTimes("2026-06-01", "04:00", "2026-06-02", "00:00");
  const allDay = intervalTimes("2026-06-03", "00:00", "2026-06-05", "00:00");
  await db.insert(venueScheduleBlocks).values([
    { venueId: venue.id, hallId: null, startsAt: timed20.startsAt, endsAt: timed20.endsAt, kind: "manual" },
    { venueId: venue.id, hallId: null, startsAt: allDay.startsAt, endsAt: allDay.endsAt, kind: "manual" },
  ]);
  assert.equal(classifyVenueScheduleBlockIcal(timed20.startsAt, timed20.endsAt, TZ).allDay, false);
  const token = await getVenueIcalTokenForUser(venue.id, icalUser.id);
  assert.ok(token);
  const res = await venueIcalGet(
    new NextRequest(`http://127.0.0.1/api/calendar/venue-ical/${venue.id}/${token}`),
    { params: Promise.resolve({ venueId: String(venue.id), token: token! }) },
  );
  const body = await res.text();
  assert.match(body, /DTSTART:20260601T010000Z/);
  assert.match(body, /DTSTART;VALUE=DATE:20260603/);
  assert.match(body, /DTEND;VALUE=DATE:20260605/);
  assert.doesNotMatch(body, /DTSTART;VALUE=DATE:20260601/);
  await db.delete(venueScheduleBlocks).where(eq(venueScheduleBlocks.venueId, venue.id));
  await db.delete(venues).where(eq(venues.id, venue.id));
});

test("D: XOR create paths and invalid legacy rows are refused without mutation", async () => {
  flagOn();
  const neither = await findOrCreateConversation({ clientUserId: ids.client, artistId: null, venueId: null });
  assert.equal(neither.ok, false);
  const both = await findOrCreateConversation({ clientUserId: ids.client, artistId: ids.artist, venueId: ids.venue });
  assert.equal(both.ok, false);
  const artistOnly = await findOrCreateConversation({ clientUserId: ids.client, artistId: ids.artist, venueId: null });
  assert.equal(artistOnly.ok, true);
  const venueOnly = await findOrCreateConversation({ clientUserId: ids.client, artistId: null, venueId: ids.venue });
  assert.equal(venueOnly.ok, true);

  const [legacy] = await db.insert(conversations).values({
    clientUserId: ids.client,
    artistId: ids.artist,
    venueId: ids.venue,
    lastMessagePreview: "legacy-both",
    clientUnread: 4,
  }).returning();
  assert.equal(conversationHasExclusiveParty(legacy), false);
  const before = await db.select().from(conversations).where(eq(conversations.id, legacy.id));
  const viaBooking = await db.insert(bookingRequests).values({
    clientUserId: ids.client,
    venueId: ids.venue,
    clientName: "Venue only",
    clientPhone: "+37360000001",
    eventDate: "2028-01-01",
    status: "pending",
    reservationScope: "venue",
    timezone: TZ,
  }).returning({ id: bookingRequests.id });
  const created = await findOrCreateConversationForBooking(viaBooking[0]!.id);
  assert.ok(created);
  const createdAgain = await findOrCreateConversationForBooking(viaBooking[0]!.id);
  assert.equal(createdAgain, created);
  const bothBooking = await findOrCreateConversation({
    clientUserId: ids.client,
    artistId: ids.artist,
    venueId: ids.venue,
  });
  assert.equal(bothBooking.ok, false);
  const after = await db.select().from(conversations).where(eq(conversations.id, legacy.id));
  assert.equal(after[0]!.lastMessagePreview, before[0]!.lastMessagePreview);
  assert.equal(after[0]!.clientUnread, before[0]!.clientUnread);
  assert.equal(after[0]!.artistId, ids.artist);
  assert.equal(after[0]!.venueId, ids.venue);
  await db.delete(bookingRequests).where(eq(bookingRequests.id, viaBooking[0]!.id));
});

test("E: org-backed approve/reject is FEATURE_DISABLED before mutation when flag OFF", async () => {
  flagOn();
  const [org] = await db.select({ status: partnerOrganizations.status }).from(partnerOrganizations).where(eq(partnerOrganizations.id, ids.org));
  const [venue] = await db.select({ isActive: venues.isActive, organizationId: venues.organizationId }).from(venues).where(eq(venues.id, ids.venue));
  flagOff();
  const approved = await approvePartnerVenue(ids.reviewer, ids.venue);
  assert.equal(approved.ok, false);
  if (!approved.ok) {
    assert.equal(approved.status, 404);
    assert.equal(approved.code, "FEATURE_DISABLED");
    assert.equal(approved.error, "FEATURE_DISABLED");
  }
  const rejected = await rejectPartnerVenue(ids.reviewer, ids.venue);
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.status, 404);
    assert.equal(rejected.code, "FEATURE_DISABLED");
  }
  const [orgAfter] = await db.select({ status: partnerOrganizations.status }).from(partnerOrganizations).where(eq(partnerOrganizations.id, ids.org));
  const [venueAfter] = await db.select({ isActive: venues.isActive }).from(venues).where(eq(venues.id, ids.venue));
  assert.equal(orgAfter.status, org.status);
  assert.equal(venueAfter.isActive, venue.isActive);

  const [legacyUser] = await db.insert(users).values({
    clerkId: MARK + "legacy",
    email: `${MARK}legacy@example.com`,
    name: "legacy",
  }).returning({ id: users.id });
  const [legacy] = await db.insert(venues).values({
    nameRo: MARK + "legacy",
    slug: MARK + "legacy",
    userId: legacyUser.id,
    organizationId: null,
    isActive: false,
    phone: PHONE,
    city: "Chișinău",
    address: "str. Legacy 1",
  }).returning({ id: venues.id });
  const legacyApprove = await approvePartnerVenue(ids.reviewer, legacy.id);
  if (!legacyApprove.ok) {
    assert.notEqual(legacyApprove.code, "FEATURE_DISABLED");
  }
  await db.delete(venues).where(eq(venues.id, legacy.id));
  flagOn();
});

test("E: Hall images use Hall PATCH and generic gallery writes stay general-only", async () => {
  flagOn();
  const [hall] = await db.insert(venueHalls).values({
    venueId: ids.venue,
    slug: MARK + "img-hall",
    nameRo: "Img",
    status: "draft",
    capacityMin: 10,
    capacityMax: 20,
  }).returning({ id: venueHalls.id });
  await replaceVenueImages(ids.venue, null, ["https://example.com/general.jpg"]);
  await replaceVenueImages(ids.venue, hall.id, ["https://example.com/hall.jpg"]);
  const before = await db.select().from(venueImages).where(eq(venueImages.venueId, ids.venue));
  const general = before.find((row) => row.hallId == null)!;
  const hallImg = before.find((row) => row.hallId === hall.id)!;

  flagOff();
  await assert.rejects(
    () => replaceVenueImages(ids.venue, hall.id, ["https://example.com/hall-2.jpg"]),
    (error: unknown) => error instanceof MultiHallFeatureDisabledError,
  );
  const reorder = await reorderVenueImages(ids.owner, ids.venue, [
    { id: general.id, sortOrder: 5 },
    { id: hallImg.id, sortOrder: 6 },
  ]);
  assert.equal(reorder.ok, false);
  if (!reorder.ok) {
    assert.equal(reorder.status, 400);
    assert.equal(reorder.code, "HALL_IMAGES_USE_HALL_PATCH");
  }
  const afterRefuse = await db.select().from(venueImages).where(eq(venueImages.venueId, ids.venue));
  assert.equal(afterRefuse.find((row) => row.id === general.id)?.sortOrder, general.sortOrder);
  assert.equal(afterRefuse.find((row) => row.id === hallImg.id)?.sortOrder, hallImg.sortOrder);
  assert.equal(afterRefuse.find((row) => row.id === hallImg.id)?.url, hallImg.url);

  const generalOnly = await reorderVenueImages(
    ids.owner,
    ids.venue,
    [{ id: general.id, sortOrder: 3 }],
  );
  assert.equal(generalOnly.ok, true);
  await replaceVenueImages(ids.venue, null, ["https://example.com/general-edit.jpg"]);
  const afterGeneral = await db.select().from(venueImages).where(eq(venueImages.venueId, ids.venue));
  assert.equal(afterGeneral.find((row) => row.hallId === hall.id)?.url, hallImg.url);
  assert.ok(afterGeneral.some((row) => row.hallId == null && row.url === "https://example.com/general-edit.jpg"));

  flagOn();
  const onReorder = await reorderVenueImages(ids.owner, ids.venue, [
    { id: afterGeneral.find((row) => row.hallId == null)!.id, sortOrder: 0 },
    { id: hallImg.id, sortOrder: 1 },
  ]);
  assert.equal(onReorder.ok, false);
  if (!onReorder.ok) {
    assert.equal(onReorder.status, 400);
    assert.equal(onReorder.code, "HALL_IMAGES_USE_HALL_PATCH");
  }
  await db.delete(venueImages).where(eq(venueImages.venueId, ids.venue));
  await db.delete(venueHalls).where(eq(venueHalls.id, hall.id));
});
});

function intervalTimes(startDate: string, startTime: string, endDate: string, endTime: string) {
  return {
    startsAt: zonedWallTimeToUtc(startDate, startTime, TZ),
    endsAt: zonedWallTimeToUtc(endDate, endTime, TZ),
  };
}
