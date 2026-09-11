import { test, expect, request as pwRequest } from "@playwright/test";
import { ARTIST_STATE } from "../helpers/paths";
import { sql, getTestUsers } from "../helpers/db";

// ADR 0028 / Phase 2 — HTTP-level authorization for the org → venue → hall
// membership resolver (src/lib/venue-access.ts).
//
// These assert that ownership gates now flow through requireVenueAccess and
// that a signed-in NON-owner (Igor, who owns an artist row, not this venue)
// cannot mutate a venue or its gallery — the IDOR guarantee from the master
// document. The underlying resolver logic (membership vs legacy vs admin,
// cross-org denial, forged hall id) is covered exhaustively as a DB-level
// regression in scripts/venue-multihall-access-regression.test.ts; this spec
// verifies the wiring end-to-end against the running API.
//
// Requires a running, Clerk-authenticated server + seeded personas (the setup
// project provides ARTIST_STATE). Run with:
//   E2E_BASE_URL=http://localhost:3000 npx playwright test e2e/api/venue-multihall-auth.spec.ts

const BASE = process.env.E2E_BASE_URL || "https://epetrecere.md";

test.describe.serial("venue multi-hall auth (ADR 0028 / Phase 2)", () => {
  let venueId: number;
  let originalNameRo: string;

  test.beforeAll(async () => {
    await getTestUsers();
    const [row] = await sql`select id, name_ro from venues order by id asc limit 1`;
    if (!row) throw new Error("No venues in the DB — seed at least one.");
    venueId = row.id as number;
    originalNameRo = row.name_ro as string;
  });

  test.afterAll(async () => {
    await sql`update venues set name_ro = ${originalNameRo} where id = ${venueId}`;
  });

  test("PUT /api/venues/[id] anonymous → 401, row unchanged", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE });
    const res = await req.put(`/api/venues/${venueId}`, { data: { nameRo: "PWNED anon" } });
    expect(res.status()).toBe(401);
    const [row] = await sql`select name_ro from venues where id = ${venueId}`;
    expect(row.name_ro).toBe(originalNameRo);
  });

  test("PUT /api/venues/[id] signed-in non-owner (Igor) → 403, row unchanged", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE, storageState: ARTIST_STATE });
    const res = await req.put(`/api/venues/${venueId}`, { data: { nameRo: "PWNED Igor" } });
    expect(res.status()).toBe(403);
    const [row] = await sql`select name_ro from venues where id = ${venueId}`;
    expect(row.name_ro).toBe(originalNameRo);
  });

  test("POST /api/venue-images signed-in non-owner (Igor) → 403, no image added", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE, storageState: ARTIST_STATE });
    const res = await req.post(`/api/venue-images`, {
      data: { venueId, url: "https://example.com/pwned.jpg", isCover: false },
    });
    expect(res.status()).toBe(403);
    const leaked = await sql`
      select id from venue_images where venue_id = ${venueId} and url = 'https://example.com/pwned.jpg'
    `;
    expect(leaked.length).toBe(0);
  });

  test("DELETE /api/venue-images signed-in non-owner (Igor) → 403", async () => {
    const [img] = await sql`select id from venue_images where venue_id = ${venueId} order by id asc limit 1`;
    test.skip(!img, "no gallery image on the first venue to attempt deleting");
    const req = await pwRequest.newContext({ baseURL: BASE, storageState: ARTIST_STATE });
    const res = await req.delete(`/api/venue-images?id=${img.id}`);
    expect(res.status()).toBe(403);
    const [still] = await sql`select id from venue_images where id = ${img.id}`;
    expect(still?.id).toBe(img.id);
  });
});
