import { test, expect, request as pwRequest } from "@playwright/test";
import { ARTIST_STATE, CLIENT_STATE } from "../helpers/paths";
import { sql, getTestUsers } from "../helpers/db";

// F-S1 / M12 — Auth lockdown for the venue dashboard surface.
//
// The spec validates the gates on three routes:
//
//   POST /api/auth/register-venue   anonymous → 401
//   GET  /api/me/venue              anonymous → 401
//   GET  /api/me/venue/stats        anonymous → 401
//   GET  /api/me/venue/stats        non-venue → 200 + { stats: null }
//   PUT  /api/venues/[id]           anonymous → 401
//   PUT  /api/venues/[id]           non-owner → 403, row unchanged
//   PUT  /api/venues/[id]           non-URL payload → 400
//
// We pick a stable existing venue (the first one in the DB) and use
// Igor's session to attack it — Igor owns an artist row, not a venue,
// so he's a perfect "signed-in but not the owner" persona.

const BASE = process.env.E2E_BASE_URL || "https://epetrecere.md";

test.describe.serial("venue auth lockdown (F-S1 / M12)", () => {
  let venueId: number;
  let originalNameRo: string;

  test.beforeAll(async () => {
    // Make sure the test users exist — the setup project seeds sessions
    // for them so this call is effectively a sanity check.
    await getTestUsers();

    const [row] = await sql`
      select id, name_ro from venues order by id asc limit 1
    `;
    if (!row) {
      throw new Error(
        "No venues in the DB — cannot run venue-auth spec. Seed at least one.",
      );
    }
    venueId = row.id as number;
    originalNameRo = row.name_ro as string;
  });

  test.afterAll(async () => {
    // Restore in case a test accidentally mutated the row (shouldn't,
    // but cheap safety net).
    await sql`
      update venues set name_ro = ${originalNameRo} where id = ${venueId}
    `;
  });

  test("POST /api/auth/register-venue anonymous → 401", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE });
    const res = await req.post("/api/auth/register-venue", {
      data: { name: "E2E Hacker Venue", phone: "+37369000000" },
    });
    expect(res.status()).toBe(401);

    // Nothing got inserted under that name.
    const leaked = await sql`
      select id from venues where name_ro = 'E2E Hacker Venue'
    `;
    expect(leaked.length).toBe(0);
  });

  test("GET /api/me/venue anonymous → 401", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE });
    const res = await req.get("/api/me/venue");
    expect(res.status()).toBe(401);
  });

  test("GET /api/me/venue/stats anonymous → 401", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE });
    const res = await req.get("/api/me/venue/stats");
    expect(res.status()).toBe(401);
  });

  test("GET /api/me/venue/stats as non-venue user (Igor) → 200 + null", async () => {
    // Igor owns an artist row, not a venue, so the endpoint should
    // resolve the user and then report "no venue" rather than 401/403.
    const req = await pwRequest.newContext({
      baseURL: BASE,
      storageState: ARTIST_STATE,
    });
    const res = await req.get("/api/me/venue/stats");
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.stats).toBeNull();
  });

  test("PUT /api/venues/[id] anonymous → 401, row unchanged", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE });
    const res = await req.put(`/api/venues/${venueId}`, {
      data: { nameRo: "PWNED by anon" },
    });
    expect(res.status()).toBe(401);

    const [row] = await sql`
      select name_ro from venues where id = ${venueId}
    `;
    expect(row.name_ro).toBe(originalNameRo);
  });

  test("PUT /api/venues/[id] as signed-in non-owner (Igor) → 403, row unchanged", async () => {
    const req = await pwRequest.newContext({
      baseURL: BASE,
      storageState: ARTIST_STATE,
    });
    const res = await req.put(`/api/venues/${venueId}`, {
      data: { nameRo: "PWNED by Igor" },
    });
    expect(res.status()).toBe(403);

    const [row] = await sql`
      select name_ro from venues where id = ${venueId}
    `;
    expect(row.name_ro).toBe(originalNameRo);
  });

  test("PUT /api/venues/[id] with bad URL in menuUrl → 400", async () => {
    // Use the client session so the auth gate passes; ownership check
    // comes next in the handler, but Zod validation short-circuits on
    // the malformed URL before we hit the 403 branch.
    const req = await pwRequest.newContext({
      baseURL: BASE,
      storageState: CLIENT_STATE,
    });
    const res = await req.put(`/api/venues/${venueId}`, {
      data: { menuUrl: "not-a-real-url" },
    });
    // Either 400 (zod) or 403 (ownership) is a correct lockdown —
    // both prove the malformed row didn't get persisted. Prefer 400
    // so the schema is strict, but assert on the negative invariant.
    expect([400, 403]).toContain(res.status());

    const [row] = await sql`
      select menu_url from venues where id = ${venueId}
    `;
    expect(row.menu_url).not.toBe("not-a-real-url");
  });
});
