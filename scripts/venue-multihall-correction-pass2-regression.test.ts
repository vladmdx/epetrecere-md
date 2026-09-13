/**
 * Correction pass 2 — onboarding, approval, phone, AI/messages, staff DTO,
 * org PATCH, admin contracts, archive, calendar bulk, conflict groups,
 * client_confirm, artist accept, set_paid, notifications.
 * Guarded disposable local DB. Run: npm run test:multihall:pass2
 *
 * Does not UPDATE/DELETE legal_acceptances (append-only).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { NextRequest } from "next/server";

import { db } from "../src/lib/db";
import {
  artists,
  bookingRequests,
  conversations,
  legalAcceptances,
  notifications,
  partnerOrganizationMembers,
  partnerOrganizations,
  users,
  venueHalls,
  venueImages,
  venueScheduleBlocks,
  venues,
} from "../src/lib/db/schema";
import {
  authorizeOrganizationCapability,
  authorizeVenueCapability,
  type AppUser,
} from "../src/lib/venue-access";
import {
  archiveHall,
  ensureDraftOrganization,
  saveHallDraft,
  saveOrganizationProfile,
  saveVenueDraft,
  submitVenueForApproval,
} from "../src/lib/partner/onboarding";
import { adminContractsForVenue, organizationHasAnyAcceptance } from "../src/lib/partner/legal";
import { redactOrganizationForRole } from "../src/lib/partner/organization-dto";
import { organizationPatchSchema } from "../src/lib/partner/validation";
import {
  approvePartnerVenue,
  listPendingPartnerVenues,
  rejectPartnerVenue,
} from "../src/lib/partner/registration-decision";
import {
  LEGAL_PACK_VERSION,
  VENUE_REQUIRED_DOCS,
  getLegalDocument,
  legalBlocks,
} from "../src/lib/legal";
import { recordLegalAcceptancePack } from "../src/lib/legal/record-acceptance";
import { conversationMatchesVenueScope } from "../src/lib/conversations/scope";
import { saveVenueConflictGroup } from "../src/lib/booking/conflict-groups";
import { applyVenueScheduleBlocksBulk } from "../src/lib/booking/venue-schedule-write";
import {
  acceptArtistBooking,
  casClientConfirm,
  casSetPaid,
  replayConfirmationEffects,
  vendorCancelBooking,
} from "../src/lib/booking/booking-transitions";
import { dispatchNotification } from "../src/lib/notifications/dispatch";
import { GET as venueIcalGet } from "../src/app/api/calendar/venue-ical/[venueId]/[token]/route";
import { getVenueIcalTokenForUser } from "../src/lib/calendar/ical-token";

const MARK = `cp2_${Date.now()}_`;
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const IDENTITY = {
  partnerType: "company" as const,
  legalName: "Pass Two SRL",
  idNumber: "1003600023598",
  legalAddress: "Chișinău, str. București 10",
  representativeName: "Ion Popescu",
};
const PHONE = "+37369123456";

const ids = {
  owner: "",
  owner2: "",
  staff: "",
  outsider: "",
  client: "",
  artistUser: "",
  org: 0,
  orgB: 0,
  venue: 0,
  venue2: 0,
  venueB: 0,
  hallA: 0,
  hallB: 0,
  hall2: 0,
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

async function signOrg(userId: string, organizationId: number) {
  const acceptedAt = new Date();
  const acceptanceSessionId = randomUUID();
  for (const slug of VENUE_REQUIRED_DOCS) {
    const doc = getLegalDocument(slug);
    assert.ok(doc);
    const blocks = legalBlocks(doc, "ro");
    await db.insert(legalAcceptances).values({
      userId,
      subjectType: "venue",
      organizationId,
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
      documentBlocks: blocks,
      contentHash: createHash("sha256").update(blocks.map((b) => b.text).join("\n")).digest("hex"),
      acceptedAt,
      acceptanceSessionId,
    });
  }
}

before(async () => {
  flagOn();
  const [owner] = await db.insert(users).values({
    clerkId: MARK + "owner", email: `${MARK}owner@example.com`, name: "Owner", phone: "+37369111111",
  }).returning({ id: users.id });
  ids.owner = owner.id;
  const [owner2] = await db.insert(users).values({
    clerkId: MARK + "owner2", email: `${MARK}owner2@example.com`, name: "Owner2",
  }).returning({ id: users.id });
  ids.owner2 = owner2.id;
  const [staff] = await db.insert(users).values({
    clerkId: MARK + "staff", email: `${MARK}staff@example.com`, name: "Staff",
  }).returning({ id: users.id });
  ids.staff = staff.id;
  const [outsider] = await db.insert(users).values({
    clerkId: MARK + "out", email: `${MARK}out@example.com`, name: "Out",
  }).returning({ id: users.id });
  ids.outsider = outsider.id;
  const [client] = await db.insert(users).values({
    clerkId: MARK + "client", email: `${MARK}client@example.com`, name: "Client",
  }).returning({ id: users.id });
  ids.client = client.id;
  const [artistUser] = await db.insert(users).values({
    clerkId: MARK + "artist", email: `${MARK}artist@example.com`, name: "Artist",
  }).returning({ id: users.id });
  ids.artistUser = artistUser.id;

  const org = await ensureDraftOrganization(appUser(ids.owner), {
    displayName: MARK + "Org A",
    type: "company",
    legalName: IDENTITY.legalName,
    idNumber: IDENTITY.idNumber,
    legalAddress: IDENTITY.legalAddress,
    billingEmail: "billing@example.com",
    billingPhone: "+37369222222",
  });
  ids.org = org.id;
  assert.equal(org.legalName, IDENTITY.legalName);
  await signOrg(ids.owner, ids.org);
  await db.insert(partnerOrganizationMembers).values({
    organizationId: ids.org, userId: ids.staff, role: "staff", isActive: true,
  });

  const orgB = await ensureDraftOrganization(appUser(ids.outsider), {
    displayName: MARK + "Org B",
    type: "company",
    legalName: IDENTITY.legalName,
    idNumber: IDENTITY.idNumber,
    legalAddress: IDENTITY.legalAddress,
  });
  ids.orgB = orgB.id;
  await signOrg(ids.outsider, ids.orgB);

  const v1 = await saveVenueDraft(appUser(ids.owner), {
    organizationId: ids.org,
    name: MARK + "Local 1",
    phone: PHONE,
    city: "Chișinău",
    address: "str. București 10",
    imageUrls: ["https://example.com/a.jpg"],
  });
  assert.equal(v1.ok, true, JSON.stringify(v1));
  if (!v1.ok) throw new Error("v1");
  ids.venue = v1.venue.id;
  const h1 = await saveHallDraft({
    venueId: ids.venue, nameRo: "Grand", capacityMin: 20, capacityMax: 80, imageUrls: [],
  });
  assert.equal(h1.ok, true);
  if (h1.ok) ids.hallA = h1.hall.id;
  const h2 = await saveHallDraft({
    venueId: ids.venue, nameRo: "Garden", capacityMin: 10, capacityMax: 40, imageUrls: [],
  });
  assert.equal(h2.ok, true);
  if (h2.ok) ids.hallB = h2.hall.id;
  const submitted = await submitVenueForApproval(ids.venue);
  assert.equal(submitted.ok, true);
  const approved = await approvePartnerVenue(ids.venue);
  assert.equal(approved.ok, true, JSON.stringify(approved));

  const [artist] = await db.insert(artists).values({
    userId: ids.artistUser,
    nameRo: MARK + "DJ",
    slug: MARK + "dj",
  }).returning({ id: artists.id });
  ids.artist = artist.id;
});

after(async () => {
  await db.delete(notifications).where(inArray(notifications.userId, [
    ids.owner, ids.staff, ids.outsider, ids.client, ids.artistUser, ids.owner2,
  ].filter(Boolean)));
  await db.delete(conversations).where(inArray(conversations.clientUserId, [ids.client, ids.outsider].filter(Boolean)));
  await db.execute(sql`DELETE FROM booking_effect_deliveries
    WHERE effect_id IN (
      SELECT o.id FROM booking_effect_outbox o
      JOIN booking_requests b ON b.id = o.booking_id
      WHERE b.venue_id IN (${ids.venue}, ${ids.venue2}, ${ids.venueB})
         OR b.artist_id = ${ids.artist}
    )`);
  await db.execute(sql`DELETE FROM booking_effect_outbox
    WHERE booking_id IN (
      SELECT id FROM booking_requests
      WHERE venue_id IN (${ids.venue}, ${ids.venue2}, ${ids.venueB})
         OR artist_id = ${ids.artist}
    )`);
  await db.delete(bookingRequests).where(inArray(bookingRequests.venueId, [ids.venue, ids.venue2, ids.venueB].filter(Boolean)));
  await db.delete(bookingRequests).where(eq(bookingRequests.artistId, ids.artist));
  await db.delete(venueScheduleBlocks).where(inArray(venueScheduleBlocks.venueId, [ids.venue, ids.venue2, ids.venueB].filter(Boolean)));
  const venueIds = [ids.venue, ids.venue2, ids.venueB].filter(Boolean);
  if (venueIds.length) {
    await db.delete(venueImages).where(inArray(venueImages.venueId, venueIds));
    await db.delete(venueHalls).where(inArray(venueHalls.venueId, venueIds));
    await db.delete(venues).where(inArray(venues.id, venueIds));
  }
  if (ids.artist) await db.delete(artists).where(eq(artists.id, ids.artist));
  const orgIds = [ids.org, ids.orgB].filter(Boolean);
  if (orgIds.length) {
    await db.delete(partnerOrganizationMembers).where(inArray(partnerOrganizationMembers.organizationId, orgIds));
  }
});

test("fresh POST legal fields persist; add venue does not mutate the first local", async () => {
  const [org] = await db.select().from(partnerOrganizations).where(eq(partnerOrganizations.id, ids.org));
  assert.equal(org.legalName, IDENTITY.legalName);
  assert.equal(org.idNumber, IDENTITY.idNumber);
  assert.equal(org.legalAddress, IDENTITY.legalAddress);

  const [before] = await db.select().from(venues).where(eq(venues.id, ids.venue));
  const created = await saveVenueDraft(appUser(ids.owner), {
    organizationId: ids.org,
    name: MARK + "Local 2",
    phone: PHONE,
    city: "Chișinău",
    address: "str. Armenească 5",
    imageUrls: ["https://example.com/b.jpg"],
  });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("v2");
  ids.venue2 = created.venue.id;
  assert.notEqual(ids.venue2, ids.venue);
  const [after] = await db.select().from(venues).where(eq(venues.id, ids.venue));
  assert.equal(after.nameRo, before.nameRo);
  assert.equal(after.address, before.address);
  assert.equal(after.phone, before.phone);
});

test("approval: extra hall pending keeps venue searchable; reject extra hall keeps venue active", async () => {
  const extra = await saveHallDraft({
    venueId: ids.venue, nameRo: "VIP pending", capacityMin: 8, capacityMax: 16, imageUrls: [],
  });
  assert.equal(extra.ok, true);
  if (!extra.ok) throw new Error("extra hall");
  await db.update(venueHalls).set({ status: "pending", updatedAt: new Date() }).where(eq(venueHalls.id, extra.hall.id));
  const [venue] = await db.select({ isActive: venues.isActive }).from(venues).where(eq(venues.id, ids.venue));
  assert.equal(venue.isActive, true);
  const pending = await listPendingPartnerVenues();
  assert.ok(pending.some((row) => row.id === ids.venue));

  const rejected = await rejectPartnerVenue(ids.venue);
  assert.equal(rejected.ok, true, JSON.stringify(rejected));
  const [still] = await db.select({ isActive: venues.isActive }).from(venues).where(eq(venues.id, ids.venue));
  assert.equal(still.isActive, true);
  const [hall] = await db.select({ status: venueHalls.status }).from(venueHalls).where(eq(venueHalls.id, extra.hall.id));
  assert.equal(hall.status, "rejected");

  const direct = await approvePartnerVenue(ids.venue);
  assert.equal(direct.ok, false);
  if (!direct.ok) assert.equal(direct.code, "NOT_PENDING");
});

test("phone: same number on two venues; owner users.phone unchanged when flag ON", async () => {
  const [owner] = await db.select({ phone: users.phone }).from(users).where(eq(users.id, ids.owner));
  assert.equal(owner.phone, "+37369111111");
  const [v1] = await db.select({ phone: venues.phone }).from(venues).where(eq(venues.id, ids.venue));
  assert.equal(v1.phone, PHONE);
  const otherAccount = await saveVenueDraft(appUser(ids.owner), {
    organizationId: ids.org,
    name: MARK + "Phone Twin",
    phone: "+37369111111",
    city: "Chișinău",
    address: "str. Phone 1",
    imageUrls: ["https://example.com/p.jpg"],
  });
  assert.equal(otherAccount.ok, true, JSON.stringify(otherAccount));
  if (otherAccount.ok) {
    assert.equal(otherAccount.venue.phone, "+37369111111");
    await db.delete(venueImages).where(eq(venueImages.venueId, otherAccount.venue.id));
    await db.delete(venues).where(eq(venues.id, otherAccount.venue.id));
  }
  const [ownerAfter] = await db.select({ phone: users.phone }).from(users).where(eq(users.id, ids.owner));
  assert.equal(ownerAfter.phone, "+37369111111");
});

test("staff DTO redacts legal and billing; owner keeps them", async () => {
  const [org] = await db.select().from(partnerOrganizations).where(eq(partnerOrganizations.id, ids.org));
  const staff = redactOrganizationForRole(org, "staff");
  assert.equal(staff.legalName, null);
  assert.equal(staff.idNumber, null);
  assert.equal(staff.legalAddress, null);
  assert.equal(staff.billingEmail, null);
  assert.equal(staff.bankDetails, null);
  const owner = redactOrganizationForRole(org, "owner");
  assert.equal(owner.legalName, IDENTITY.legalName);
  assert.equal(owner.idNumber, IDENTITY.idNumber);
  assert.equal((await authorizeOrganizationCapability(appUser(ids.staff), ids.org, "manage_legal")).ok, false);
});

test("PATCH is partial: billing-only does not default type to company; legal freeze includes address", async () => {
  const parsed = organizationPatchSchema.safeParse({ billingEmail: "ops@example.com" });
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.type, undefined);

  await db.update(partnerOrganizations).set({ type: "sole_trader" }).where(eq(partnerOrganizations.id, ids.org));
  const billed = await saveOrganizationProfile(ids.org, { billingEmail: "ops@example.com" });
  assert.equal(billed.ok, true);
  const [row] = await db.select().from(partnerOrganizations).where(eq(partnerOrganizations.id, ids.org));
  assert.equal(row.type, "sole_trader");
  assert.equal(row.billingEmail, "ops@example.com");
  await db.update(partnerOrganizations).set({ type: "company" }).where(eq(partnerOrganizations.id, ids.org));

  assert.equal(await organizationHasAnyAcceptance(ids.org), true);
  const address = await saveOrganizationProfile(ids.org, { legalAddress: "Chișinău, str. Alternate 99" });
  assert.equal(address.ok, false);
  const again = await saveOrganizationProfile(ids.org, { legalName: "Other SRL" });
  assert.equal(again.ok, false);
});

test("admin contracts: org venues use organizationId; same signer in two orgs stays scoped", async () => {
  const orgRows = await db.select().from(legalAcceptances).where(inArray(legalAcceptances.organizationId, [ids.org, ids.orgB]));
  const userRows = await db.select().from(legalAcceptances).where(eq(legalAcceptances.userId, ids.owner));
  const forA = adminContractsForVenue(
    { organizationId: ids.org, userId: ids.owner },
    orgRows,
    userRows,
  );
  const forB = adminContractsForVenue(
    { organizationId: ids.orgB, userId: ids.outsider },
    orgRows,
    userRows,
  );
  assert.ok(forA.length > 0);
  assert.ok(forA.every((row) => row.organizationId === ids.org));
  assert.ok(forB.every((row) => row.organizationId === ids.orgB));
  assert.equal(forA.some((row) => row.organizationId === ids.orgB), false);
});

test("AI/messages IDOR: staff of A cannot use venue B; scoped list does not mix locals", async () => {
  const vb = await saveVenueDraft(appUser(ids.outsider), {
    organizationId: ids.orgB,
    name: MARK + "Local B",
    phone: "+37369333333",
    city: "Bălți",
    address: "str. B 1",
    imageUrls: ["https://example.com/b2.jpg"],
  });
  assert.equal(vb.ok, true);
  if (!vb.ok) throw new Error("vb");
  ids.venueB = vb.venue.id;
  const denied = await authorizeVenueCapability(appUser(ids.staff), ids.venueB, "manage_ai");
  assert.equal(denied.ok, false);
  const allowed = await authorizeVenueCapability(appUser(ids.staff), ids.venue, "view_private");
  assert.equal(allowed.ok, true);

  const [convA] = await db.insert(conversations).values({
    clientUserId: ids.client, venueId: ids.venue, lastMessagePreview: "A",
  }).returning();
  const [convB] = await db.insert(conversations).values({
    clientUserId: ids.client, venueId: ids.venueB, lastMessagePreview: "B",
  }).returning();
  assert.equal(conversationMatchesVenueScope(convA.venueId, ids.venue), true);
  assert.equal(conversationMatchesVenueScope(convB.venueId, ids.venue), false);
  const scoped = await db.select({ id: conversations.id, venueId: conversations.venueId })
    .from(conversations)
    .where(inArray(conversations.venueId, [ids.venue]));
  assert.ok(scoped.some((row) => row.id === convA.id));
  assert.equal(scoped.some((row) => row.id === convB.id), false);
});

test("conflict-group over overlapping bookings is rejected; calendar bulk is all-or-none", async () => {
  const dateFree = "2028-03-01";
  const dateBusy = "2028-03-02";
  await db.insert(bookingRequests).values({
    venueId: ids.venue,
    hallId: ids.hallA,
    clientName: "Busy",
    clientPhone: "+37360000001",
    eventDate: dateBusy,
    startTime: "18:00",
    endTime: "23:00",
    timezone: "Europe/Chisinau",
    status: "pending",
    reservationScope: "hall",
  });
  await db.insert(bookingRequests).values({
    venueId: ids.venue,
    hallId: ids.hallB,
    clientName: "Busy2",
    clientPhone: "+37360000002",
    eventDate: dateBusy,
    startTime: "18:00",
    endTime: "23:00",
    timezone: "Europe/Chisinau",
    status: "pending",
    reservationScope: "hall",
  });
  const group = await saveVenueConflictGroup({
    venueId: ids.venue,
    name: "Grand+Garden",
    hallIds: [ids.hallA, ids.hallB],
  });
  assert.equal(group.ok, false);
  if (!group.ok) assert.equal(group.code, "CONFLICT_GROUP_OVERLAP");

  const bulk = await applyVenueScheduleBlocksBulk({
    venueId: ids.venue,
    hallId: ids.hallA,
    dates: [dateFree, dateBusy],
    action: "block",
    timezone: "Europe/Chisinau",
    createdBy: ids.owner,
  });
  assert.equal(bulk.ok, false);
  const leftover = await db.select({ id: venueScheduleBlocks.id })
    .from(venueScheduleBlocks)
    .where(eq(venueScheduleBlocks.venueId, ids.venue));
  assert.equal(leftover.length, 0);
});

test("iCal hall filter includes whole-venue bookings; partial blocks are timed", async () => {
  await db.update(partnerOrganizations).set({ status: "active" }).where(eq(partnerOrganizations.id, ids.org));
  await db.insert(bookingRequests).values({
    venueId: ids.venue,
    hallId: null,
    clientName: "Whole",
    clientPhone: "+37360000003",
    eventDate: "2028-04-10",
    startTime: "18:00",
    endTime: "23:00",
    timezone: "Europe/Chisinau",
    status: "accepted",
    reservationScope: "venue",
  });
  await db.insert(venueScheduleBlocks).values({
    venueId: ids.venue,
    hallId: ids.hallA,
    startsAt: new Date("2028-04-11T15:00:00.000Z"),
    endsAt: new Date("2028-04-11T17:00:00.000Z"),
    kind: "manual",
    createdBy: ids.owner,
  });
  const token = await getVenueIcalTokenForUser(ids.venue, ids.owner);
  assert.ok(token);
  const req = new NextRequest(
    `http://127.0.0.1/api/calendar/venue-ical/${ids.venue}/${token}?hallId=${ids.hallA}`,
  );
  const res = await venueIcalGet(req, { params: Promise.resolve({ venueId: String(ids.venue), token: token! }) });
  const body = await res.text();
  assert.match(body, /BEGIN:VEVENT/);
  assert.match(body, /DTSTART;VALUE=DATE:20280410/);
  assert.match(body, /DTSTART:20280411T150000Z/);
});

test("double client_confirm CAS: only one write; sequential retry is idempotent", async () => {
  const [booking] = await db.insert(bookingRequests).values({
    venueId: ids.venue,
    hallId: ids.hallA,
    clientName: "Confirm",
    clientPhone: "+37360000004",
    eventDate: "2028-05-01",
    status: "accepted",
    reservationScope: "hall",
  }).returning();
  const now = new Date();
  const results = await Promise.all([
    casClientConfirm(db, booking.id, { status: "accepted", clientConfirmedAt: now, confirmedAt: null }),
    casClientConfirm(db, booking.id, { status: "accepted", clientConfirmedAt: now, confirmedAt: null }),
  ]);
  assert.equal(results.filter(Boolean).length, 1);
  const again = await casClientConfirm(db, booking.id, {
    status: "accepted", clientConfirmedAt: new Date(), confirmedAt: null,
  });
  assert.equal(again, null);
  const [row] = await db.select().from(bookingRequests).where(eq(bookingRequests.id, booking.id));
  assert.ok(row.clientConfirmedAt);
});

test("confirm retry vs cancel; notifications with dedupe_key fire once", async () => {
  const [booking] = await db.insert(bookingRequests).values({
    venueId: ids.venue,
    hallId: ids.hallA,
    clientName: "Retry",
    clientPhone: "+37360000005",
    eventDate: "2028-05-02",
    status: "confirmed_by_client",
    reservationScope: "hall",
  }).returning();
  const race = await Promise.allSettled([
    replayConfirmationEffects(booking),
    vendorCancelBooking(booking.id),
  ]);
  const [final] = await db.select().from(bookingRequests).where(eq(bookingRequests.id, booking.id));
  if (final.status === "cancelled") {
    await assert.rejects(() => replayConfirmationEffects(final), /booking_changed/);
  } else {
    assert.equal(final.status, "confirmed_by_client");
  }
  assert.ok(race.some((item) => item.status === "fulfilled"));

  const key = `booking:${booking.id}:notify-once`;
  await dispatchNotification({
    userId: ids.owner, type: "booking_status_changed", title: "Once", dedupeKey: key,
  });
  await dispatchNotification({
    userId: ids.owner, type: "booking_status_changed", title: "Once", dedupeKey: key,
  });
  const rows = await db.select().from(notifications).where(and(
    eq(notifications.userId, ids.owner),
    eq(notifications.dedupeKey, key),
  ));
  assert.equal(rows.length, 1);
});

test("artist overlapping accepts: only one wins; set_paid CAS refuses cancelled", async () => {
  const date = "2028-06-01";
  const [a] = await db.insert(bookingRequests).values({
    artistId: ids.artist,
    clientName: "A1",
    clientPhone: "+37360000006",
    eventDate: date,
    startTime: "18:00",
    endTime: "23:00",
    status: "pending",
    agreedPrice: 100,
  }).returning();
  const [b] = await db.insert(bookingRequests).values({
    artistId: ids.artist,
    clientName: "A2",
    clientPhone: "+37360000007",
    eventDate: date,
    startTime: "18:00",
    endTime: "23:00",
    status: "pending",
    agreedPrice: 100,
  }).returning();
  const race = await Promise.allSettled([
    acceptArtistBooking(a, { agreedPrice: 100 }),
    acceptArtistBooking(b, { agreedPrice: 100 }),
  ]);
  const ok = race.filter((item) => item.status === "fulfilled");
  assert.equal(ok.length, 1, JSON.stringify(race.map((item) =>
    item.status === "rejected" ? String(item.reason) : item.status)));
  const accepted = await db.select({ id: bookingRequests.id, status: bookingRequests.status })
    .from(bookingRequests).where(inArray(bookingRequests.id, [a.id, b.id]));
  assert.equal(accepted.filter((row) => row.status === "accepted").length, 1);

  const [paidBooking] = await db.insert(bookingRequests).values({
    venueId: ids.venue,
    hallId: ids.hallA,
    clientName: "Paid",
    clientPhone: "+37360000008",
    eventDate: "2028-07-01",
    status: "confirmed_by_client",
    reservationScope: "hall",
    paidStatus: "unpaid",
  }).returning();
  await vendorCancelBooking(paidBooking.id);
  const paid = await casSetPaid(db, paidBooking.id, "paid");
  assert.equal(paid, null);
  const [row] = await db.select({ paidStatus: bookingRequests.paidStatus, status: bookingRequests.status })
    .from(bookingRequests).where(eq(bookingRequests.id, paidBooking.id));
  assert.equal(row.status, "cancelled");
  assert.equal(row.paidStatus, "unpaid");
});

test("archiveHall concurrent last two halls: one LAST_USABLE_HALL", async () => {
  await db.delete(bookingRequests).where(eq(bookingRequests.venueId, ids.venue));
  await db.delete(venueScheduleBlocks).where(eq(venueScheduleBlocks.venueId, ids.venue));
  const halls = await db.select({ id: venueHalls.id, status: venueHalls.status })
    .from(venueHalls).where(eq(venueHalls.venueId, ids.venue));
  const usable = halls.filter((hall) => hall.status !== "archived");
  while (usable.length > 2) {
    const extra = usable.pop()!;
    const archived = await archiveHall(extra.id);
    assert.equal(archived.ok, true, JSON.stringify(archived));
  }
  assert.equal(usable.length, 2);
  const race = await Promise.all([archiveHall(usable[0]!.id), archiveHall(usable[1]!.id)]);
  const ok = race.filter((item) => item.ok);
  const last = race.filter((item) => !item.ok && "code" in item && item.code === "LAST_USABLE_HALL");
  assert.equal(ok.length, 1);
  assert.equal(last.length, 1);
});

test("flag OFF: organizationId signing is FEATURE_DISABLED", async () => {
  flagOff();
  try {
    const result = await recordLegalAcceptancePack({
      userId: ids.owner,
      subjectType: "venue",
      artistId: null,
      venueId: null,
      organizationId: ids.org,
      locale: "ro",
      signatureName: IDENTITY.representativeName,
      signatureImage: PNG,
      identity: IDENTITY,
      ipAddress: null,
      userAgent: null,
      deviceSummary: null,
      email: null,
      phone: null,
      slugs: VENUE_REQUIRED_DOCS,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "FEATURE_DISABLED");
  } finally {
    flagOn();
  }
});
