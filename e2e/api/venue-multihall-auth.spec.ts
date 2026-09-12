import { test, expect, request as pwRequest } from "@playwright/test";
import { ARTIST_STATE, CLIENT_STATE } from "../helpers/paths";
import { sql, getTestUsers, testBaseUrl } from "../helpers/db";

// ADR 0028 / Phase 2 — HTTP-level authorization for the org → venue → hall
// membership resolver (src/lib/venue-access.ts).
//
// A signed-in NON-owner (Igor owns an artist row, not this venue) must not be
// able to mutate a venue or its gallery — the IDOR guarantee from the master
// document. The resolver logic itself (membership vs legacy vs admin, cross-org
// denial, disabled/removed/demoted members, forged hall id) is covered
// exhaustively as a DB-level regression in
// scripts/venue-multihall-access-regression.test.ts; this spec verifies the
// wiring end-to-end against the running API.
//
// #10 test safety:
//   - refuses to run against a production host/DB (no epetrecere.md default);
//   - operates ONLY on an isolated fixture venue it creates and deletes,
//     never the first real catalog row.
//
// Requires a running, Clerk-authenticated server + seeded personas (ARTIST_STATE).
// Run: E2E_BASE_URL=http://localhost:3000 npx playwright test e2e/api/venue-multihall-auth.spec.ts

// Central guards (helpers/db) refuse a non-test database at import time and a
// production baseURL here. There is no ALLOW_PROD override.
const BASE = testBaseUrl();

const MARK = "mh_e2e_";

test.describe.serial("venue multi-hall auth (ADR 0028 / Phase 2)", () => {
  let venueId: number;
  let imageId: number;
  let organizationId: number;
  let ownerUserId: string;

  test.beforeAll(async () => {
    const { client } = await getTestUsers();
    ownerUserId = client.id as string;
    // Isolated fixtures only — never the real first venue.
    const [org] = await sql`insert into partner_organizations (display_name) values (${MARK + "org"}) returning id`;
    organizationId = org.id as number;
    await sql`
      insert into partner_organization_members (organization_id, user_id, role, is_active)
      values (${organizationId}, ${ownerUserId}, 'owner', true)
    `;
    const [venue] = await sql`
      insert into venues (name_ro, slug, organization_id, is_active)
      values (${MARK + "venue"}, ${MARK + "venue-" + Date.now()}, ${org.id}, false)
      returning id`;
    venueId = venue.id as number;
    // A hall makes the fixture realistic and exercises the composite FKs.
    await sql`insert into venue_halls (venue_id, slug, name_ro) values (${venueId}, 'principal', ${MARK + "hall"})`;
    const [img] = await sql`
      insert into venue_images (venue_id, url) values (${venueId}, ${"https://example.com/" + MARK + "img.jpg"}) returning id`;
    imageId = img.id as number;
  });

  test.afterAll(async () => {
    await sql`delete from venue_images where venue_id = ${venueId}`;
    await sql`delete from venue_halls where venue_id = ${venueId}`;
    const [row] = await sql`select organization_id from venues where id = ${venueId}`;
    await sql`delete from venues where id = ${venueId}`;
    await sql`delete from partner_organization_members where organization_id = ${organizationId}`;
    if (row?.organization_id) await sql`delete from partner_organizations where id = ${row.organization_id}`;
  });

  test("PUT /api/venues/[id] anonymous → 401, fixture unchanged", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE });
    const res = await req.put(`/api/venues/${venueId}`, { data: { nameRo: "PWNED anon" } });
    expect(res.status()).toBe(401);
    const [row] = await sql`select name_ro from venues where id = ${venueId}`;
    expect(row.name_ro).toBe(MARK + "venue");
  });

  test("PUT /api/venues/[id] signed-in non-owner (Igor) → 403, fixture unchanged", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE, storageState: ARTIST_STATE });
    const res = await req.put(`/api/venues/${venueId}`, { data: { nameRo: "PWNED Igor" } });
    expect(res.status()).toBe(403);
    const [row] = await sql`select name_ro from venues where id = ${venueId}`;
    expect(row.name_ro).toBe(MARK + "venue");
  });

  test("POST /api/venue-images non-owner (Igor) → 403, no image added", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE, storageState: ARTIST_STATE });
    const res = await req.post(`/api/venue-images`, {
      data: { venueId, url: "https://example.com/pwned.jpg", isCover: false },
    });
    expect(res.status()).toBe(403);
    const leaked = await sql`select id from venue_images where venue_id = ${venueId} and url = 'https://example.com/pwned.jpg'`;
    expect(leaked.length).toBe(0);
  });

  test("DELETE /api/venue-images non-owner (Igor) → 403, fixture image kept", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE, storageState: ARTIST_STATE });
    const res = await req.delete(`/api/venue-images?id=${imageId}`);
    expect(res.status()).toBe(403);
    const [still] = await sql`select id from venue_images where id = ${imageId}`;
    expect(still?.id).toBe(imageId);
  });

  test("active owner membership can update its venue", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE, storageState: CLIENT_STATE });
    const res = await req.put(`/api/venues/${venueId}`, {
      data: { nameRo: MARK + "venue-updated" },
    });
    expect(res.status()).toBe(200);
    const [row] = await sql`select name_ro from venues where id = ${venueId}`;
    expect(row.name_ro).toBe(MARK + "venue-updated");
  });

  test("manager cannot edit profile fields reserved for owner/admin", async () => {
    await sql`
      update partner_organization_members set role = 'manager', updated_at = now()
      where organization_id = ${organizationId} and user_id = ${ownerUserId}
    `;
    const req = await pwRequest.newContext({ baseURL: BASE, storageState: CLIENT_STATE });
    const res = await req.put(`/api/venues/${venueId}`, { data: { nameRo: "forbidden" } });
    expect(res.status()).toBe(403);
    await sql`
      update partner_organization_members set role = 'owner', updated_at = now()
      where organization_id = ${organizationId} and user_id = ${ownerUserId}
    `;
  });

  test("deactivated membership loses access immediately", async () => {
    await sql`
      update partner_organization_members set is_active = false, updated_at = now()
      where organization_id = ${organizationId} and user_id = ${ownerUserId}
    `;
    const req = await pwRequest.newContext({ baseURL: BASE, storageState: CLIENT_STATE });
    expect((await req.put(`/api/venues/${venueId}`, { data: { nameRo: "forbidden" } })).status()).toBe(403);
    await sql`
      update partner_organization_members set is_active = true, updated_at = now()
      where organization_id = ${organizationId} and user_id = ${ownerUserId}
    `;
  });

  test("suspended organization denies every member", async () => {
    await sql`update partner_organizations set status = 'suspended' where id = ${organizationId}`;
    const req = await pwRequest.newContext({ baseURL: BASE, storageState: CLIENT_STATE });
    expect((await req.put(`/api/venues/${venueId}`, { data: { nameRo: "forbidden" } })).status()).toBe(403);
    await sql`update partner_organizations set status = 'active' where id = ${organizationId}`;
  });

  test("organization partner account cannot submit a client booking", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE, storageState: CLIENT_STATE });
    const res = await req.post("/api/booking-requests", {
      data: {
        venueId,
        clientName: "Test Client",
        clientPhone: "+37360000000",
        eventDate: "2027-10-10",
      },
    });
    expect(res.status()).toBe(403);
  });
});
