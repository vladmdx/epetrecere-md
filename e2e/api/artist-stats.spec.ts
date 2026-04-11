import { test, expect, request as pwRequest } from "@playwright/test";
import { ARTIST_STATE, CLIENT_STATE } from "../helpers/paths";
import { sql, getIgorArtist } from "../helpers/db";

// F-A1 — Vendor dashboard stats endpoint.
//
// Before this fix `/dashboard` rendered four hardcoded zeros for every
// artist. The API route below is now the server-side contract that
// powers both the API endpoint and the server-component dashboard; this
// spec is its regression fence.
//
// What we cover:
//   1. Anonymous → 401
//   2. Signed-in non-artist (role=user) → 200 + `{ stats: null }`
//   3. Signed-in artist (Igor) → 200 + numeric stats matching the DB
//      (we seed one pending booking_request for him and tear it down)

const BASE = process.env.E2E_BASE_URL || "https://epetrecere.md";

test.describe.serial("artist stats dashboard (F-A1)", () => {
  let seededRequestId: number | null = null;
  let artistId: number;

  test.beforeAll(async () => {
    const igor = await getIgorArtist();
    artistId = igor.id;

    // Seed exactly one pending booking request so the stats assertion
    // has a reliable floor of 1. afterAll tears it down so the DB is
    // returned to its previous state.
    const [row] = await sql`
      insert into booking_requests
        (artist_id, client_name, client_phone, event_date, message, status)
      values
        (${artistId}, 'E2E Stats Seed', '+37369000001',
         ${new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10)},
         'seeded by artist-stats.spec.ts', 'pending')
      returning id
    `;
    seededRequestId = row.id as number;
  });

  test.afterAll(async () => {
    if (seededRequestId !== null) {
      await sql`delete from booking_requests where id = ${seededRequestId}`;
    }
  });

  test("GET /api/me/artist/stats anonymous → 401", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE });
    const res = await req.get("/api/me/artist/stats");
    expect(res.status()).toBe(401);
  });

  test("GET /api/me/artist/stats as client (no artist row) → 200 + null", async () => {
    const req = await pwRequest.newContext({
      baseURL: BASE,
      storageState: CLIENT_STATE,
    });
    const res = await req.get("/api/me/artist/stats");
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.stats).toBeNull();
  });

  test("GET /api/me/artist/stats as Igor → numeric stats including our seeded row", async () => {
    const req = await pwRequest.newContext({
      baseURL: BASE,
      storageState: ARTIST_STATE,
    });
    const res = await req.get("/api/me/artist/stats");
    expect(res.status(), await res.text()).toBe(200);
    const json = await res.json();
    expect(json.stats).toBeTruthy();

    const { stats } = json;
    // All five fields are present and numeric (ratingAvg may be null).
    expect(typeof stats.pendingRequests).toBe("number");
    expect(typeof stats.profileViews30d).toBe("number");
    expect(typeof stats.ratingCount).toBe("number");
    expect(typeof stats.confirmedThisMonth).toBe("number");

    // Our seeded pending request must show up in the count.
    expect(stats.pendingRequests).toBeGreaterThanOrEqual(1);

    // Cross-check against the DB: the endpoint's pendingRequests must
    // match the raw SQL count. If this ever drifts we have a bug in
    // the helper, not the test.
    const [dbPending] = await sql`
      select count(*)::int as c
      from booking_requests
      where artist_id = ${artistId} and status = 'pending'
    `;
    expect(stats.pendingRequests).toBe(dbPending.c as number);
  });
});
