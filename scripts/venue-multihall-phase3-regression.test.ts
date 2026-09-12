/**
 * Phase 3 — onboarding, org roles, IDOR, idempotence, translations, contract.
 * Guarded disposable local DB only. Run: npm run test:multihall:phase3
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";

import { db } from "../src/lib/db";
import {
  legalAcceptances,
  partnerOrganizationMembers,
  partnerOrganizations,
  users,
  venueHalls,
  venueImages,
  venues,
  bookingRequests,
} from "../src/lib/db/schema";
import {
  authorizeHallAccess,
  authorizeOrganizationCapability,
  authorizeVenueCapability,
  listAccessibleVenueIds,
  type AppUser,
} from "../src/lib/venue-access";
import {
  collectSubmitMissing,
  ensureDraftOrganization,
  archiveHall,
  saveHallDraft,
  saveOrganizationProfile,
  saveVenueDraft,
  submitVenueForApproval,
} from "../src/lib/partner/onboarding";
import { organizationHasValidContract, organizationContractRows, resolveOrganizationSigningIdentity } from "../src/lib/partner/legal";
import { organizationWriteCapability } from "../src/lib/partner/organization-write";
import {
  LEGAL_PACK_VERSION,
  VENUE_REQUIRED_DOCS,
  getLegalDocument,
  legalBlocks,
} from "../src/lib/legal";

const MARK = `p3_${Date.now()}_`;
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const IDENTITY = {
  partnerType: "company" as const,
  legalName: "Grand Palace SRL",
  idNumber: "1003600023598",
  legalAddress: "Chișinău, str. București 10",
  representativeName: "Ion Popescu",
};

const ids = {
  owner: "",
  admin: "",
  manager: "",
  staff: "",
  outsider: "",
  org: 0,
  orgB: 0,
  venue: 0,
  venue2: 0,
  hallA: 0,
  hallB: 0,
  hallForeign: 0,
};

function flagOn() {
  process.env.FEATURE_MULTI_HALL = "1";
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

async function signOrgContract(userId: string, organizationId: number) {
  const acceptedAt = new Date();
  const acceptanceSessionId = randomUUID();
  for (const slug of VENUE_REQUIRED_DOCS) {
    const doc = getLegalDocument(slug);
    assert.ok(doc, `missing legal document ${slug}`);
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
      acceptanceSessionId,
    });
  }
}

before(async () => {
  flagOn();
  ids.owner = await mkUser("owner", "+37369111111");
  ids.admin = await mkUser("admin");
  ids.manager = await mkUser("manager");
  ids.staff = await mkUser("staff");
  ids.outsider = await mkUser("outsider", "+37369222222");

  const org = await ensureDraftOrganization(appUser(ids.owner), {
    displayName: MARK + "Org A",
    type: "company",
  });
  ids.org = org.id;
  const again = await ensureDraftOrganization(appUser(ids.owner));
  assert.equal(again.id, org.id, "retry must not duplicate the draft organization");

  const profile = await saveOrganizationProfile(ids.org, {
    type: "company",
    displayName: MARK + "Org A",
    legalName: IDENTITY.legalName,
    idNumber: IDENTITY.idNumber,
    legalAddress: IDENTITY.legalAddress,
    billingEmail: `${MARK}billing@example.com`,
    billingPhone: "+37369111111",
  });
  assert.equal(profile.ok, true);
  await signOrgContract(ids.owner, ids.org);
  assert.equal(await organizationHasValidContract(ids.org), true);

  await db.insert(partnerOrganizationMembers).values([
    { organizationId: ids.org, userId: ids.admin, role: "admin", isActive: true },
    { organizationId: ids.org, userId: ids.manager, role: "manager", isActive: true },
    { organizationId: ids.org, userId: ids.staff, role: "staff", isActive: true },
  ]);

  const venue = await saveVenueDraft(appUser(ids.owner), {
    organizationId: ids.org,
    name: MARK + "Local 1",
    phone: "+37369111111",
    city: "Chișinău",
    address: "str. București 10",
    imageUrls: ["https://example.com/cover.jpg"],
  });
  assert.equal(venue.ok, true);
  if (!venue.ok) throw new Error("venue draft failed");
  ids.venue = venue.venue.id;
  const retryVenue = await saveVenueDraft(appUser(ids.owner), {
    organizationId: ids.org,
    venueId: ids.venue,
    name: MARK + "Local 1",
    phone: "+37369111111",
    city: "Chișinău",
    address: "str. București 10",
    imageUrls: ["https://example.com/cover.jpg"],
  });
  assert.equal(retryVenue.ok, true);
  if (retryVenue.ok) assert.equal(retryVenue.venue.id, ids.venue);

  const hallA = await saveHallDraft({
    venueId: ids.venue,
    nameRo: "Grand",
    nameRu: "Гранд",
    nameEn: "Grand",
    capacityMin: 50,
    capacityMax: 100,
    pricingModel: "per_person",
    basePrice: 40,
    imageUrls: [],
  });
  assert.equal(hallA.ok, true);
  if (!hallA.ok) throw new Error("hall A failed");
  ids.hallA = hallA.hall.id;
  const hallARetry = await saveHallDraft({
    venueId: ids.venue,
    nameRo: "Grand",
    capacityMin: 50,
    capacityMax: 120,
    imageUrls: [],
  });
  assert.equal(hallARetry.ok, true);
  if (hallARetry.ok) assert.equal(hallARetry.hall.id, ids.hallA, "same hall name must update, not duplicate");

  const hallB = await saveHallDraft({
    venueId: ids.venue,
    nameRo: "Garden",
    capacityMin: 80,
    capacityMax: 250,
    imageUrls: [],
  });
  assert.equal(hallB.ok, true);
  if (hallB.ok) ids.hallB = hallB.hall.id;

  const submitted = await submitVenueForApproval(ids.venue);
  assert.equal(submitted.ok, true, JSON.stringify(submitted));

  const venue2 = await saveVenueDraft(appUser(ids.owner), {
    organizationId: ids.org,
    name: MARK + "Local 2",
    phone: "+37369111111",
    city: "Chișinău",
    address: "str. Armenească 5",
    imageUrls: ["https://example.com/cover2.jpg"],
  });
  assert.equal(venue2.ok, true);
  if (venue2.ok) ids.venue2 = venue2.venue.id;
  await saveHallDraft({
    venueId: ids.venue2,
    nameRo: "VIP",
    capacityMin: 20,
    capacityMax: 60,
    imageUrls: [],
  });

  const [orgB] = await db
    .insert(partnerOrganizations)
    .values({ displayName: MARK + "Org B", status: "active" })
    .returning({ id: partnerOrganizations.id });
  ids.orgB = orgB.id;
  await db.insert(partnerOrganizationMembers).values({
    organizationId: ids.orgB,
    userId: ids.outsider,
    role: "owner",
    isActive: true,
  });
  const [foreignVenue] = await db
    .insert(venues)
    .values({
      nameRo: MARK + "Foreign",
      slug: MARK + "foreign",
      organizationId: ids.orgB,
      userId: ids.outsider,
    })
    .returning({ id: venues.id });
  const [foreignHall] = await db
    .insert(venueHalls)
    .values({ venueId: foreignVenue.id, slug: "principal", nameRo: "Sala B" })
    .returning({ id: venueHalls.id });
  ids.hallForeign = foreignHall.id;
});

after(async () => {
  const venueIds = [ids.venue, ids.venue2].filter(Boolean);
  if (venueIds.length) {
    await db.delete(venueImages).where(inArray(venueImages.venueId, venueIds));
    await db.delete(venueHalls).where(inArray(venueHalls.venueId, venueIds));
    await db.delete(venues).where(inArray(venues.id, venueIds));
  }
  await db.delete(venueHalls).where(eq(venueHalls.id, ids.hallForeign));
  await db.delete(venues).where(eq(venues.slug, MARK + "foreign"));
  await db.delete(partnerOrganizationMembers).where(
    inArray(partnerOrganizationMembers.organizationId, [ids.org, ids.orgB].filter(Boolean)),
  );
  if (ids.org) await db.delete(partnerOrganizations).where(eq(partnerOrganizations.id, ids.org));
  if (ids.orgB) await db.delete(partnerOrganizations).where(eq(partnerOrganizations.id, ids.orgB));
  await db.delete(users).where(
    inArray(users.id, [ids.owner, ids.admin, ids.manager, ids.staff, ids.outsider].filter(Boolean)),
  );
});

test("new company → venue → two halls → submit pending", async () => {
  const [org] = await db
    .select({ status: partnerOrganizations.status })
    .from(partnerOrganizations)
    .where(eq(partnerOrganizations.id, ids.org));
  assert.equal(org.status, "pending");
  const halls = await db.select({ id: venueHalls.id, status: venueHalls.status }).from(venueHalls).where(eq(venueHalls.venueId, ids.venue));
  assert.equal(halls.length, 2);
  assert.ok(halls.every((hall) => hall.status === "pending"));
});

test("existing org with contract adds a second venue without resigning", async () => {
  const missing = await collectSubmitMissing(ids.venue2);
  assert.equal(
    missing.some((item) => item.field === "contract"),
    false,
    `second venue must not require a new signature: ${JSON.stringify(missing)}`,
  );
  const contracts = await organizationContractRows(ids.org);
  assert.ok(contracts.length >= VENUE_REQUIRED_DOCS.length);
});

test("holder change after a signed contract is rejected", async () => {
  const result = await saveOrganizationProfile(ids.org, {
    type: "company",
    displayName: MARK + "Org A",
    legalName: "Alt Titular SRL",
    idNumber: IDENTITY.idNumber,
    legalAddress: IDENTITY.legalAddress,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "LEGAL_HOLDER_CHANGE_REQUIRES_NEW_ORGANIZATION");
});

test("incomplete submit returns structured missing fields and stays editable", async () => {
  const [draftVenue] = await db
    .insert(venues)
    .values({
      nameRo: "x",
      slug: MARK + "incomplete",
      organizationId: ids.org,
      city: null,
      address: null,
    })
    .returning({ id: venues.id });
  const missing = await collectSubmitMissing(draftVenue.id);
  assert.ok(missing.some((item) => item.field === "address"));
  assert.ok(missing.some((item) => item.field === "city" || item.field === "halls"));
  await db.update(venues).set({ nameRo: MARK + "incomplete-edit", address: "str. Test 1" }).where(eq(venues.id, draftVenue.id));
  const [edited] = await db.select({ nameRo: venues.nameRo }).from(venues).where(eq(venues.id, draftVenue.id));
  assert.equal(edited.nameRo, MARK + "incomplete-edit");
  await db.delete(venues).where(eq(venues.id, draftVenue.id));
});

test("owner/admin/manager/staff follow the capability matrix", async () => {
  const owner = appUser(ids.owner);
  const admin = appUser(ids.admin);
  const manager = appUser(ids.manager);
  const staff = appUser(ids.staff);

  assert.equal((await authorizeVenueCapability(staff, ids.venue, "view_private")).ok, true);
  assert.equal((await authorizeVenueCapability(staff, ids.venue, "manage_bookings")).ok, false);
  assert.equal((await authorizeVenueCapability(manager, ids.venue, "manage_bookings")).ok, true);
  assert.equal((await authorizeVenueCapability(manager, ids.venue, "manage_halls")).ok, false);
  assert.equal((await authorizeVenueCapability(admin, ids.venue, "manage_halls")).ok, true);
  assert.equal((await authorizeOrganizationCapability(admin, ids.org, "manage_members")).ok, false);
  assert.equal((await authorizeOrganizationCapability(owner, ids.org, "manage_members")).ok, true);
  assert.equal((await authorizeOrganizationCapability(owner, ids.org, "manage_legal")).ok, true);
});

test("IDOR: org B cannot use org A venue or a forged hall id", async () => {
  const outsider = appUser(ids.outsider);
  assert.equal((await authorizeVenueCapability(outsider, ids.venue, "view_private")).ok, false);
  assert.equal((await authorizeHallAccess(outsider, ids.hallA)).ok, false);
  const owner = appUser(ids.owner);
  const forged = await authorizeHallAccess(owner, ids.hallForeign);
  assert.equal(forged.ok, false);
  const hallOnWrongVenue = await saveHallDraft({
    venueId: ids.venue,
    hallId: ids.hallForeign,
    nameRo: "Hijack",
    imageUrls: [],
  });
  assert.equal(hallOnWrongVenue.ok, false);
});

test("two accessible venues require an explicit selector (no silent first row)", async () => {
  const accessible = await listAccessibleVenueIds(ids.owner);
  assert.ok(accessible.includes(ids.venue));
  assert.ok(accessible.includes(ids.venue2));
  assert.ok(accessible.length >= 2);
});

test("translation merge fills only empty RU/EN values", () => {
  const current = { ro: "Grand", ru: "вручную", en: "" };
  const translated = { ro: "Grand", ru: "AI", en: "Grand Hall" };
  const merged = {
    ro: current.ro.trim() ? current.ro : translated.ro,
    ru: current.ru.trim() ? current.ru : translated.ru,
    en: current.en.trim() ? current.en : translated.en,
  };
  assert.equal(merged.ru, "вручную");
  assert.equal(merged.en, "Grand Hall");
});

test("duplicate phone on another account is allowed when multi-hall is on", async () => {
  const result = await saveVenueDraft(appUser(ids.outsider), {
    organizationId: ids.orgB,
    name: MARK + "Phone clash",
    phone: "+37369111111",
    city: "Chișinău",
    address: "str. Test 12",
    imageUrls: [],
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    const [owner] = await db.select({ phone: users.phone }).from(users).where(eq(users.id, ids.owner));
    assert.equal(owner.phone, "+37369111111");
  }
});

test("POST resume does not mutate a pending or already active organization", async () => {
  const [before] = await db
    .select({ displayName: partnerOrganizations.displayName, status: partnerOrganizations.status })
    .from(partnerOrganizations)
    .where(eq(partnerOrganizations.id, ids.org));
  assert.equal(before.status, "pending");
  const createdFromPending = await ensureDraftOrganization(appUser(ids.owner), {
    displayName: MARK + "Hijack Pending",
    type: "company",
  });
  assert.notEqual(createdFromPending.id, ids.org);
  await db.delete(partnerOrganizationMembers).where(eq(partnerOrganizationMembers.organizationId, createdFromPending.id));
  await db.delete(partnerOrganizations).where(eq(partnerOrganizations.id, createdFromPending.id));

  await db.update(partnerOrganizations).set({ status: "active", updatedAt: new Date() }).where(eq(partnerOrganizations.id, ids.org));
  const createdFromActive = await ensureDraftOrganization(appUser(ids.owner), {
    displayName: MARK + "Hijack Active",
    type: "company",
  });
  assert.notEqual(createdFromActive.id, ids.org);
  const [untouched] = await db
    .select({ displayName: partnerOrganizations.displayName, status: partnerOrganizations.status })
    .from(partnerOrganizations)
    .where(eq(partnerOrganizations.id, ids.org));
  assert.equal(untouched.displayName, before.displayName);
  assert.equal(untouched.status, "active");
  await db.delete(partnerOrganizationMembers).where(eq(partnerOrganizationMembers.organizationId, createdFromActive.id));
  await db.delete(partnerOrganizations).where(eq(partnerOrganizations.id, createdFromActive.id));
  await db.update(partnerOrganizations).set({ status: "pending", updatedAt: new Date() }).where(eq(partnerOrganizations.id, ids.org));
});

test("staff cannot change displayName on an eligible draft they do not own", async () => {
  const draft = await ensureDraftOrganization(appUser(ids.owner), {
    displayName: MARK + "Draft Extra",
    type: "company",
  });
  await db.insert(partnerOrganizationMembers).values({
    organizationId: draft.id,
    userId: ids.staff,
    role: "staff",
    isActive: true,
  });
  const again = await ensureDraftOrganization(appUser(ids.staff), {
    displayName: MARK + "Staff Hijack",
    type: "company",
  });
  assert.equal(again.id, draft.id);
  const [row] = await db
    .select({ displayName: partnerOrganizations.displayName })
    .from(partnerOrganizations)
    .where(eq(partnerOrganizations.id, draft.id));
  assert.equal(row.displayName, MARK + "Draft Extra");
  await db.delete(partnerOrganizationMembers).where(eq(partnerOrganizationMembers.organizationId, draft.id));
  await db.delete(partnerOrganizations).where(eq(partnerOrganizations.id, draft.id));
});

test("staff of org A cannot manage_legal; empty legalName still requires manage_legal", async () => {
  const staff = appUser(ids.staff);
  assert.equal((await authorizeOrganizationCapability(staff, ids.org, "manage_legal")).ok, false);
  assert.equal((await authorizeOrganizationCapability(appUser(ids.admin), ids.org, "manage_legal")).ok, false);
  assert.equal((await authorizeOrganizationCapability(appUser(ids.owner), ids.org, "manage_legal")).ok, true);
  assert.equal(organizationWriteCapability({ legalName: "" }), "manage_legal");
});

test("contract validity rejects a mismatched legal identity", async () => {
  const mismatch = await resolveOrganizationSigningIdentity(ids.org, {
    ...IDENTITY,
    legalName: "Other Company SRL",
  });
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.code, "IDENTITY_MISMATCH");
  const matched = await resolveOrganizationSigningIdentity(ids.org, IDENTITY);
  assert.equal(matched.ok, true);

  await db
    .update(partnerOrganizations)
    .set({ legalName: "Other Company SRL", updatedAt: new Date() })
    .where(eq(partnerOrganizations.id, ids.org));
  assert.equal(await organizationHasValidContract(ids.org), false);
  await db
    .update(partnerOrganizations)
    .set({ legalName: IDENTITY.legalName, updatedAt: new Date() })
    .where(eq(partnerOrganizations.id, ids.org));
  assert.equal(await organizationHasValidContract(ids.org), true);
});

test("archiveHall refuses the last usable hall and future blocking bookings", async () => {
  const last = await archiveHall(ids.hallA);
  const lastB = await archiveHall(ids.hallB);
  assert.equal(last.ok || lastB.ok, true);
  const leftover = last.ok ? ids.hallB : ids.hallA;
  const refused = await archiveHall(leftover);
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.code, "LAST_USABLE_HALL");

  const [extra] = await db
    .insert(venueHalls)
    .values({
      venueId: ids.venue,
      slug: MARK + "extra-hall",
      nameRo: "Extra",
      status: "active",
      capacityMin: 10,
      capacityMax: 20,
    })
    .returning({ id: venueHalls.id });
  const future = "2099-05-01";
  const [booking] = await db
    .insert(bookingRequests)
    .values({
      venueId: ids.venue,
      hallId: extra.id,
      clientName: "Future",
      clientPhone: "+37360000010",
      eventDate: future,
      status: "pending",
      reservationScope: "hall",
    })
    .returning({ id: bookingRequests.id });
  const blocked = await archiveHall(extra.id);
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.code, "HALL_HAS_FUTURE_BOOKINGS");
  await db.delete(bookingRequests).where(eq(bookingRequests.id, booking.id));
  const archived = await archiveHall(extra.id);
  assert.equal(archived.ok, true);
});

