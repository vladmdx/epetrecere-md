/**
 * Organization-aware admin approval: extra venues with user_id NULL,
 * transactional activate, reject keeps the draft, resubmit.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";

import { db } from "../src/lib/db";
import {
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
  ensureDraftOrganization,
  saveHallDraft,
  saveOrganizationProfile,
  saveVenueDraft,
  submitVenueForApproval,
} from "../src/lib/partner/onboarding";
import {
  approvePartnerVenue,
  listPendingPartnerVenues,
  rejectPartnerVenue,
} from "../src/lib/partner/registration-decision";
import { organizationHasValidContract } from "../src/lib/partner/legal";
import {
  LEGAL_PACK_VERSION,
  VENUE_REQUIRED_DOCS,
  getLegalDocument,
  legalBlocks,
} from "../src/lib/legal";
import type { AppUser } from "../src/lib/venue-access";

const MARK = `appr_${Date.now()}_`;
const PHONE = `+37369${String(Date.now()).slice(-6)}`;
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const IDENTITY = {
  partnerType: "company" as const,
  legalName: "Approval Palace SRL",
  idNumber: "1003600023598",
  legalAddress: "Chișinău, str. București 10",
  representativeName: "Ion Popescu",
};

const ids = {
  owner: "",
  admin: "",
  org: 0,
  venue: 0,
  venue2: 0,
};

function flagOn() {
  process.env.FEATURE_MULTI_HALL = "1";
}
function appUser(id: string): AppUser {
  return { id, role: "user", isGlobalAdmin: false };
}

async function signOrgContract(userId: string, organizationId: number) {
  const acceptedAt = new Date();
  for (const slug of VENUE_REQUIRED_DOCS) {
    const doc = getLegalDocument(slug);
    assert.ok(doc);
    const blocks = legalBlocks(doc, "ro");
    const contentHash = createHash("sha256")
      .update(blocks.map((block) => block.text).join("\n"))
      .digest("hex");
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
      contentHash,
      acceptedAt,
    });
  }
}

before(async () => {
  flagOn();
  const [owner] = await db
    .insert(users)
    .values({ clerkId: MARK + "owner", email: `${MARK}owner@example.com`, name: "Owner", phone: PHONE })
    .returning({ id: users.id });
  ids.owner = owner.id;
  const [admin] = await db
    .insert(users)
    .values({ clerkId: MARK + "admin", email: `${MARK}admin@example.com`, name: "Admin" })
    .returning({ id: users.id });
  ids.admin = admin.id;

  const org = await ensureDraftOrganization(appUser(ids.owner), {
    displayName: MARK + "Org",
    type: "company",
  });
  ids.org = org.id;
  const profile = await saveOrganizationProfile(ids.org, {
    type: "company",
    displayName: MARK + "Org",
    legalName: IDENTITY.legalName,
    idNumber: IDENTITY.idNumber,
    legalAddress: IDENTITY.legalAddress,
  });
  assert.equal(profile.ok, true);
  await signOrgContract(ids.owner, ids.org);
  await db.insert(partnerOrganizationMembers).values({
    organizationId: ids.org,
    userId: ids.admin,
    role: "admin",
    isActive: true,
  });

  const venue = await saveVenueDraft(appUser(ids.owner), {
    organizationId: ids.org,
    name: MARK + "Local 1",
    phone: PHONE,
    city: "Chișinău",
    address: "str. București 10",
    imageUrls: ["https://example.com/cover.jpg"],
  });
  assert.equal(venue.ok, true, JSON.stringify(venue));
  if (!venue.ok) throw new Error("venue 1");
  ids.venue = venue.venue.id;
  await saveHallDraft({
    venueId: ids.venue,
    nameRo: "Grand",
    capacityMin: 20,
    capacityMax: 100,
    imageUrls: [],
  });
  const submitted = await submitVenueForApproval(ids.venue);
  assert.equal(submitted.ok, true);
});

after(async () => {
  const venueIds = [ids.venue, ids.venue2].filter(Boolean);
  if (venueIds.length) {
    await db.delete(notifications).where(inArray(notifications.userId, [ids.owner, ids.admin]));
    await db.delete(venueImages).where(inArray(venueImages.venueId, venueIds));
    await db.delete(venueHalls).where(inArray(venueHalls.venueId, venueIds));
    await db.delete(venues).where(inArray(venues.id, venueIds));
  }
  if (ids.org) {
    await db.delete(partnerOrganizationMembers).where(eq(partnerOrganizationMembers.organizationId, ids.org));
    await db.delete(partnerOrganizations).where(eq(partnerOrganizations.id, ids.org));
  }
  await db.delete(users).where(inArray(users.id, [ids.owner, ids.admin].filter(Boolean)));
});

test("queue includes the first pending venue", async () => {
  const pending = await listPendingPartnerVenues();
  assert.ok(pending.some((row) => row.id === ids.venue));
});

test("approve first venue activates venue, pending halls and pending org", async () => {
  const result = await approvePartnerVenue(ids.venue);
  assert.equal(result.ok, true, JSON.stringify(result));
  const [venue] = await db.select().from(venues).where(eq(venues.id, ids.venue));
  assert.equal(venue.isActive, true);
  const halls = await db.select({ status: venueHalls.status }).from(venueHalls).where(eq(venueHalls.venueId, ids.venue));
  assert.ok(halls.every((hall) => hall.status === "active"));
  const [org] = await db.select({ status: partnerOrganizations.status }).from(partnerOrganizations).where(eq(partnerOrganizations.id, ids.org));
  assert.equal(org.status, "active");
  const notices = await db.select().from(notifications).where(eq(notifications.userId, ids.owner));
  assert.ok(notices.some((row) => row.type === "registration_approved"));
  const adminNotices = await db.select().from(notifications).where(eq(notifications.userId, ids.admin));
  assert.ok(adminNotices.some((row) => row.type === "registration_approved"));
});

test("second venue with user_id NULL appears in the queue and approve does not deactivate the first", async () => {
  const venue2 = await saveVenueDraft(appUser(ids.owner), {
    organizationId: ids.org,
    name: MARK + "Local 2",
    phone: PHONE,
    city: "Chișinău",
    address: "str. Armenească 5",
    imageUrls: ["https://example.com/cover2.jpg"],
  });
  assert.equal(venue2.ok, true);
  if (!venue2.ok) throw new Error("venue 2");
  ids.venue2 = venue2.venue.id;
  assert.equal(venue2.venue.userId, null);
  await saveHallDraft({
    venueId: ids.venue2,
    nameRo: "VIP",
    capacityMin: 10,
    capacityMax: 40,
    imageUrls: [],
  });
  const submitted = await submitVenueForApproval(ids.venue2);
  assert.equal(submitted.ok, true);
  const pending = await listPendingPartnerVenues();
  assert.ok(pending.some((row) => row.id === ids.venue2 && row.userId == null));
  const result = await approvePartnerVenue(ids.venue2);
  assert.equal(result.ok, true, JSON.stringify(result));
  const [first] = await db.select({ isActive: venues.isActive }).from(venues).where(eq(venues.id, ids.venue));
  const [second] = await db.select({ isActive: venues.isActive, userId: venues.userId }).from(venues).where(eq(venues.id, ids.venue2));
  assert.equal(first.isActive, true);
  assert.equal(second.isActive, true);
  assert.equal(second.userId, null);
  const [org] = await db.select({ status: partnerOrganizations.status }).from(partnerOrganizations).where(eq(partnerOrganizations.id, ids.org));
  assert.equal(org.status, "active");
});

test("reject keeps the venue draft and does not delete onboarding work", async () => {
  const [draft] = await db
    .insert(venues)
    .values({
      nameRo: MARK + "Reject Me",
      slug: MARK + "reject",
      organizationId: ids.org,
      userId: null,
      isActive: false,
      city: "Chișinău",
      address: "str. Test 3",
    })
    .returning();
  const [hall] = await db
    .insert(venueHalls)
    .values({
      venueId: draft.id,
      slug: "sala",
      nameRo: "Sala",
      status: "pending",
      capacityMin: 10,
      capacityMax: 20,
    })
    .returning({ id: venueHalls.id });
  await db.insert(venueImages).values({
    venueId: draft.id,
    url: "https://example.com/reject.jpg",
    sortOrder: 0,
    isCover: true,
  });
  const rejected = await rejectPartnerVenue(draft.id);
  assert.equal(rejected.ok, true);
  const [kept] = await db.select().from(venues).where(eq(venues.id, draft.id));
  assert.ok(kept);
  assert.equal(kept.isActive, false);
  const [hallRow] = await db.select({ status: venueHalls.status }).from(venueHalls).where(eq(venueHalls.id, hall.id));
  assert.equal(hallRow.status, "rejected");
  const [org] = await db.select({ status: partnerOrganizations.status }).from(partnerOrganizations).where(eq(partnerOrganizations.id, ids.org));
  assert.equal(org.status, "active", "rejecting an extra venue must not deactivate an already active org");
  const resubmit = await submitVenueForApproval(draft.id);
  assert.equal(resubmit.ok, true, JSON.stringify(resubmit));
  const [hallPending] = await db.select({ status: venueHalls.status }).from(venueHalls).where(eq(venueHalls.id, hall.id));
  assert.equal(hallPending.status, "pending");
  await db.delete(venueImages).where(eq(venueImages.venueId, draft.id));
  await db.delete(venueHalls).where(eq(venueHalls.venueId, draft.id));
  await db.delete(venues).where(eq(venues.id, draft.id));
});

test("valid contract is still required for the organization", async () => {
  assert.equal(await organizationHasValidContract(ids.org), true);
});
